import http from 'node:http';
import { normalizeModels as normA, streamChat as chatA } from '../server/providers/adapters/anthropic.js';
import { normalizeModels as normG, shortId, streamChat as chatG } from '../server/providers/adapters/google.js';

// Fake Anthropic (SSE) + Gemini (JSON-lines) server
const fake = http.createServer((req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'claude-x', display_name: 'Claude X' }] }));
    return;
  }
  if (req.url === '/v1/messages') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"toolu_1","name":"fs_list"}}\n\n');
    res.write('data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"path\\""}}\n\n');
    res.write('data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":": \\".\\"}"}}\n\n');
    res.write('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n');
    res.write('data: {"type":"content_block_stop"}\n\n');
    res.end();
    return;
  }
  if (req.url.startsWith('/v1beta/models?key=')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'models/gemini-x', displayName: 'Gemini X', supportedGenerationMethods: ['generateContent'] }] }));
    return;
  }
  if (req.url.includes(':streamGenerateContent')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('[{"candidates":[{"content":{"parts":[{"text":"Hey"}],"role":"model"}}]}]\n');
    res.write('[{"candidates":[{"content":{"parts":[{"functionCall":{"name":"fs_list","args":{"path":"."}}}]}}]}]\n');
    res.end();
    return;
  }
  res.writeHead(404);
  res.end('nope');
});
await new Promise(r => fake.listen(0, r));
const port = fake.address().port;
const base = `http://127.0.0.1:${port}`;
const sig = new AbortController().signal;

console.assert(normA({ data: [{ id: 'a' }] })[0].modelId === 'a', 'anthropic normalize');
console.assert(shortId('models/gemini-x') === 'gemini-x', 'gemini shortId');
console.assert(normG({ models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }] })[0].modelId === 'gemini-x', 'gemini normalize');

let aText = '';
const aTools = [];
await chatA({ baseURL: base, apiKey: 'k', model: 'claude-x', messages: [{ role: 'user', content: 'hi' }], tools: [], signal: sig, onChunk: c => { aText += c; }, onToolCall: t => aTools.push(t) });
if (aText !== 'Hi') throw new Error('anthropic text: ' + aText);
if (aTools.length !== 1 || aTools[0].name !== 'fs_list' || aTools[0].arguments.path !== '.') throw new Error('anthropic tools: ' + JSON.stringify(aTools));
console.log('anthropic stream PASS');

let gText = '';
const gTools = [];
await chatG({ baseURL: base, apiKey: 'k', model: 'gemini-x', messages: [{ role: 'user', content: 'hi' }], tools: [], signal: sig, onChunk: c => { gText += c; }, onToolCall: t => gTools.push(t) });
if (gText !== 'Hey') throw new Error('gemini text: ' + gText);
if (gTools.length !== 1 || gTools[0].name !== 'fs_list' || gTools[0].arguments.path !== '.') throw new Error('gemini tools: ' + JSON.stringify(gTools));
console.log('gemini stream PASS');

fake.close();
console.log('native adapters PASS');
