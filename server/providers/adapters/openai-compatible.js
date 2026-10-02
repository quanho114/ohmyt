import { ProviderOfflineError, mapHttpToError } from '../errors.js';

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

export async function streamChat({ baseURL, apiKey, headers = {}, timeoutMs = 30000, model, messages, tools = [], signal, onChunk, onToolCall }) {
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
    const acc = new Map();
    for await (const chunk of res.body) {
      buffer += Buffer.from(chunk).toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const tr = line.trim();
        if (!tr || tr === 'data: [DONE]') continue;
        if (tr.startsWith('data: ')) {
          try {
            const c = JSON.parse(tr.slice(6)).choices?.[0];
            if (!c) continue;
            if (c.delta?.content) onChunk(c.delta.content);
            if (c.delta?.tool_calls) for (const tc of c.delta.tool_calls) {
              const i = tc.index ?? 0;
              if (!acc.has(i)) acc.set(i, { id: tc.id || `call_${Date.now()}_${i}`, name: '', argumentsStr: '' });
              const a = acc.get(i);
              if (tc.function?.name) a.name = tc.function.name;
              if (tc.function?.arguments) a.argumentsStr += tc.function.arguments;
            }
          } catch {}
        }
      }
    }
    for (const a of acc.values()) if (a.name) {
      let args = {};
      try { args = JSON.parse(a.argumentsStr || '{}'); } catch { args = { raw: a.argumentsStr }; }
      onToolCall({ id: a.id, name: a.name, arguments: args });
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new ProviderOfflineError('Endpoint unreachable or timeout', { code: 'TIMEOUT' });
    if (e && (e.name === 'ProviderOfflineError' || e.code === 'UNREACHABLE' || e.code === 'TIMEOUT')) throw e;
    // Lỗi HTTP từ API (sai key, hết quota, sai model...) phải giữ nguyên để báo ra, không được bọc thành offline.
    if (e && (e.code === 'AUTH' || e.code === 'MODEL_NOT_FOUND' || e.code === 'CAPABILITY')) throw e;
    throw new ProviderOfflineError(e.message || 'Endpoint unreachable', { code: 'UNREACHABLE' });
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}
