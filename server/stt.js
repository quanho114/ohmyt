// STT offline (sherpa-onnx, 100% local, không gửi audio đi đâu).
//  - Tiếng Việt: zipformer chuyên biệt (~57MB).
//  - Tiếng Trung / Anh: SenseVoice đa ngữ (~158MB).
// Model được tải lười vào <dataDir>/stt khi dùng lần đầu, có báo tiến độ.
// Giải mã chạy trong worker thread để không chặn event loop chính.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { Worker } from 'node:worker_threads';

const execFileAsync = promisify(execFile);
const RELEASE_BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models';

export const STT_LANGUAGES = ['vi', 'zh', 'en'];
export const STT_MAX_SECONDS = 120;
export const STT_TARGET_RATE = 16000;

const MODEL_DEFS = {
  vi: {
    archive: 'sherpa-onnx-zipformer-vi-int8-2025-04-20.tar.bz2',
    dir: 'sherpa-onnx-zipformer-vi-int8-2025-04-20',
    sizeMB: 57,
    required: [
      'encoder-epoch-12-avg-8.int8.onnx',
      'decoder-epoch-12-avg-8.onnx',
      'joiner-epoch-12-avg-8.int8.onnx',
      'tokens.txt',
    ],
  },
  sv: {
    archive: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2',
    dir: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
    sizeMB: 158,
    required: ['model.int8.onnx', 'tokens.txt'],
  },
};

export function kindForLanguage(language) {
  if (language === 'zh' || language === 'en') return 'sv';
  return 'vi';
}

export function normalizeLanguage(language) {
  if (language === 'zh' || language === 'en') return language;
  return 'vi';
}

// Đọc WAV PCM (int8/16/24/32 hoặc float32, mono/stereo) -> float32 mono 16kHz.
export function parseWav16k(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 44) throw new Error('File âm thanh quá ngắn hoặc không phải WAV.');
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Chỉ hỗ trợ file WAV.');
  }
  let fmt = null;
  let dataChunk = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      dataChunk = { offset: offset + 8, size };
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt || !dataChunk) throw new Error('File WAV thiếu fmt hoặc data chunk.');
  if (fmt.channels < 1 || fmt.channels > 2) throw new Error('WAV phải là mono hoặc stereo.');
  if (fmt.sampleRate < 8000 || fmt.sampleRate > 48000) throw new Error(`Tần số mẫu không hỗ trợ: ${fmt.sampleRate}Hz.`);
  const bytesPerSample = fmt.bitsPerSample / 8;
  if (![1, 2, 3, 4].includes(bytesPerSample)) throw new Error(`Độ sâu bit không hỗ trợ: ${fmt.bitsPerSample}.`);
  const frames = Math.floor(dataChunk.size / (bytesPerSample * fmt.channels));
  const seconds = frames / fmt.sampleRate;
  if (seconds < 0.2) throw new Error('Đoạn ghi âm quá ngắn.');
  if (seconds > STT_MAX_SECONDS) throw new Error(`Đoạn ghi âm tối đa ${STT_MAX_SECONDS} giây.`);
  const raw = new Float32Array(frames * fmt.channels);
  const dv = new DataView(buffer.buffer, buffer.byteOffset + dataChunk.offset, dataChunk.size);
  for (let i = 0; i < raw.length; i++) {
    const byte = i * bytesPerSample;
    if (fmt.audioFormat === 3 && bytesPerSample === 4) raw[i] = dv.getFloat32(byte, true);
    else if (fmt.audioFormat === 1 || fmt.audioFormat === 0xfffe) {
      if (bytesPerSample === 1) raw[i] = (dv.getUint8(byte) - 128) / 128;
      else if (bytesPerSample === 2) raw[i] = dv.getInt16(byte, true) / 32768;
      else if (bytesPerSample === 3) {
        let v = dv.getUint8(byte) | (dv.getUint8(byte + 1) << 8) | (dv.getUint8(byte + 2) << 16);
        if (v & 0x800000) v -= 0x1000000;
        raw[i] = v / 8388608;
      } else raw[i] = dv.getInt32(byte, true) / 2147483648;
    } else throw new Error('Định dạng WAV không hỗ trợ (cần PCM hoặc float).');
  }
  let mono;
  if (fmt.channels === 2) {
    mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) mono[i] = (raw[i * 2] + raw[i * 2 + 1]) / 2;
  } else {
    mono = raw;
  }
  if (fmt.sampleRate === STT_TARGET_RATE) return { samples: mono, seconds };
  const ratio = fmt.sampleRate / STT_TARGET_RATE;
  const outLen = Math.floor(frames / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = mono[index] || 0;
    const b = mono[index + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return { samples: out, seconds };
}

export class STTManager {
  constructor(dataDir) {
    this.root = path.join(dataDir, 'stt');
    this.downloads = new Map();
    this.ongoing = new Map();
    this.errors = new Map();
    this.worker = null;
    this.workerDead = false;
    this.seq = 0;
    this.pending = new Map();
  }

  modelDir(kind) {
    return path.join(this.root, MODEL_DEFS[kind].dir);
  }

  isReady(kind) {
    const dir = this.modelDir(kind);
    return MODEL_DEFS[kind].required.every((file) => {
      try {
        return fs.statSync(path.join(dir, file)).isFile();
      } catch {
        return false;
      }
    });
  }

  status() {
    const model = (kind) => {
      const download = this.downloads.get(kind);
      const failure = this.errors.get(kind);
      return {
        ready: this.isReady(kind),
        downloading: Boolean(download && !download.done),
        progress: download && download.total > 0 ? download.received / download.total : null,
        sizeMB: MODEL_DEFS[kind].sizeMB,
        error: !this.isReady(kind) && failure ? failure.message : null,
      };
    };
    return { languages: [...STT_LANGUAGES], models: { vi: model('vi'), sv: model('sv') } };
  }

  ensure(kind) {
    if (!MODEL_DEFS[kind]) return Promise.reject(new Error(`Model STT không hỗ trợ: ${kind}`));
    if (this.isReady(kind)) return Promise.resolve();
    const ongoing = this.ongoing.get(kind);
    if (ongoing) return ongoing;
    const task = this.download(kind).finally(() => {
      if (this.ongoing.get(kind) === task) this.ongoing.delete(kind);
    });
    this.ongoing.set(kind, task);
    return task;
  }

  async download(kind) {
    const def = MODEL_DEFS[kind];
    fs.mkdirSync(this.root, { recursive: true });
    const state = { received: 0, total: 0, startedAt: Date.now(), done: false };
    this.downloads.set(kind, state);
    this.errors.delete(kind);
    try {
      const response = await fetch(`${RELEASE_BASE}/${def.archive}`);
      if (!response.ok || !response.body) throw new Error(`Tải model giọng nói thất bại (HTTP ${response.status}).`);
      state.total = Number(response.headers.get('content-length')) || def.sizeMB * 1048576;
      const archivePath = path.join(this.root, def.archive);
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(archivePath);
        file.on('error', reject);
        file.on('finish', resolve);
        Readable.fromWeb(response.body).on('data', (chunk) => {
          state.received += chunk.length;
        }).on('error', reject).pipe(file);
      });
      await execFileAsync('tar', ['-xjf', archivePath, '-C', this.root]);
      for (const file of def.required) {
        if (!fs.existsSync(path.join(this.modelDir(kind), file))) {
          throw new Error('Giải nén model giọng nói thiếu file, thử tải lại.');
        }
      }
      fs.rmSync(archivePath, { force: true });
      state.done = true;
    } catch (error) {
      this.errors.set(kind, { message: error instanceof Error ? error.message : String(error), at: Date.now() });
      throw error;
    } finally {
      if (state.done) this.downloads.delete(kind);
      else {
        // Giữ tiến độ lỗi để UI hiển thị, xóa khi ensure() được gọi lại.
        this.downloads.delete(kind);
      }
    }
  }

  ensureWorker() {
    if (this.worker && !this.workerDead) return this.worker;
    const worker = new Worker(new URL('./stt-worker.js', import.meta.url));
    this.worker = worker;
    this.workerDead = false;
    worker.on('message', (message) => {
      const entry = this.pending.get(message?.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.text);
      else entry.reject(new Error(message.error || 'Nhận diện giọng nói thất bại.'));
    });
    const failAll = (error) => {
      this.workerDead = true;
      for (const [id, entry] of this.pending) {
        this.pending.delete(id);
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      try {
        worker.terminate();
      } catch {}
      if (this.worker === worker) this.worker = null;
    };
    worker.on('error', (error) => failAll(error instanceof Error ? error : new Error(String(error))));
    worker.on('exit', (code) => {
      if (code !== 0) failAll(new Error(`Tiến trình STT dừng đột ngột (mã ${code}).`));
    });
    return worker;
  }

  transcribeInWorker(kind, samples) {
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Nhận diện giọng nói quá lâu, thử đoạn ngắn hơn.'));
      }, 180000);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({
        id,
        type: 'transcribe',
        kind,
        dir: this.modelDir(kind),
        sampleRate: STT_TARGET_RATE,
        samples,
      });
    });
  }

  async transcribe(language, wavBuffer) {
    const lang = normalizeLanguage(language);
    const kind = kindForLanguage(lang);
    let parsed;
    try {
      parsed = parseWav16k(wavBuffer);
    } catch (error) {
      const bad = new Error(error instanceof Error ? error.message : String(error));
      bad.code = 'STT_BAD_AUDIO';
      throw bad;
    }
    if (!this.isReady(kind)) {
      this.ensure(kind).catch(() => {});
      const status = this.status();
      const info = kind === 'vi' ? status.models.vi : status.models.sv;
      const busy = new Error('Model giọng nói đang được tải về máy, xong sẽ tự nhận diện.');
      busy.code = 'STT_DOWNLOADING';
      busy.kind = kind;
      busy.progress = info.progress;
      throw busy;
    }
    const startedAt = Date.now();
    const text = await this.transcribeInWorker(kind, parsed.samples);
    return { text: String(text || '').trim(), language: lang, durationMs: Date.now() - startedAt };
  }

  async close() {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(new Error('STT đang tắt.'));
    }
    if (this.worker) {
      const worker = this.worker;
      this.worker = null;
      await worker.terminate();
    }
  }
}
