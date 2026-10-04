import { ProviderOfflineError, ProviderProtocolError, mapHttpToError } from '../errors.js';

export function buildHeaders(apiKey, custom = {}) {
  const h = { 'Content-Type': 'application/json', ...custom };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

export function normalizeOpenAIModels(json) {
  const arr = json?.data || [];
  return arr.map(m => ({
    modelId: m.id,
    displayName: m.id,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, reasoning: false, json: true, embeddings: false }
  }));
}

export async function discoverModels({ baseURL, apiKey, headers = {}, timeoutMs = 5000 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseURL}/v1/models`, { headers: buildHeaders(apiKey, headers), signal: ctrl.signal });
  } catch (e) {
    clearTimeout(t);
    if (e.name === 'AbortError') throw new ProviderOfflineError('Timeout', { code: 'TIMEOUT' });
    throw new ProviderOfflineError(e.message || 'Endpoint unreachable', { code: 'UNREACHABLE' });
  } finally {
    clearTimeout(t);
  }
  // Endpoint reachable but no usable model list (many compat servers lack it) → not fatal.
  if (!res.ok) return [];
  try {
    return normalizeOpenAIModels(await res.json());
  } catch {
    return [];
  }
}

export async function streamChat({ baseURL, apiKey, headers = {}, timeoutMs = 30000, model, messages, tools = [], signal, onChunk, onReasoning, onToolCall }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(apiKey, headers),
      body: JSON.stringify({
        model,
        messages,
        tools: tools.length ? tools.map(x => ({ type: 'function', function: { name: x.name, description: x.description, parameters: x.parameters } })) : undefined,
        stream: true
      }),
      signal: ctrl.signal
    });
    if (!res.ok) throw mapHttpToError(res.status, await res.text(), { model });
    let buffer = '';
    let done = false;
    let finishReason = null;
    const decoder = new TextDecoder();
    const acc = new Map();
    const processLine = line => {
      const tr = line.trim();
      if (!tr.startsWith('data:')) return;
      const data = tr.slice(5).trim();
      if (data === '[DONE]') {
        done = true;
        return;
      }
      if (done) return;
      let choice;
      try {
        choice = JSON.parse(data).choices?.[0];
      } catch {
        throw new ProviderProtocolError('Malformed OpenAI-compatible stream event');
      }
      if (!choice) return;
      if (choice.finish_reason != null) finishReason = choice.finish_reason;
      const reasoning = choice.delta?.reasoning_content ?? choice.delta?.reasoning;
      if (typeof reasoning === 'string' && reasoning) onReasoning?.(reasoning);
      if (choice.delta?.content) onChunk(choice.delta.content);
      if (choice.delta?.tool_calls) for (const tc of choice.delta.tool_calls) {
        const i = tc.index ?? 0;
        if (!acc.has(i)) acc.set(i, { id: tc.id || `call_${Date.now()}_${i}`, name: '', argumentsStr: '' });
        const call = acc.get(i);
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name += tc.function.name;
        if (typeof tc.function?.arguments === 'string') call.argumentsStr += tc.function.arguments;
      }
    };
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) processLine(line);
      if (done) break;
    }
    buffer += decoder.decode();
    if (buffer.trim()) processLine(buffer);
    if (!done && !finishReason) throw new ProviderProtocolError('Provider stream ended without a verified terminal finish reason');
    if (!finishReason || !['stop', 'tool_calls', 'function_call'].includes(finishReason)) {
      throw new ProviderProtocolError(`Provider ended without a verified completion reason (${finishReason || 'missing'})`);
    }
    if (acc.size && !['tool_calls', 'function_call'].includes(finishReason)) {
      throw new ProviderProtocolError('Provider tool calls lack a complete tool-call finish reason');
    }
    const completedCalls = [];
    for (const call of acc.values()) {
      if (!call.id || !call.name) throw new ProviderProtocolError('Provider tool call is missing its identity or name');
      let args;
      try {
        args = JSON.parse(call.argumentsStr || '{}');
      } catch {
        throw new ProviderProtocolError(`Provider returned malformed arguments for ${call.name}`);
      }
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new ProviderProtocolError(`Provider arguments for ${call.name} must be a JSON object`);
      }
      completedCalls.push({ id: call.id, name: call.name, arguments: args });
    }
    for (const call of completedCalls) onToolCall(call);
    return { completed: true, finishReason, terminal: done ? 'done' : 'finish_reason' };
  } catch (e) {
    if (e.name === 'AbortError') throw new ProviderOfflineError('Endpoint unreachable or timeout', { code: 'TIMEOUT' });
    if (e && (e.name === 'ProviderProtocolError' || e.code === 'PROTOCOL')) throw e;
    if (e && (e.name === 'ProviderOfflineError' || e.code === 'UNREACHABLE' || e.code === 'TIMEOUT')) throw e;
    // Lỗi HTTP từ API (sai key, hết quota, sai model...) phải giữ nguyên để báo ra, không được bọc thành offline.
    if (e && (e.code === 'AUTH' || e.code === 'MODEL_NOT_FOUND' || e.code === 'CAPABILITY')) throw e;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}
