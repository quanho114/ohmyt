import { ProviderOfflineError, mapHttpToError } from '../errors.js';

export function normalizeOllamaTags(json) {
  const arr = json?.models || [];
  return arr.map(m => ({
    modelId: m.name,
    displayName: m.name,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, reasoning: false, json: true, embeddings: false }
  }));
}

export async function discoverModels({ baseURL, timeoutMs = 5000 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseURL}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) throw mapHttpToError(res.status, await res.text());
    return normalizeOllamaTags(await res.json());
  } catch (e) {
    if (e.name === 'AbortError') throw new ProviderOfflineError('Timeout', { code: 'TIMEOUT' });
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function streamChat({ baseURL, model, messages, tools = [], signal, onChunk, onToolCall }) {
  const body = JSON.stringify({
    model,
    messages,
    tools: tools.length ? tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) : undefined,
    stream: true
  });
  let res;
  try {
    res = await fetch(`${baseURL}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
  } catch (e) {
    throw new ProviderOfflineError(e.message || 'Endpoint unreachable', { code: 'UNREACHABLE' });
  }
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
}
