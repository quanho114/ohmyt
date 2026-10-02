import { ProviderOfflineError, mapHttpToError } from '../errors.js';

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

function toGeminiContents(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role || m.sender;
    if (role === 'system') continue;
    out.push({ role: role === 'agent' || role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content ?? '') }] });
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

export async function streamChat({ baseURL, apiKey, timeoutMs = 60000, model, messages, tools = [], signal, onChunk, onToolCall }) {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const body = JSON.stringify({
    system_instruction: systemInstruction(messages),
    contents: toGeminiContents(messages),
    tools: tools.length ? [{ function_declarations: tools.map(t => ({ name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object' } })) }] : undefined,
    generationConfig: { temperature: 0.7 }
  });
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseURL}/v1beta/${modelPath}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey || '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
    if (e.name === 'AbortError') throw new ProviderOfflineError('Endpoint unreachable or timeout', { code: 'TIMEOUT' });
    throw new ProviderOfflineError(e.message || 'Endpoint unreachable', { code: 'UNREACHABLE' });
  }
  if (!res.ok) {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
    throw mapHttpToError(res.status, await res.text(), { model });
  }
  try {
    let buffer = '';
    const calls = new Map();
    const handleParts = (parts) => {
      for (const part of parts || []) {
        if (typeof part.text === 'string' && part.text) onChunk(part.text);
        if (part.functionCall) {
          const name = part.functionCall.name;
          const args = part.functionCall.args;
          const key = `0:${name}`;
          if (!calls.has(key)) calls.set(key, { id: `call_${Date.now()}_${calls.size}`, name, args: {} });
          const acc = calls.get(key);
          if (args && typeof args === 'object') acc.args = { ...acc.args, ...args };
          else if (typeof args === 'string') acc.args = { ...(typeof acc.args === 'object' ? acc.args : {}), raw: (acc.args?.raw || '') + args };
        }
      }
    };
    for await (const chunk of res.body) {
      buffer += Buffer.from(chunk).toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const tr = line.trim();
        if (!tr) continue;
        const data = tr.startsWith('data: ') ? tr.slice(6).trim() : tr;
        if (!data || data === '[DONE]') continue;
        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          for (const cand of item.candidates || []) handleParts(cand.content?.parts);
        }
      }
    }
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          for (const cand of item.candidates || []) handleParts(cand.content?.parts);
        }
      } catch {}
    }
    for (const c of calls.values()) onToolCall({ id: c.id, name: c.name, arguments: c.args });
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}
