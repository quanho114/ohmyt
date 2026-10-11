import assert from 'node:assert/strict';
import http from 'node:http';
import { AppDatabase } from '../server/db.js';
import { AgentLoop } from '../server/agent_loop.js';
import { streamChat as openAI } from '../server/providers/adapters/openai-compatible.js';
import { streamChat as google } from '../server/providers/adapters/google.js';
import { streamChat as anthropic } from '../server/providers/adapters/anthropic.js';

const requests = [];
const fake = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  requests.push(JSON.parse(body));
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const send = item => res.write(`data: ${JSON.stringify(item)}\n\n`);
  if (req.url.includes('streamGenerateContent')) {
    send({ candidates: [{ content: { parts: [{ text: 'Gemini summary.', thought: true }, { text: 'Answer.' }] }, finishReason: 'STOP' }] });
  } else if (req.url === '/v1/messages') {
    send({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Claude reasoning.' } });
    send({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Answer.' } });
    send({ type: 'message_delta', delta: { stop_reason: 'end_turn' } });
    send({ type: 'message_stop' });
  } else {
    send({ choices: [{ delta: { reasoning_content: 'DeepSeek reasoning.' } }] });
    send({ choices: [{ delta: { content: 'Answer.' }, finish_reason: 'stop' }] });
    res.write('data: [DONE]\n\n');
  }
  res.end();
});
await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
try {
  for (const [adapter, model, expected] of [[openAI, 'reasoner', 'DeepSeek reasoning.'], [google, 'gemini-2.5-flash', 'Gemini summary.'], [anthropic, 'claude', 'Claude reasoning.']]) {
    let text = '', reasoning = '';
    const result = await adapter({ baseURL: `http://127.0.0.1:${fake.address().port}`, model, messages: [], onChunk: chunk => { text += chunk; }, onReasoning: chunk => { reasoning += chunk; }, onToolCall() {} });
    assert.equal(result.completed, true);
    assert.equal(text, 'Answer.');
    assert.equal(reasoning, expected);
  }
  assert.equal(requests[1].generationConfig.thinkingConfig.includeThoughts, true);
  // Providers that omit a reasoning callback must still keep thoughts out of answers.
  let answer = '';
  await google({ baseURL: `http://127.0.0.1:${fake.address().port}`, model: 'gemini-x', messages: [], onChunk: chunk => { answer += chunk; }, onToolCall() {} });
  assert.equal(answer, 'Answer.');
  assert.equal(requests[3].generationConfig.thinkingConfig, undefined);
} finally { await new Promise(resolve => fake.close(resolve)); }

const db = new AppDatabase(':memory:');
try {
  const session = db.createSession('activity-session', 'default-assistant', 'Activity test');
  let turn = 0;
  const events = [];
  const loop = new AgentLoop({ db, tools: {
    forStandalone() { return this; },
    get() { return null; },
    getAllDefinitions: () => [{ name: 'fs_read', parameters: { type: 'object' } }],
    validateCall: call => ({ arguments: call.arguments, tool: { execute: async () => ({ content: 'file contents', lines: 1 }) } }),
    killProcessesForRun() {},
  }, permissions: { evaluate: () => ({ action: 'ALLOW' }) }, skills: null, llm: {
    async streamChat({ onReasoning, onChunk, onToolCall }) {
      turn++;
      onReasoning(turn === 1 ? 'Checking the file.\n' : 'Summarizing the result.');
      if (turn === 1) onToolCall({ id: 'read-1', name: 'fs_read', arguments: { path: 'example.txt' } });
      else onChunk('The file contains one line.');
      return { completed: true };
    }
  } });
  loop.on('event', event => events.push(event));
  await loop.run({ runId: 'activity-run', sessionId: session.id, prompt: 'Read the file.' });
  const final = db.getMessages(session.id).find(message => message.sender === 'agent');
  assert.equal(final.content, 'The file contains one line.');
  const activity = JSON.parse(final.metadata).activity;
  assert.equal(activity.reasoning, 'Checking the file.\nSummarizing the result.');
  assert.equal(activity.tools[0].status, 'completed');
  assert.equal(activity.tools[0].output.content, 'file contents');
  assert.equal(activity.status, 'completed');
  assert.ok(activity.durationMs >= 0);
  assert.equal(events.filter(event => event.type === 'ReasoningDelta').length, 2);
  assert.equal(events.filter(event => event.type === 'TextDelta').map(event => event.payload.delta).join(''), final.content);
  // Failure keeps reasoning available for inspection, without blending it into the answer.
  loop.llm.streamChat = async ({ onReasoning }) => { onReasoning('Partial reasoning.'); throw new Error('Provider disconnected'); };
  await loop.run({ runId: 'failure-run', sessionId: session.id, prompt: 'Try again.' });
  const failed = db.getMessages(session.id).find(message => message.content === 'Lỗi: Provider disconnected');
  assert.equal(JSON.parse(failed.metadata).activity.status, 'error');
  assert.equal(JSON.parse(failed.metadata).activity.reasoning, 'Partial reasoning.');
  // Aborting a live run saves a stopped trace and does not leave tools spinning forever.
  loop.activeRuns.set('abort-run', { abortController: new AbortController(), sessionId: session.id, activity: { startedAt: Date.now(), reasoning: 'Interrupted.', tools: [{ id: 'pending', name: 'fs_read', input: {}, status: 'running' }] } });
  assert.equal(loop.abortRun('abort-run'), true);
  const stopped = db.getMessages(session.id).find(message => message.content === 'Đã dừng phản hồi.');
  assert.equal(JSON.parse(stopped.metadata).activity.status, 'aborted');
  assert.equal(JSON.parse(stopped.metadata).activity.tools[0].status, 'blocked');
  console.log('Response activity: provider separation, SSE, tool results, persistence, failure and abort passed.');
} finally { db.db.close(); }
