// STT worker: chạy sherpa-onnx (WASM) ngoài event loop chính.
// Nhận samples PCM float32 + model dir, trả về text. Models được load lười
// theo kind và giữ lại trong worker suốt vòng đời process.
import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sherpa = require('sherpa-onnx');

const recognizers = new Map();

function getRecognizer(kind, dir) {
  const cached = recognizers.get(kind);
  if (cached) return cached;
  let recognizer;
  if (kind === 'vi') {
    recognizer = sherpa.createOfflineRecognizer({
      modelConfig: {
        transducer: {
          encoder: `${dir}/encoder-epoch-12-avg-8.int8.onnx`,
          decoder: `${dir}/decoder-epoch-12-avg-8.onnx`,
          joiner: `${dir}/joiner-epoch-12-avg-8.int8.onnx`,
        },
        tokens: `${dir}/tokens.txt`,
        modelType: 'transducer',
      },
    });
  } else if (kind === 'sv') {
    recognizer = sherpa.createOfflineRecognizer({
      modelConfig: {
        senseVoice: {
          model: `${dir}/model.int8.onnx`,
          language: '',
          useInverseTextNormalization: 1,
        },
        tokens: `${dir}/tokens.txt`,
      },
    });
  } else {
    throw new Error(`Model STT không hỗ trợ: ${kind}`);
  }
  recognizers.set(kind, recognizer);
  return recognizer;
}

parentPort.on('message', (message) => {
  if (!message || message.type !== 'transcribe') return;
  try {
    const recognizer = getRecognizer(message.kind, message.dir);
    const stream = recognizer.createStream();
    try {
      stream.acceptWaveform(message.sampleRate, message.samples);
      recognizer.decode(stream);
      const text = recognizer.getResult(stream).text || '';
      parentPort.postMessage({ id: message.id, ok: true, text });
    } finally {
      stream.free();
    }
  } catch (error) {
    parentPort.postMessage({ id: message.id, ok: false, error: String(error?.message || error) });
  }
});
