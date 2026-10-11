import { ProviderOfflineError, ProviderProtocolError, mapHttpToError } from '../errors.js';

export function shortId(name) {
  return String(name || '').replace(/^models\//, '');
}

export function normalizeModels(json) {
  const arr = json?.models || [];
  return arr
    .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map(m => ({
      modelId: shortId(m.name),
      displayName: m.displayName || shortId(m.name),
      capabilities: { chat: true, streaming: true, tools: true, vision: true, reasoning: false, json: true, embeddings: false }
    }));
}

export function toGeminiContents(messages, model = null) {
  const out = [];
  const nativeIds = new Map(messages.flatMap(message=>(message.tool_calls || []).filter(call=>call.providerMetadata?.nativeId).map(call=>[call.id,call.providerMetadata.nativeId])));
  for (const m of messages) {
    const role = m.role || m.sender;
    if (role === 'system') continue;
    const parts = role === 'tool' ? [{functionResponse:{name:m.name,...(nativeIds.has(m.tool_call_id) ? {id:nativeIds.get(m.tool_call_id)} : {}),response:{result:String(m.content ?? '')}}}]
      : Array.isArray(m.content) ? m.content.map(part => part.type === 'image_url'
        ? {inlineData:{mimeType:part.image_url.url.split(';')[0].slice(5),data:part.image_url.url.split(',')[1]}}
        : {text:part.text || ''}) : m.content ? [{text:String(m.content)}] : [];
    for (const call of m.tool_calls || []) parts.push({functionCall:{name:call.function.name,args:JSON.parse(call.function.arguments),...(call.providerMetadata?.nativeId ? {id:call.providerMetadata.nativeId} : {})}, ...(call.providerMetadata?.thoughtSignature && (!model || call.providerMetadata.model === model) ? {thoughtSignature:call.providerMetadata.thoughtSignature} : {})});
    const targetRole = role === 'agent' || role === 'assistant' ? 'model' : 'user';
    if (!parts.length) continue;
    if (out.at(-1)?.role === targetRole) out.at(-1).parts.push(...parts);
    else out.push({role:targetRole,parts});
  }
  return out;
}

function systemInstruction(messages) {
  const sys = messages
    .filter(m => (m.role || m.sender) === 'system')
    .map(m => String(m.content ?? ''));
  if (!sys.length) return undefined;
  return { parts: [{ text: sys.join('\n') }] };
}

export async function discoverModels({ baseURL, apiKey, timeoutMs = 8000 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseURL}/v1beta/models?key=${encodeURIComponent(apiKey || '')}`, { signal: ctrl.signal });
  } catch (e) {
    clearTimeout(t);
    if (e.name === 'AbortError') throw new ProviderOfflineError('Timeout', { code: 'TIMEOUT' });
    throw new ProviderOfflineError(e.message || 'Endpoint unreachable', { code: 'UNREACHABLE' });
  } finally {
    clearTimeout(t);
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) throw mapHttpToError(res.status, await res.text());
  if (!res.ok) return [];
  try {
    return normalizeModels(await res.json());
  } catch {
    return [];
  }
}

export async function streamChat({ baseURL, apiKey, model, messages, tools = [], signal, onChunk, onReasoning, onToolCall }) {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const body = JSON.stringify({
    system_instruction: systemInstruction(messages),
    contents: toGeminiContents(messages, model),
    tools: tools.length ? [{ function_declarations: tools.map(t => ({ name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object' } })) }] : undefined,
    // History can contain function calls even when this request offers no tools.
    // Explicitly disable calling so Gemini concludes from the existing results.
    toolConfig: tools.length ? undefined : { functionCallingConfig: { mode: 'NONE' } },
    generationConfig: { temperature: 0.7, ...(onReasoning && /^gemini-(?:2\.5|[3-9](?:[.-]|$))/.test(shortId(model)) ? { thinkingConfig: { includeThoughts: true } } : {}) }
  });
  // Streaming lasts until completion or caller cancellation; no elapsed-time cutoff.
  let res;
  try {
    res = await fetch(`${baseURL}/v1beta/${modelPath}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey || '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal
    });
  } catch (e) {
    if (signal?.aborted || e.name === 'AbortError') throw e;
    throw new ProviderOfflineError(e.message || 'Endpoint unreachable', { code: 'UNREACHABLE' });
  }
  if (!res.ok) {
    throw mapHttpToError(res.status, await res.text(), { model });
  }
  let buffer = '';
  let finishReason = null;
  const decoder = new TextDecoder();
  const calls = new Map();
  const handleParts = parts => {
    for (const part of parts || []) {
      if (typeof part.text === 'string' && part.text) {
        if (part.thought) onReasoning?.(part.text);
        else onChunk(part.text);
      }
      if (part.functionCall) {
        const { name, args } = part.functionCall;
        if (typeof name !== 'string' || !name || !args || typeof args !== 'object' || Array.isArray(args)) {
          throw new ProviderProtocolError('Gemini returned a malformed function call');
        }
        const nativeId = part.functionCall.id;
        const key = nativeId || `call_${Date.now()}_${calls.size}`;
        if (!calls.has(key)) calls.set(key, { id:key, name, args: {}, providerMetadata:{model, ...(nativeId ? {nativeId} : {})} });
        if (part.thoughtSignature) calls.get(key).providerMetadata.thoughtSignature = part.thoughtSignature;
        Object.assign(calls.get(key).args, args);
      }
    }
  };
  const processData = data => {
    const payload = data.startsWith('data: ') ? data.slice(6).trim() : data.trim();
    if (!payload || payload === '[DONE]') return;
    let parsed;
    try { parsed = JSON.parse(payload); } catch { throw new ProviderProtocolError('Malformed Gemini stream event'); }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      for (const candidate of item.candidates || []) {
        if (candidate.finishReason) finishReason = candidate.finishReason;
        handleParts(candidate.content?.parts);
      }
    }
  };
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) processData(line.trim());
  }
  buffer += decoder.decode();
  if (buffer.trim()) processData(buffer.trim());
  if (finishReason !== 'STOP') {
    throw new ProviderProtocolError(`Gemini ended without a verified STOP completion (${finishReason || 'missing'})`);
  }
  const completedCalls = Array.from(calls.values(), call => ({ id: call.id, name: call.name, arguments: call.args, providerMetadata: call.providerMetadata }));
  for (const call of completedCalls) onToolCall(call);
  return { completed: true, finishReason };
}
