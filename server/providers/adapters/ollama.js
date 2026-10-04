import { ProviderOfflineError, mapHttpToError } from '../errors.js';
import { streamChat as streamOpenAICompatibleChat } from './openai-compatible.js';

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
export async function streamChat({ baseURL, model, messages, tools = [], signal, onChunk, onReasoning, onToolCall }) {
  return streamOpenAICompatibleChat({ baseURL, model, messages, tools, signal, onChunk, onReasoning, onToolCall });
}
