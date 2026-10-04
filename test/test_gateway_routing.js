import http from 'node:http';
import { createDaemon } from '../server/index.js';

const fake = http.createServer((req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'claude-z' }] }));
    return;
  }
  if (req.url === '/v1/messages') {
    res.write('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}\n\n');
    res.write('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n');
    res.write('data: {"type":"message_stop"}\n\n');
    res.end();
    return;
  }
  res.writeHead(404);
  res.end('nope');
});
await new Promise(r => fake.listen(0, r));
const fp = fake.address().port;

const d = createDaemon({ dbPath: ':memory:' });
const p = d.db.createProvider({ name: 'A', type: 'anthropic', base_url: `http://127.0.0.1:${fp}`, api_key_ref: null, config_json: '{}' });
const ref = d.vault.set(p.id, 'k-test');
d.db.updateProvider(p.id, { api_key_ref: ref });
d.db.createModel({ provider_id: p.id, model_id: 'claude-z', display_name: 'Claude Z', capabilities_json: '{}' });

const t = await d.gateway.testConnection(p.id);
if (!t.connected || t.modelsDiscovered !== 1) throw new Error('anthropic discover: ' + JSON.stringify(t));

let out = '';
await d.gateway.streamChat({
  providerId: p.id, modelId: 'claude-z',
  messages: [{ role: 'user', content: 'hi' }], tools: [],
  signal: new AbortController().signal,
  onChunk: c => { out += c; }, onToolCall: () => {}
});
if (out !== 'Yo') throw new Error('anthropic stream: ' + out);

const c2 = d.db.createProvider({ name: 'C', type: 'custom', base_url: `http://127.0.0.1:${fp}`, api_key_ref: null, config_json: JSON.stringify({ requestFormat: 'anthropic' }) });
if (d.gateway.adapterFor('custom', c2).streamChat !== d.gateway.adapterFor('anthropic').streamChat) {
  throw new Error('custom requestFormat routing broken');
}
console.log('gateway anthropic+custom PASS');

await d.apiServer.close();
d.db.close();
fake.close();
