import assert from 'node:assert/strict';
import { streamChat as chatOpenAI } from '../server/providers/adapters/openai-compatible.js';
import { streamChat as chatOllama } from '../server/providers/adapters/ollama.js';
import http from 'node:http';
const openAIResponses = [];
const openAIFake = http.createServer(async (req, res) => {
  let requestBody = '';
  for await (const chunk of req) requestBody += chunk;
  openAIResponses.shift()(res, JSON.parse(requestBody));
});
await new Promise(r => openAIFake.listen(0, '127.0.0.1', r));
const openAIBase = `http://127.0.0.1:${openAIFake.address().port}`;

const serveSse = (chunks) => (res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const chunk of chunks) res.write(chunk === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(chunk)}\n\n`);
  res.end();
};
const toolDelta = (args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-boundary', function: { name: 'fs_write', arguments: args } }] } }] });
const terminal = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };

// Invalid full JSON is rejected rather than dispatched as a { raw } object.
openAIResponses.push(serveSse([toolDelta('{"path":'), terminal, '[DONE]']));
const malformedCalls = [];
await assert.rejects(chatOpenAI({ baseURL: openAIBase, model: 'pinned-test', messages: [], tools: [], onChunk() {}, onToolCall: call => malformedCalls.push(call) }));
assert.equal(malformedCalls.length, 0);
// EOF without a finish reason remains incomplete even if all argument bytes arrived.
openAIResponses.push(serveSse([toolDelta('{"path":"x"}') ]));
const truncatedCalls = [];
await assert.rejects(chatOpenAI({ baseURL: openAIBase, model: 'pinned-test', messages: [], tools: [], onChunk() {}, onToolCall: call => truncatedCalls.push(call) }));
assert.equal(truncatedCalls.length, 0);

// Some compatible gateways terminate on a complete choice without sending [DONE].
openAIResponses.push(serveSse([{ choices: [{ delta: { content: 'finished' }, finish_reason: 'stop' }] }]));
let eofText = '';
const eofOutcome = await chatOpenAI({ baseURL: openAIBase, model: 'pinned-test', messages: [], tools: [], onChunk: chunk => { eofText += chunk; }, onToolCall() {} });
assert.equal(eofOutcome.completed, true);
assert.equal(eofOutcome.finishReason, 'stop');
assert.equal(eofText, 'finished');
openAIResponses.push(serveSse([toolDelta('{"path":"x"}'), terminal, '[DONE]']));
const completeCalls = [];
await chatOpenAI({ baseURL: openAIBase, model: 'pinned-test', messages: [], tools: [], onChunk() {}, onToolCall: call => completeCalls.push(call) });
assert.deepEqual(completeCalls.map(({ name, arguments: args }) => ({ name, arguments: args })), [{ name: 'fs_write', arguments: { path: 'x' } }]);
openAIResponses.push(serveSse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }, '[DONE]']));
const normalCalls = [];
const normalOutcome = await chatOllama({ baseURL: openAIBase, model: 'ollama-test', messages: [], tools: [], onChunk() {}, onToolCall: call => normalCalls.push(call) });
assert.equal(normalOutcome.completed, true);
assert.equal(normalOutcome.finishReason, 'stop');
assert.equal(normalCalls.length, 0);
openAIFake.close();
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
    res.write('data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n');
    res.write('data: {"type":"message_stop"}\n\n');
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
    res.write('[{"candidates":[{"content":{"parts":[{"functionCall":{"name":"fs_list","args":{"path":"."}}}]},"finishReason":"STOP"}]}]\n');
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
const anthropicOutcome = await chatA({ baseURL: base, apiKey: 'k', model: 'claude-x', messages: [{ role: 'user', content: 'hi' }], tools: [], signal: sig, onChunk: c => { aText += c; }, onToolCall: t => aTools.push(t) });
if (!anthropicOutcome.completed || anthropicOutcome.finishReason !== 'tool_use') throw new Error('anthropic completion not verified');
if (aText !== 'Hi') throw new Error('anthropic text: ' + aText);
if (aTools.length !== 1 || aTools[0].name !== 'fs_list' || aTools[0].arguments.path !== '.') throw new Error('anthropic tools: ' + JSON.stringify(aTools));
console.log('anthropic stream PASS');

let gText = '';
const gTools = [];
const geminiOutcome = await chatG({ baseURL: base, apiKey: 'k', model: 'gemini-x', messages: [{ role: 'user', content: 'hi' }], tools: [], signal: sig, onChunk: c => { gText += c; }, onToolCall: t => gTools.push(t) });
if (!geminiOutcome.completed || geminiOutcome.finishReason !== 'STOP') throw new Error('gemini completion not verified');
if (gText !== 'Hey') throw new Error('gemini text: ' + gText);
if (gTools.length !== 1 || gTools[0].name !== 'fs_list' || gTools[0].arguments.path !== '.') throw new Error('gemini tools: ' + JSON.stringify(gTools));
console.log('gemini stream PASS');

fake.close();
console.log('native adapters PASS');
