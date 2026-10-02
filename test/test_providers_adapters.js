import { normalizeOllamaTags } from '../server/providers/adapters/ollama.js';
const out = normalizeOllamaTags({ models: [{ name: 'qwen2.5:14b' }, { name: 'llama3.2:latest' }] });
console.assert(out.length === 2 && out[0].modelId === 'qwen2.5:14b', 'ollama normalize');
console.log('Task4 ollama PASS');

import { buildHeaders, normalizeOpenAIModels, discoverModels } from '../server/providers/adapters/openai-compatible.js';
console.assert(!('Authorization' in buildHeaders('', {})), 'empty key no auth');
console.assert(buildHeaders('sk-x', {}).Authorization === 'Bearer sk-x', 'auth header');
console.assert(normalizeOpenAIModels({ data: [{ id: 'a' }] })[0].modelId === 'a', 'models normalize');
let threw = false;
try {
  await discoverModels({ baseURL: 'http://127.0.0.1:1', timeoutMs: 2000 });
} catch (e) {
  threw = true;
}
console.assert(threw, 'dead endpoint must throw, not return []');
console.log('Task5 openai-compat PASS');
