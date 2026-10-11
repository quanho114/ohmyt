import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { AppDatabase } from '../server/db.js';
import { ToolRegistry } from '../server/tools.js';
import { createApiServer } from '../server/api.js';
import { STTManager, parseWav16k, normalizeLanguage, kindForLanguage } from '../server/stt.js';

function makeWav({ sampleRate = 16000, channels = 1, seconds = 1, bits = 16, format = 1 }) {
  const frames = Math.floor(sampleRate * seconds);
  const bytesPerSample = bits / 8;
  const buffer = Buffer.alloc(44 + frames * channels * bytesPerSample);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * channels * bytesPerSample, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(format, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(Math.floor(sampleRate * channels * bytesPerSample), 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * channels * bytesPerSample, 40);
  return buffer;
}

// 1. WAV parser
{
  const parsed = parseWav16k(makeWav({}));
  assert.equal(parsed.samples.length, 16000);
  const stereo = parseWav16k(makeWav({ channels: 2 }));
  assert.equal(stereo.samples.length, 16000);
  const resampled = parseWav16k(makeWav({ sampleRate: 8000 }));
  assert.equal(resampled.samples.length, 16000);
  const float32 = parseWav16k(makeWav({ bits: 32, format: 3 }));
  assert.equal(float32.samples.length, 16000);
  assert.throws(() => parseWav16k(Buffer.from('not a wav file at all..............')), /WAV/);
  assert.throws(() => parseWav16k(makeWav({ seconds: 0.05 })), /quá ngắn/);
  assert.throws(() => parseWav16k(makeWav({ seconds: 130 })), /tối đa/);
}

// 2. Language routing
assert.equal(normalizeLanguage('zh'), 'zh');
assert.equal(normalizeLanguage('en'), 'en');
assert.equal(normalizeLanguage('auto'), 'vi');
assert.equal(normalizeLanguage(null), 'vi');
assert.equal(kindForLanguage('vi'), 'vi');
assert.equal(kindForLanguage('zh'), 'sv');
assert.equal(kindForLanguage('en'), 'sv');

// 3. Manager status với dataDir trống (không tải gì)
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-stt-test-'));
const stt = new STTManager(tmpRoot);
{
  const status = stt.status();
  assert.deepEqual(status.languages, ['vi', 'zh', 'en']);
  assert.equal(status.models.vi.ready, false);
  assert.equal(status.models.sv.ready, false);
  assert.equal(status.models.vi.sizeMB, 57);
}

// 4. API routes (stub transcribe để không cần model)
const db = new AppDatabase(':memory:');
const tools = new ToolRegistry(db, tmpRoot);
const api = createApiServer({ db, tools, agentLoop: new EventEmitter(), stt, port: 0 });
const address = await api.listen(0);
const base = `http://127.0.0.1:${address.port}`;
try {
  const statusRes = await fetch(`${base}/api/stt/status`);
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.deepEqual(statusBody.languages, ['vi', 'zh', 'en']);

  const realTranscribe = stt.transcribe.bind(stt);
  stt.transcribe = async () => {
    const err = new Error('Model giọng nói đang được tải về máy.');
    err.code = 'STT_DOWNLOADING';
    err.kind = 'vi';
    err.progress = 0.5;
    throw err;
  };
  const dlRes = await fetch(`${base}/api/stt/transcribe?language=vi`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: makeWav({ seconds: 1 }),
  });
  assert.equal(dlRes.status, 503);
  const dlBody = await dlRes.json();
  assert.equal(dlBody.downloading, true);
  assert.equal(dlBody.progress, 0.5);

  stt.transcribe = async () => {
    const err = new Error('Chỉ hỗ trợ file WAV.');
    err.code = 'STT_BAD_AUDIO';
    throw err;
  };
  const badRes = await fetch(`${base}/api/stt/transcribe?language=xx`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: makeWav({ seconds: 1 }),
  });
  assert.equal(badRes.status, 400);

  stt.transcribe = async () => ({ text: 'xin chào', language: 'vi', durationMs: 12 });
  const okRes = await fetch(`${base}/api/stt/transcribe?language=vi`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: makeWav({ seconds: 1 }),
  });
  assert.equal(okRes.status, 200);
  assert.deepEqual(await okRes.json(), { text: 'xin chào', language: 'vi', durationMs: 12 });
  stt.transcribe = realTranscribe;

  const bigRes = await fetch(`${base}/api/stt/transcribe?language=vi`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: Buffer.alloc(9 * 1024 * 1024),
  });
  assert.equal(bigRes.status, 400);
} finally {
  await api.close();
}

// 5. Live transcribe nếu máy đã có model (data/stt của repo)
const repoStt = new STTManager(path.resolve('data'));
try {
  if (repoStt.isReady('vi')) {
    const silent = makeWav({ seconds: 1 });
    const result = await repoStt.transcribe('vi', silent);
    assert.equal(typeof result.text, 'string');
    assert.equal(result.language, 'vi');
    console.log('live STT (im lặng 1s) ->', JSON.stringify(result.text));
  } else {
    console.log('skip live STT: chưa có model trong data/stt');
  }
} finally {
  await repoStt.close();
  await stt.close();
  db.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log('test_stt OK');
