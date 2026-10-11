import {ComposerPresets} from './ComposerPresets.tsx';
import { MessageImages } from './MessageImages.tsx';
import { extractImageFiles, pastedImage, mergeImageAttachments } from '../imageAttachments.ts';
import type { ImageAttachment } from '../types.ts';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AIProvider, SttLanguage, SystemStatus } from '../types.ts';
import { api } from '../api.ts';
import { openMicrophone } from '../microphone.ts';
import { AudioWaveform } from './AudioWaveform.tsx';
import { ModelBrowser, findModelOption, providerMark, shortModelName } from './ModelPicker.tsx';
import { ModelIcon } from './ModelIcon.tsx';
import { Plus, Settings2, Mic, ArrowUp, Square, Bot, Server, ChevronDown, ChevronRight, ChevronLeft, Check, X, ImageIcon } from 'lucide-react';
import { ApprovalModePicker } from './ApprovalModePicker.tsx';
import type { ApprovalMode } from '../types.ts';

export interface ComposerSuggestion {
  label: string;
  prompt: string;
  icon?: React.ReactNode;
}

interface ComposerProps {
  sessionId?:string|null;
  approvalMode?: ApprovalMode;
  onChangeApprovalMode?: (mode: ApprovalMode) => Promise<void>;
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  status?: SystemStatus | null;
  onOpenProviders?: () => void;
  agentStatus?: 'idle' | 'running' | 'waiting_approval' | 'error';
  isStreaming?: boolean;
  isHome?: boolean;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: ComposerSuggestion[];
  onSend: (text: string, images?: ImageAttachment[]) => void | boolean | Promise<void | boolean>;
  onAbort?: () => void;
  onBusySend?: (kind:'queued'|'steering',text:string)=>Promise<unknown>;
  locale?: 'vi'|'en';
}

const AGENT_TEXT: Record<string, string> = {
  idle: 'Sẵn sàng',
  running: 'Đang chạy',
  waiting_approval: 'Chờ duyệt',
  error: 'Lỗi'
};

const AGENT_DOT: Record<string, string> = {
  idle: 'var(--text-tertiary)',
  running: 'var(--success)',
  waiting_approval: 'var(--warning)',
  error: 'var(--danger)'
};

const EFFORT_OPTIONS = ['Tắt', 'Thấp', 'Trung bình', 'Cao', 'Cực cao', 'Tối đa'] as const;
const EFFORT_STORAGE_KEY = 'ohmyt_effort';

function loadEffort(): string {
  try {
    const saved = window.localStorage.getItem(EFFORT_STORAGE_KEY);
    if (saved && (EFFORT_OPTIONS as readonly string[]).includes(saved)) return saved;
  } catch {}
  return 'Trung bình';
}

function speechRecognitionCtor(): (new () => any) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return (typeof ctor === 'function' ? ctor : null) as (new () => any) | null;
}

const STT_LANG_CODES: Record<SttLanguage, string> = { vi: 'vi-VN', en: 'en-US', zh: 'cmn-Hans-CN' };

// Mã hóa PCM float mono 16kHz thành WAV 16-bit để gửi lên backend STT.
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

export const Composer: React.FC<ComposerProps> = ({
  sessionId,
  approvalMode = 'ask',
  onChangeApprovalMode,
  providers,
  selectedModel,
  onSelectModel,
  status = null,
  onOpenProviders,
  agentStatus = 'idle',
  isStreaming = false,
  isHome = false,
  disabled = false,
  placeholder = 'Nhập yêu cầu tác vụ (Enter để gửi, Shift+Enter xuống dòng)...',
  suggestions = [],
  onSend,
  onAbort, onBusySend,locale='vi'
}) => {
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  useEffect(() => {
    if (!listening) return;
    setRecordingSeconds(0);

    const started = Date.now();
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [listening]);

  const sttLang: SttLanguage = 'vi';
  const [sttBusy, setSttBusy] = useState(false);
  const [sttStarting, setSttStarting] = useState(false);
  const captureGeneration = useRef(0);
  const startingRef = useRef(false);
  const [sttNote, setSttNote] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [configView, setConfigView] = useState<'menu' | 'models'>('menu');
  const [effortOpen, setEffortOpen] = useState(false);
  const [effort, setEffort] = useState<string>(loadEffort);
  const composerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setCompact(entries[0].contentRect.width < 640));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [sending,setSending]=useState(false);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteBusy = useRef(false);

  const addFiles = async (files: File[]) => {
    if (disabled || isStreaming || pasteBusy.current || !files.length) return;
    pasteBusy.current = true;
    setImageBusy(true);
    setImageError('');
    try {
      const added = await Promise.all(files.map(pastedImage));
      const merged = mergeImageAttachments(images, added);
      if (merged.length > 4) throw new Error('Mỗi tin nhắn tối đa 4 ảnh.');
      if (merged.reduce((sum, image) => sum + image.dataUrl.length * 0.75, 0) > 12 * 1024 * 1024) {
        throw new Error('Tổng ảnh trong tin nhắn tối đa 12 MB.');
      }
      setImages(current => mergeImageAttachments(current, added));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Không đọc được ảnh.');
    } finally {
      pasteBusy.current = false;
      setImageBusy(false);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    const files = extractImageFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    await addFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length) {
      await addFiles(Array.from(list));
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = extractImageFiles(e.dataTransfer);
    if (files.length) await addFiles(files);
  };

  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || disabled || isStreaming) return;
      const active = document.activeElement;
      if (active && active !== textareaRef.current && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
        return;
      }
      const files = extractImageFiles(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      void addFiles(files);
      textareaRef.current?.focus();
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [images, disabled, isStreaming]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<any>(null);
  const recorderRef = useRef<{ ctx: AudioContext; stream: MediaStream; source: MediaStreamAudioSourceNode; processor: ScriptProcessorNode; chunks: Float32Array[]; timer: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<HTMLDivElement>(null);

  const selectedOption = findModelOption(providers, selectedModel);
  const selectedMark = selectedOption ? providerMark(selectedOption.provider, selectedOption.model) : null;

  const handleSelectModel = (v: { providerId: string; modelId: string }) => {
    onSelectModel(v);
  };

  const changeEffort = (value: string) => {
    setEffort(value);
    try { window.localStorage.setItem(EFFORT_STORAGE_KEY, value); } catch {}
    setEffortOpen(false);
  };

  useEffect(() => {
    if (!configOpen) return;
    const onDown = (e: MouseEvent) => {
      // Khi đang mở modal models qua portal, overlay click tự xử lý đóng
      if (configView === 'models') return;
      if (configRef.current && !configRef.current.contains(e.target as Node)) {
        setConfigOpen(false);
        setConfigView('menu');
        setEffortOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfigOpen(false);
        setConfigView('menu');
        setEffortOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [configOpen, configView]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        stopListening();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      captureGeneration.current++;
      try { recogRef.current?.stop(); } catch {}
      stopRecorder(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertTranscript = (transcript: string) => {
    if (!transcript.trim()) return;
    setInput(prev => (prev ? prev.replace(/\s+$/, '') + ' ' : '') + transcript.trim() + ' ');
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
        el.focus();
      }
    });
  };

  // Dự phòng khi không mở được micro: dùng Web Speech API của trình duyệt (nếu có).
  const startWebSpeechFallback = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    try {
      const recog = new Ctor();
      recog.lang = STT_LANG_CODES[sttLang];
      recog.interimResults = false;
      recog.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) setSttNote('');
        insertTranscript(transcript);
      };
      recog.onend = () => setListening(false);
      recog.onerror = () => {
        setListening(false);
        // Giữ nguyên lỗi cụ thể từ bước ghi âm nếu đã có, đừng ghi đè.
        setSttNote(prev => prev || 'Không nhận diện được giọng nói, thử lại.');
      };
      recogRef.current = recog;
      recog.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const stopRecorder = (cancel = false): Float32Array | null => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return null;
    window.clearTimeout(rec.timer);
    try { rec.processor.disconnect(); } catch {}
    try { rec.source.disconnect(); } catch {}
    try { rec.stream.getTracks().forEach(track => track.stop()); } catch {}
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
            insertTranscript(result.text);
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
            if (Date.now() - startedAt > 20 * 60 * 1000) throw new Error('Tải model quá lâu, kiểm tra mạng rồi thử lại.');
            await new Promise(resolve => setTimeout(resolve, 2000));
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
    try { recogRef.current?.stop(); } catch {}
    const samples = stopRecorder();
    if (samples) void transcribeAndInsert(samples, sttLang);
  };

  const cancelRecording = () => {
    captureGeneration.current++;
    try { recogRef.current?.abort(); } catch {}
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
      const stream = openedStream = await openMicrophone(navigator.mediaDevices);
      if (generation !== captureGeneration.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('NO_AUDIO_CONTEXT');
      }
      const ctx = openedContext = new Ctor({ sampleRate: 16000 });
      await ctx.resume();
      if (generation !== captureGeneration.current) {
        stream.getTracks().forEach(track => track.stop());
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
      // Watchdog: 5s mà chưa có tín hiệu micro nào thì báo ngay.
      window.setTimeout(() => {
        const rec = recorderRef.current;
        if (rec && rec.chunks.length === 0) {
          setSttNote('Micro chưa có tín hiệu, kiểm tra micro mặc định của hệ thống.');
        }
      }, 5000);
    } catch (error) {
      openedStream?.getTracks().forEach(track => track.stop());
      if (openedContext && openedContext.state !== 'closed') void openedContext.close().catch(() => {});
      if (generation !== captureGeneration.current) return;
      const name = error instanceof Error ? error.name : '';
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[STT] startRecording failed:', name, detail);
      if (name === 'NotAllowedError' || name === 'SecurityError' || detail === 'NO_MIC_API') {
        setSttNote(`Micro đang bị chặn. Cho phép ohmyt dùng micro trong cài đặt quyền riêng tư của hệ điều hành hoặc trình duyệt.`);
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setSttNote(`Không tìm thấy micro khả dụng. Kết nối/bật micro và chọn thiết bị đầu vào trong cài đặt âm thanh, rồi thử lại.`);
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

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !images.length) || (isStreaming&&!onBusySend) || disabled || imageBusy || sending) return;
    stopListening();
    textareaRef.current?.focus({preventScroll:true});
    setSending(true);
    try {
      if(isStreaming&&images.length){setImageError(locale==='en'?'Pending requests support text only.':'Yêu cầu đang chờ chỉ hỗ trợ văn bản.');return;}
      const sent = isStreaming&&onBusySend?await onBusySend('queued',trimmed):await onSend(trimmed, images);
      if(sent === false)return;
      setImages([]);setImageError('');setInput(current=>current.trim()===trimmed?'':current);
    } catch(error){setImageError(error instanceof Error ? error.message : 'Chưa gửi được. Thử lại nha.');}
    finally {setSending(false);}
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, isHome ? 160 : 140)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (listening) stopListening();
      else handleSend();
    }
  };

  const canSend = (input.trim().length > 0 || images.length > 0) && (!isStreaming||Boolean(onBusySend)) && !disabled && !imageBusy && !sending;

  return (
    <div ref={composerRef} className={`w-full composer-responsive${compact ? ' is-compact' : ''}`}>
      <div
        className={`composer-shell relative px-4 pt-3 pb-5${isHome ? ' composer-shell-home' : ''}${isDragOver ? ' is-dragging' : ''}`}
        style={{
          backgroundColor: 'var(--composer-surface, var(--surface))',
          ...(isHome ? {} : { border: '1px solid var(--border)', paddingBottom: 10 }),
          ...(isDragOver ? { outline: '2px dashed var(--accent)', outlineOffset: -2 } : {})
        }}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={(e) => {
          if (e.target === e.currentTarget) textareaRef.current?.focus();
        }}
      >
        <MessageImages images={images} onRemove={index=>setImages(current=>current.filter((_,i)=>i!==index))}/>
        {imageBusy && <p className="composer-image-note" role="status">Đang đọc ảnh…</p>}
        {imageError && <p className="composer-image-error" role="alert">{imageError}</p>}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={isHome ? placeholder : isStreaming && onBusySend ? (locale === 'en' ? 'Write the next message…' : 'Nhập tin nhắn tiếp theo…') : 'Nhập tin nhắn…'}
          disabled={disabled}
          aria-label="Nhập yêu cầu tác vụ"
          className={`w-full bg-transparent leading-relaxed resize-none focus:outline-none ${isHome ? 'min-h-[52px] max-h-[160px] composer-home-input' : 'min-h-[48px] max-h-[140px] text-[13.5px]'}`}
          style={{ color: 'var(--text-primary)' }}
        />

        <div className="composer-toolbar flex items-center justify-between gap-2 mt-1.5">
          <div className="flex items-center gap-1 min-w-0">
          <div className="relative" ref={menuRef} style={undefined}>
            <button
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              disabled={disabled}
              aria-label="Tác vụ và đính kèm"
              aria-expanded={menuOpen}
              title="Tác vụ và đính kèm"
              className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Plus size={16} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            {menuOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 mb-2 w-72 max-w-[80vw] rounded-xl p-1.5 z-20"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-composer)' }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left cursor-pointer hover:bg-[var(--surface-hover)]"
                >
                  <span
                    className="p-1.5 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
                  >
                    <ImageIcon size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      Đính kèm ảnh
                    </span>
                    <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                      PNG, JPG, WebP (hoặc Ctrl+V để dán)
                    </span>
                  </span>
                </button>
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setInput(s.prompt);
                      setMenuOpen(false);
                      requestAnimationFrame(() => {
                        const el = textareaRef.current;
                        if (el) {
                          el.style.height = 'auto';
                          el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                          el.focus();
                        }
                      });
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left cursor-pointer hover:bg-[var(--surface-hover)]"
                  >
                    {s.icon && (
                      <span
                        className="p-1.5 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
                      >
                        {s.icon}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {s.label}
                      </span>
                      <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {s.prompt}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {onChangeApprovalMode && <ApprovalModePicker mode={approvalMode} onChange={onChangeApprovalMode} disabled={disabled || isStreaming} />}
          </div>
          <div className="flex items-center gap-1 min-w-0" style={undefined}>
            <div className="relative" ref={configRef}>
              <button
                type="button"
                onClick={() => { setConfigOpen(open => !open); setConfigView('menu'); setEffortOpen(false); }}
                disabled={disabled || sending}
                aria-label={selectedOption ? `Mô hình: ${shortModelName(selectedOption.model)}, nỗ lực ${effort}` : 'Chọn mô hình'}
                aria-expanded={configOpen}
                title={selectedOption ? `${shortModelName(selectedOption.model)} · ${effort}` : 'Cấu hình mô hình'}
                className="composer-model-pill"
              >
                {!selectedOption && compact && <Settings2 size={16} />}
                {selectedOption && (
                  <span className="model-provider-mark" aria-hidden="true" style={{ background: 'transparent' }}>
                    <ModelIcon provider={selectedOption.provider} model={selectedOption.model} size={15} />
                  </span>
                )}
                <span className="composer-model-pill-name truncate">
                  {selectedOption ? shortModelName(selectedOption.model) : 'Chọn mô hình'}
                </span>
                <span className="composer-model-pill-effort">{effort}</span>
                <ChevronDown size={14} className={`composer-model-pill-chevron${configOpen ? ' is-open' : ''}`} aria-hidden="true" />
              </button>

              {configOpen && configView === 'menu' && (
                <div className={`composer-config-pop${isHome ? ' is-down' : ''}`} role="dialog" aria-label="Cấu hình mô hình">
                  <ComposerPresets en={locale==='en'} disabled={disabled||isStreaming} sessionId={sessionId}/>
                  <button
                    type="button"
                    className="composer-config-row"
                    onClick={() => setConfigView('models')}
                  >
                    <span className="composer-config-label">Mô hình</span>
                    <span className="composer-config-value">
                      {selectedOption && (
                        <span className="model-provider-mark" aria-hidden="true" style={{ background: 'transparent' }}>
                          <ModelIcon provider={selectedOption.provider} model={selectedOption.model} size={16} />
                        </span>
                      )}
                      <span className="truncate">{selectedOption ? shortModelName(selectedOption.model) : 'Chọn mô hình'}</span>
                    </span>
                    <ChevronRight size={14} className="composer-config-arrow" aria-hidden="true" />
                  </button>
                  <div
                    className="composer-config-row lobe-actions-has-sub submenu-left"
                    role="menuitem" tabIndex={0}
                    onMouseEnter={() => setEffortOpen(true)}
                    onMouseLeave={() => setEffortOpen(false)}
                    onClick={() => setEffortOpen(open => !open)}
                  >
                    <span className="composer-config-label">Nỗ lực Lý luận</span>
                    <span className="composer-config-value"><span>{effort}</span></span>
                    <ChevronRight size={14} className="composer-config-arrow" aria-hidden="true" />
                    {effortOpen && (
                      <div role="menu" aria-label="Nỗ lực lý luận" className="lobe-actions-submenu">
                        <div className="lobe-actions-submenu-list">
                          {EFFORT_OPTIONS.map(level => (
                            <button
                              key={level}
                              type="button"
                              role="menuitemradio"
                              aria-checked={effort === level}
                              className="lobe-actions-item"
                              onClick={e => { e.stopPropagation(); changeEffort(level); }}
                            >
                              <span className="lobe-actions-label">{level}</span>
                              {effort === level && <Check size={14} aria-hidden="true" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {configOpen && configView === 'models' && typeof document !== 'undefined' && createPortal(
                <div
                  className="composer-model-modal-overlay"
                  onClick={() => { setConfigOpen(false); setConfigView('menu'); }}
                >
                  <div
                    className="composer-model-modal"
                    role="dialog"
                    aria-label="Chọn mô hình AI"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="composer-config-browser-head">
                      <button
                        type="button"
                        aria-label="Quay lại"
                        onClick={() => setConfigView('menu')}
                        className="p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="font-semibold text-sm">Chọn mô hình</span>
                      <button
                        type="button"
                        aria-label="Đóng"
                        onClick={() => { setConfigOpen(false); setConfigView('menu'); }}
                        className="p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="composer-config-browser-body flex-1 min-h-0">
                      <ModelBrowser
                        providers={providers}
                        value={selectedModel}
                        autoFocusSearch
                        onPick={option => {
                          handleSelectModel({ providerId: option.provider.id, modelId: option.model.model_id });
                          setConfigOpen(false);
                          setConfigView('menu');
                        }}
                        onOpenProviders={() => { setConfigOpen(false); setConfigView('menu'); onOpenProviders?.(); }}
                      />
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
            {listening && (
              <div className="composer-recording">
                <span className="sr-only" role="status">{locale === 'en' ? 'Recording audio' : 'Đang thu âm'}</span>
                <button type="button" onClick={cancelRecording} className="composer-recording-cancel"
                  aria-label={locale === 'en' ? 'Cancel recording' : 'Hủy bản thu'}
                  title={locale === 'en' ? 'Cancel recording' : 'Hủy bản thu'}><X size={14} /></button>
                <div className="composer-recording-body">
                  <span className="composer-recording-dot" aria-hidden="true" />
                  <AudioWaveform analyser={micAnalyser} />
                  <span className="composer-recording-time" aria-label={locale === 'en' ? 'Recording duration' : 'Thời gian thu'}>
                    {`${Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`}
                  </span>
                </div>
                <button type="button" onClick={stopListening} disabled={disabled} className="composer-recording-submit"
                  aria-label={locale === 'en' ? 'Submit recording' : 'Gửi bản thu'}
                  title={locale === 'en' ? 'Submit recording' : 'Gửi bản thu'}><ArrowUp size={17} /></button>
              </div>
            )}
            {!listening && (
            <button
              type="button"
              onClick={toggleListening}
              aria-pressed={listening}
              disabled={disabled || sttBusy || sttStarting}
              aria-label={listening ? 'Dừng ghi âm' : sttBusy ? 'Đang nhận diện giọng nói' : 'Nhập bằng giọng nói (offline)'}
              title={listening ? 'Dừng ghi âm' : sttBusy ? 'Đang nhận diện giọng nói' : 'Nhập bằng giọng nói (offline)'}
              className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 hover:bg-[var(--surface-hover)]"
              style={{ color: listening ? 'var(--danger)' : 'var(--text-secondary)' }}
            >
              <Mic size={15} className={listening || sttBusy ? 'animate-pulse' : undefined} />
            </button>
            )}
            {!listening && (!isStreaming || canSend) && <button
              onMouseDown={event=>event.preventDefault()}
              type="button" onClick={handleSend} disabled={!canSend}
              aria-label={isStreaming ? 'Gửi tin nhắn tiếp theo' : 'Gửi yêu cầu'} title={isStreaming ? 'Gửi tin nhắn tiếp theo' : 'Gửi yêu cầu'}
              className="composer-send-btn" data-disabled={!canSend}
            ><ArrowUp size={17} /></button>}
            {!listening && isStreaming && !canSend && <button
              type="button" onClick={onAbort} aria-label="Dừng tác vụ" title="Dừng tác vụ"
              className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-all cursor-pointer"
              style={{backgroundColor:'var(--accent)',color:'var(--accent-contrast)'}}
            ><Square size={13} fill="currentColor" /></button>}
          </div>
        </div>
      </div>

      <div className="composer-status flex items-center justify-between gap-2 mt-1 px-1">
        <div className="flex items-center gap-3 min-w-0 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          <span className="inline-flex items-center gap-1.5 min-w-0" title={`Agent: ${AGENT_TEXT[agentStatus] ?? agentStatus}`}>
            <Bot size={12} className="flex-shrink-0" />
            <span className="truncate">Agent</span>
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: AGENT_DOT[agentStatus] ?? 'var(--text-tertiary)' }}
            />
            <span className="truncate">{AGENT_TEXT[agentStatus] ?? agentStatus}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 min-w-0" title={status ? `${status.engine} · ${status.toolsCount} công cụ` : 'Chưa kết nối engine'}>
            <Server size={12} className="flex-shrink-0" />
            <span className="truncate">
              {status ? `${status.engine} · ${status.toolsCount} công cụ` : 'Chưa kết nối'}
            </span>
          </span>
          {sttNote && !listening ? <span role="status" className="truncate">{sttNote}</span> : null}
        </div>
      </div>
    </div>
  );
};
