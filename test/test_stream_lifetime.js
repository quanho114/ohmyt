import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { streamChat as openai } from '../server/providers/adapters/openai-compatible.js';
import { streamChat as google } from '../server/providers/adapters/google.js';
import { streamChat as anthropic } from '../server/providers/adapters/anthropic.js';
import { streamChat as ollama } from '../server/providers/adapters/ollama.js';

const originalFetch = globalThis.fetch;
const cases = [
  ['openai', openai, { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }],
  ['google', google, { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }],
  ['anthropic', anthropic, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }],
  ['ollama', ollama, { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }],
];
const encode = data => new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
try {
  for (const [name, chat, event] of cases) {
    const options = { baseURL: 'http://test.invalid', model: 'test', messages: [], timeoutMs: 5, onToolCall() {} };
    // Both response headers and the body can arrive after the old configured deadline.
    globalThis.fetch = async (_url, { signal }) => {
      await delay(25, undefined, { signal });
      return { ok: true, body: (async function* () {
        await delay(25, undefined, { signal });
        yield encode(event);
        if (name === 'anthropic') {
          yield encode({ type: 'message_delta', delta: { stop_reason: 'end_turn' } });
          yield encode({ type: 'message_stop' });
        }
      })() };
    };
    let text = '';
    const outcome = await chat({ ...options, onChunk: chunk => { text += chunk; } });
    assert.equal(text, 'ok', name);
    assert.equal(outcome.completed, true, name);

    // Cancellation works before fetching, while waiting for headers, and during streaming.
    for (const phase of ['before', 'headers', 'body']) {
      const controller = new AbortController();
      globalThis.fetch = async (_url, { signal }) => {
        if (phase === 'headers') {
          controller.abort();
          await delay(1, undefined, { signal });
        }
        signal?.throwIfAborted();
        return { ok: true, body: (async function* () {
          controller.abort();
          await delay(1, undefined, { signal });
          yield encode(event);
        })() };
      };
      if (phase === 'before') controller.abort();
      await assert.rejects(chat({ ...options, signal: controller.signal, onChunk() {} }),
        error => error.name === 'AbortError' && error.code !== 'TIMEOUT', `${name}: ${phase}`);
    }
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(chat({ ...options, onChunk() {} }), error => error.code === 'UNREACHABLE', name);
  }
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Stream lifetime and cancellation PASS');
