import { useEffect, useRef, useState } from 'react';
import type { SttLanguage } from '../types.ts';
import { api } from '../api.ts';
import { openMicrophone } from '../microphone.ts';

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function speechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate =
    'SpeechRecognition' in window
      ? window.SpeechRecognition
      : 'webkitSpeechRecognition' in window
        ? window.webkitSpeechRecognition
        : undefined;
  return typeof candidate === 'function' ? (candidate as SpeechRecognitionConstructor) : null;
}

function delayMs(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

const STT_LANG_CODES: Record<SttLanguage, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  zh: 'cmn-Hans-CN'
};

// Encode 16kHz mono float PCM into 16-bit WAV for the backend STT endpoint.
function encodeWav16k(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 16000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

interface UseComposerVoiceOptions {
  disabled: boolean;
  onTranscript: (transcript: string) => void;
}

export function useComposerVoice({ disabled, onTranscript }: UseComposerVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sttBusy, setSttBusy] = useState(false);
  const [sttStarting, setSttStarting] = useState(false);
  const [sttNote, setSttNote] = useState('');
  const sttLang: SttLanguage = 'vi';

  const captureGeneration = useRef(0);
  const startingRef = useRef(false);
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);
  const recorderRef = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    chunks: Float32Array[];
    timer: number;
  } | null>(null);

  useEffect(() => {
    if (!listening) return;
    setRecordingSeconds(0);
    const started = Date.now();
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [listening]);

  const stopRecorder = (cancel = false): Float32Array | null => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return null;
    window.clearTimeout(rec.timer);
    try {
      rec.processor.disconnect();
    } catch {}
    try {
      rec.source.disconnect();
    } catch {}
    try {
      rec.stream.getTracks().forEach((track) => track.stop());
    } catch {}
    void rec.ctx.close().catch(() => {});
    setListening(false);
    setMicAnalyser(null);

    if (cancel || !rec.chunks.length) return null;
    const total = rec.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of rec.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  };

  const startWebSpeechFallback = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    try {
      const recog = new Ctor();
      recog.lang = STT_LANG_CODES[sttLang];
      recog.interimResults = false;
      recog.onresult = (event: SpeechRecognitionResultEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) setSttNote('');
        onTranscript(transcript);
      };
      recog.onend = () => setListening(false);
      recog.onerror = () => {
        setListening(false);
        setSttNote((prev) => prev || 'Không nhận diện được giọng nói, thử lại.');
      };
      recogRef.current = recog;
      recog.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const transcribeAndInsert = async (samples: Float32Array, language: SttLanguage) => {
    setSttBusy(true);
    setSttNote('Đang nhận diện…');
    const startedAt = Date.now();
    try {
      const audio = encodeWav16k(samples);
      for (;;) {
        try {
          const result = await api.transcribeStt(audio, language);
          if (result.text) {
            onTranscript(result.text);
            setSttNote('');
          } else {
            setSttNote('Không nghe rõ, thử nói lại.');
          }
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.startsWith('STT_DOWNLOADING:')) {
            const pct = message.slice('STT_DOWNLOADING:'.length);
            setSttNote(pct ? `Đang tải model giọng nói… ${pct}%` : 'Đang tải model giọng nói…');
            if (Date.now() - startedAt > 20 * 60 * 1000) {
              throw new Error('Tải model quá lâu, kiểm tra mạng rồi thử lại.');
            }
            await delayMs(2000);
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      setSttNote(error instanceof Error ? error.message : String(error));
    } finally {
      setSttBusy(false);
    }
  };

  const stopListening = () => {
    captureGeneration.current++;
    try {
      recogRef.current?.stop();
    } catch {}
    const samples = stopRecorder();
    if (samples) void transcribeAndInsert(samples, sttLang);
  };

  const cancelRecording = () => {
    captureGeneration.current++;
    try {
      recogRef.current?.abort();
    } catch {}
    recogRef.current = null;
    stopRecorder(true);
    setListening(false);
    setSttNote('');
  };

  const startRecording = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setSttStarting(true);
    const generation = ++captureGeneration.current;
    let openedStream: MediaStream | null = null;
    let openedContext: AudioContext | null = null;
    setSttNote('Đang mở micro…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO_MIC_API');
      const stream = (openedStream = await openMicrophone(navigator.mediaDevices));
      if (generation !== captureGeneration.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const webkitCtor = 'webkitAudioContext' in window ? window.webkitAudioContext : undefined;
      const Ctor = window.AudioContext ?? (typeof webkitCtor === 'function' ? (webkitCtor as typeof AudioContext) : undefined);
      if (!Ctor) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('NO_AUDIO_CONTEXT');
      }
      const ctx = (openedContext = new Ctor({ sampleRate: 16000 }));
      await ctx.resume();
      if (generation !== captureGeneration.current) {
        stream.getTracks().forEach((track) => track.stop());
        await ctx.close();
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(samples));
      };
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      setMicAnalyser(analyser);
      source.connect(processor);
      processor.connect(ctx.destination);
      const timer = window.setTimeout(() => {
        const samples = stopRecorder();
        if (samples) void transcribeAndInsert(samples, sttLang);
        else setSttNote('Chưa ghi được âm thanh nào.');
      }, 60000);
      recorderRef.current = { ctx, stream, source, processor, chunks, timer };
      setListening(true);
      setSttNote('Đang thu âm… Bấm gửi để nhận diện hoặc × để hủy.');
      window.setTimeout(() => {
        const rec = recorderRef.current;
        if (rec && rec.chunks.length === 0) {
          setSttNote('Micro chưa có tín hiệu, kiểm tra micro mặc định của hệ thống.');
        }
      }, 5000);
    } catch (error) {
      openedStream?.getTracks().forEach((track) => track.stop());
      if (openedContext && openedContext.state !== 'closed') void openedContext.close().catch(() => {});
      if (generation !== captureGeneration.current) return;
      const name = error instanceof Error ? error.name : '';
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[STT] startRecording failed:', name, detail);
      if (name === 'NotAllowedError' || name === 'SecurityError' || detail === 'NO_MIC_API') {
        setSttNote(
          'Micro đang bị chặn. Cho phép ohmyt dùng micro trong cài đặt quyền riêng tư của hệ điều hành hoặc trình duyệt.'
        );
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setSttNote(
          'Không tìm thấy micro khả dụng. Kết nối/bật micro và chọn thiết bị đầu vào trong cài đặt âm thanh, rồi thử lại.'
        );
      } else {
        setSttNote(`Không ghi được âm thanh (${name || detail}).`);
      }
      if (detail === 'NO_AUDIO_CONTEXT') startWebSpeechFallback();
    } finally {
      startingRef.current = false;
      setSttStarting(false);
    }
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    if (sttBusy || startingRef.current || disabled) return;
    void startRecording();
  };

  useEffect(() => {
    return () => {
      captureGeneration.current++;
      try {
        recogRef.current?.stop();
      } catch {}
      stopRecorder(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    listening,
    micAnalyser,
    recordingSeconds,
    sttBusy,
    sttStarting,
    sttNote,
    stopListening,
    cancelRecording,
    toggleListening
  };
}
