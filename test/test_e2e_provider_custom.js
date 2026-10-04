import http from 'node:http';
import { createDaemon } from '../server/index.js';

// Fake OpenAI-compatible server (9router-style, base URL includes /v1)
const fake = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'fake-model-x' }] }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: {"choices":[{"delta":{"content":"Hello from fake"},"finish_reason":"stop"}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  res.writeHead(404);
  res.end('nope');
});
await new Promise(r => fake.listen(0, r));
const fakePort = fake.address().port;

const d = createDaemon({ dbPath: ':memory:' });
const { port } = await d.apiServer.listen(0);
const base = `http://localhost:${port}`;
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}: ${t}`);
  return JSON.parse(t);
};

// 1. Save with /v1-suffixed URL (9router style)
const created = await post('/api/providers', { name: 'Fake9', type: 'openai-compatible', baseURL: `http://127.0.0.1:${fakePort}/v1` });
if (created.base_url !== `http://127.0.0.1:${fakePort}`) throw new Error('v1 not stripped: ' + created.base_url);
console.log('save+novalize PASS:', created.base_url);

// 2. Test auto-discovers + upserts model
const t = await post(`/api/providers/${created.id}/test`, {});
if (!t.connected || t.modelsDiscovered !== 1) throw new Error('discover failed: ' + JSON.stringify(t));
const models = await (await fetch(`${base}/api/providers/${created.id}/models`)).json();
if (!models.some(m => m.model_id === 'fake-model-x')) throw new Error('model not upserted');
console.log('detect PASS: discovered', t.modelsDiscovered, 'model(s) in', t.latencyMs + 'ms');

// 3. Chat streams through gateway -> adapter -> fake endpoint
let out = '';
await d.gateway.streamChat({
  providerId: created.id, modelId: 'fake-model-x',
  messages: [{ role: 'user', content: 'Hello' }], tools: [],
  signal: new AbortController().signal,
  onChunk: c => { out += c; }, onToolCall: () => {}
});
if (!out.includes('Hello from fake')) throw new Error('stream mismatch: ' + out);
console.log('stream PASS:', JSON.stringify(out));

await d.apiServer.close();
d.db.close();
fake.close();
console.log('E2E custom provider PASS');
