import { ProviderOfflineError, mapHttpToError } from '../errors.js';

export function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey || '',
    'anthropic-version': '2023-06-01'
  };
}

export function normalizeModels(json) {
  const arr = json?.data || [];
  return arr.map(m => ({
    modelId: m.id,
    displayName: m.display_name || m.id,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, reasoning: false, json: true, embeddings: false }
  }));
}

function toAnthropicMessages(messages) {
  let system = '';
  const out = [];
  for (const m of messages) {
    const role = m.role || m.sender;
    if (role === 'system') {
      system += (system ? '\n' : '') + m.content;
      continue;
    }
    if (String(m.content || '').startsWith('[TOOL_RESULT')) {
      out.push({ role: 'user', content: String(m.content) });
      continue;
    }
    out.push({ role: role === 'agent' || role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  return { system, messages: out };
}

export async function discoverModels({ baseURL, apiKey, timeoutMs = 8000 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseURL}/v1/models`, { headers: buildHeaders(apiKey), signal: ctrl.signal });
  } catch (e) {
    clearTimeout(t);
    if (e.name === 'AbortError') throw new ProviderOfflineError('Timeout', { code: 'TIMEOUT' });
    throw new ProviderOfflineError(e.message || 'Endpoint unreachable', { code: 'UNREACHABLE' });
  } finally {
    clearTimeout(t);
  }
  if (res.status === 401 || res.status === 403) throw mapHttpToError(res.status, await res.text());
  if (!res.ok) return [];
  try {
    return normalizeModels(await res.json());
  } catch {
    return [];
  }
}

export async function streamChat({ baseURL, apiKey, timeoutMs = 60000, model, messages, tools = [], signal, onChunk, onToolCall }) {
  const { system, messages: msgs } = toAnthropicMessages(messages);
  const body = JSON.stringify({
    model,
    max_tokens: 4096,
    system: system || undefined,
    messages: msgs,
    tools: tools.length ? tools.map(t => ({ name: t.name, description: t.description || '', input_schema: t.parameters || { type: 'object' } })) : undefined,
    stream: true
  });
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseURL}/v1/messages`, { method: 'POST', headers: buildHeaders(apiKey), body, signal: ctrl.signal });
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
    let curId = null;
    let curName = '';
    let curJson = '';
    const flush = () => {
      if (curName) {
        let args = {};
        try { args = JSON.parse(curJson || '{}'); } catch { args = { raw: curJson }; }
        onToolCall({ id: curId || `call_${Date.now()}`, name: curName, arguments: args });
      }
      curId = null;
      curName = '';
      curJson = '';
    };
    for await (const chunk of res.body) {
      buffer += Buffer.from(chunk).toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const tr = line.trim();
        if (!tr.startsWith('data: ')) continue;
        const data = tr.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        let evt;
        try { evt = JSON.parse(data); } catch { continue; }
        if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
          flush();
          curId = evt.content_block.id;
          curName = evt.content_block.name || '';
          curJson = '';
        } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          onChunk(evt.delta.text);
        } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
          curJson += evt.delta.partial_json;
        } else if (evt.type === 'content_block_stop') {
          flush();
        }
      }
    }
    flush();
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}
