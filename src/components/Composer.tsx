import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ContextMeter } from './ContextMeter.tsx';
import type { ContextUsage } from '../api.ts';
import { MiniGoal } from './MiniGoal.tsx';
import { MessageImages } from './MessageImages.tsx';
import { extractImageFiles, pastedImage, mergeImageAttachments } from '../imageAttachments.ts';
import type { AIProvider, ApprovalMode, ImageAttachment, SystemStatus } from '../types.ts';
import { api } from '../api.ts';
import { parseGoalCommand } from '../../shared/goal_command.js';
import { AudioWaveform } from './AudioWaveform.tsx';
import { Mic, ArrowUp, Square, Bot, Server, X, Target } from 'lucide-react';
import { ApprovalModePicker } from './ApprovalModePicker.tsx';
import { useComposerVoice } from './useComposerVoice.ts';
import {
  ComposerAttachmentMenu,
  ComposerModelConfig,
  EFFORT_STORAGE_KEY,
  loadEffort
} from './ComposerMenus.tsx';

export interface ComposerSuggestion {
  label: string;
  prompt: string;
  description?: string;
  onSelect?: () => void;
  icon?: React.ReactNode;
}

// Draft attachments stay in memory; switching sessions must not discard unsent work.
const drafts = new Map<string, { input: string; images: ImageAttachment[]; goalMode: boolean }>();

interface ComposerProps {
  contextUsage?: ContextUsage | null;
  sessionId?: string | null;
  onRefreshGoal?: () => void;
  approvalMode?: ApprovalMode;
  onChangeApprovalMode?: (mode: ApprovalMode) => Promise<void>;
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  status?: SystemStatus | null;
  onOpenProviders?: () => void;
  agentStatus?: 'idle' | 'running' | 'waiting_approval' | 'error';
  isStreaming?: boolean;
  finishingState?: 'stopping' | 'settling';
  isHome?: boolean;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: ComposerSuggestion[];
  humanReview?: boolean;
  waitingForInput?: boolean;
  onSend: (text: string, images?: ImageAttachment[]) => void | boolean | Promise<void | boolean>;
  onAbort?: () => void;
  onBusySend?: (kind: 'queued' | 'steering', text: string) => Promise<unknown>;
  locale?: 'vi' | 'en';
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

export const Composer: React.FC<ComposerProps> = ({
  sessionId,
  onRefreshGoal,
  contextUsage,
  approvalMode = 'ask',
  onChangeApprovalMode,
  providers,
  selectedModel,
  onSelectModel,
  status = null,
  onOpenProviders,
  agentStatus = 'idle',
  isStreaming = false,
  finishingState,
  isHome = false,
  disabled = false,
  placeholder = 'Nhập yêu cầu tác vụ (Enter để gửi, Shift+Enter xuống dòng)...',
  suggestions = [],
  humanReview = false,
  waitingForInput = false,
  onSend,
  onAbort,
  onBusySend,
  locale = 'vi'
}) => {
  const draftKey = sessionId || '__home__';
  const [input, setInput] = useState(() => drafts.get(draftKey)?.input || '');
  const [goalMode, setGoalMode] = useState(() => drafts.get(draftKey)?.goalMode || false);
  const [commandDismissed, setCommandDismissed] = useState(false);
  const goalSuggestion =
    Boolean(sessionId) &&
    !goalMode &&
    !disabled &&
    !commandDismissed &&
    /^\/(?:g(?:o(?:a(?:l)?)?)?)?$/i.test(input.trim());

  const [menuOpen, setMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configView, setConfigView] = useState<'menu' | 'models'>('menu');
  const [effortOpen, setEffortOpen] = useState(false);
  const [effort, setEffort] = useState<string>(loadEffort);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<HTMLDivElement>(null);
  const pasteBusy = useRef(false);

  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setCompact(entries[0].contentRect.width < 640));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [sending, setSending] = useState(false);
  const [images, setImages] = useState<ImageAttachment[]>(() => drafts.get(draftKey)?.images || []);
  useLayoutEffect(() => {
    if (input || images.length || goalMode) drafts.set(draftKey, { input, images, goalMode });
    else drafts.delete(draftKey);
  }, [draftKey, input, images, goalMode]);

  const [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const openGoal = () => {
    setGoalMode(true);
    setInput((current) => (goalSuggestion ? '' : current.replace(/^\s*\/goal(?:\s+|$)/i, '')));
    setCommandDismissed(false);
    setMenuOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const insertTranscript = (transcript: string) => {
    if (!transcript.trim()) return;
    setInput((prev) => (prev ? prev.replace(/\s+$/, '') + ' ' : '') + transcript.trim() + ' ');
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
        el.focus();
      }
    });
  };

  const {
    listening,
    micAnalyser,
    recordingSeconds,
    sttBusy,
    sttStarting,
    sttNote,
    stopListening,
    cancelRecording,
    toggleListening
  } = useComposerVoice({ disabled, onTranscript: insertTranscript });

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
      setImages((current) => mergeImageAttachments(current, added));
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
      if (
        active &&
        active !== textareaRef.current &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active instanceof HTMLElement && active.isContentEditable))
      ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, disabled, isStreaming]);

  const changeEffort = (value: string) => {
    setEffort(value);
    try {
      window.localStorage.setItem(EFFORT_STORAGE_KEY, value);
    } catch {}
    setEffortOpen(false);
  };

  useEffect(() => {
    if (!configOpen) return;
    const onDown = (e: MouseEvent) => {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (sessionId && trimmed.toLowerCase() === '/goal' && !disabled) {
      openGoal();
      return;
    }
    if ((!trimmed && !images.length) || (isStreaming && !onBusySend) || disabled || imageBusy || sending) return;
    stopListening();
    textareaRef.current?.focus({ preventScroll: true });
    setSending(true);
    try {
      if (
        !goalMode &&
        sessionId &&
        /^\/goal(?:\s|$)/i.test(trimmed) &&
        parseGoalCommand(trimmed.replace(/^\/goal\s*/i, '')).kind !== 'create'
      ) {
        if (images.length) {
          throw new Error(
            locale === 'en'
              ? 'Goal controls do not accept image attachments.'
              : 'Lệnh điều khiển Goal không nhận ảnh đính kèm.'
          );
        }
        const { goal } = await api.getGoal(sessionId);
        await api.goalCommand(sessionId, trimmed, goal?.revision || 0);
        setInput('');
        setImageError('');
        return;
      }
      if (isStreaming && images.length) {
        setImageError(locale === 'en' ? 'Pending requests support text only.' : 'Yêu cầu đang chờ chỉ hỗ trợ văn bản.');
        return;
      }
      if (goalMode && sessionId && !isStreaming) {
        const { goal } = await api.getGoal(sessionId);
        if (!goal || goal.phase === 'completed' || goal.phase === 'cancelled') {
          await api.createGoal(sessionId, {
            objective: trimmed,
            steps: [],
            maxRounds: 256,
            expectedRevision: goal?.revision || 0
          });
        }
      }
      const prompt = goalMode ? `/goal ${trimmed}` : trimmed;
      const sent = isStreaming && onBusySend ? await onBusySend('queued', prompt) : await onSend(prompt, images);
      if (sent === false) return;
      setImages([]);
      setImageError('');
      setGoalMode(false);
      setInput((current) => (current.trim() === trimmed ? '' : current));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Chưa gửi được. Thử lại nha.');
    } finally {
      setSending(false);
    }
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommandDismissed(false);
    const value = e.target.value;
    // Keep the slash text until submit: stripping after the first character
    // would turn a partially typed /goal pause into a new objective named pause.
    setInput(value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, isHome ? 160 : 140)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      goalMode &&
      e.key === 'Backspace' &&
      !e.nativeEvent.isComposing &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      e.preventDefault();
      setGoalMode(false);
      return;
    }
    if (goalSuggestion && !e.nativeEvent.isComposing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandDismissed(true);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        openGoal();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (listening) stopListening();
      else void handleSend();
    }
  };

  const canSend =
    (input.trim().length > 0 || images.length > 0) &&
    (!isStreaming || Boolean(onBusySend)) &&
    !disabled &&
    !imageBusy &&
    !sending;

  return (
    <div ref={composerRef} className={`w-full composer-responsive${compact ? ' is-compact' : ''}`}>
      {sessionId && <MiniGoal key={sessionId} sessionId={sessionId} locale={locale} onRefresh={onRefreshGoal} />}
      <div
        className={`composer-shell relative px-4 pt-3 pb-5${isHome ? ' composer-shell-home' : ''}${isDragOver ? ' is-dragging' : ''}`}
        style={{
          backgroundColor: 'var(--composer-surface, var(--surface))',
          ...(isHome ? {} : { paddingBottom: 10 }),
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
        <MessageImages images={images} onRemove={(index) => setImages((current) => current.filter((_, i) => i !== index))} />
        {imageBusy && (
          <p className="composer-image-note" role="status">
            Đang đọc ảnh…
          </p>
        )}
        {imageError && (
          <p className="composer-image-error" role="alert">
            {imageError}
          </p>
        )}
        {goalSuggestion && (
          <div
            id="goal-command-menu"
            role="listbox"
            aria-label={locale === 'en' ? 'Chat commands' : 'Lệnh trong chat'}
            className="absolute bottom-full left-0 right-0 mb-2 p-1 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-lg z-20"
          >
            <button
              id="goal-command-option"
              type="button"
              role="option"
              aria-selected="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openGoal}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-hover)]"
            >
              <Target size={18} />
              <span>
                <span className="block font-medium">
                  Goal <span className="text-xs opacity-60">/goal</span>
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {locale === 'en' ? 'Set a goal for this request' : 'Đặt mục tiêu cho yêu cầu này'}
                </span>
              </span>
            </button>
          </div>
        )}
        <div className="flex items-start gap-2">
          {goalMode && (
            <span data-goal-mode="true" className="shrink-0 text-[13.5px] leading-relaxed font-semibold" style={{ color: '#2563eb' }}>
              Goal
            </span>
          )}
          <textarea
            ref={textareaRef}
            aria-controls={goalSuggestion ? 'goal-command-menu' : undefined}
            aria-activedescendant={goalSuggestion ? 'goal-command-option' : undefined}
            rows={1}
            value={input}
            onChange={handleInput}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder={
              waitingForInput
                ? locale === 'en'
                  ? 'Reply to the agent…'
                  : 'Trả lời agent…'
                : isHome
                  ? placeholder
                  : isStreaming && onBusySend
                    ? locale === 'en'
                      ? 'Write the next message…'
                      : 'Nhập tin nhắn tiếp theo…'
                    : 'Nhập tin nhắn…'
            }
            disabled={disabled}
            aria-label="Nhập yêu cầu tác vụ"
            className={`w-full min-w-0 flex-1 bg-transparent leading-relaxed resize-none focus:outline-none ${isHome ? 'min-h-[52px] max-h-[160px] composer-home-input' : 'min-h-[48px] max-h-[140px] text-[13.5px]'}`}
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <div className="composer-toolbar flex items-center justify-between gap-2 mt-1.5">
          <div className="flex items-center gap-1 min-w-0">
            <ComposerAttachmentMenu
              menuRef={menuRef}
              fileInputRef={fileInputRef}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
              disabled={disabled}
              isStreaming={isStreaming}
              sending={sending}
              isHome={isHome}
              locale={locale}
              sessionId={sessionId}
              suggestions={suggestions}
              onFileSelect={handleFileSelect}
              onOpenGoal={openGoal}
              onPrependPrompt={(prompt) => {
                setInput((current) => prompt + current);
                setMenuOpen(false);
                requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
              }}
              onApplySuggestion={(s) => {
                if (s.onSelect) {
                  setMenuOpen(false);
                  s.onSelect();
                  return;
                }
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
            />
            {onChangeApprovalMode && (
              <ApprovalModePicker mode={approvalMode} onChange={onChangeApprovalMode} disabled={disabled || isStreaming} />
            )}
          </div>

          <div className="flex items-center gap-1 min-w-0">
            <ContextMeter usage={contextUsage} selectedModel={selectedModel} en={locale === 'en'} />
            <ComposerModelConfig
              configRef={configRef}
              providers={providers}
              selectedModel={selectedModel}
              onSelectModel={onSelectModel}
              onOpenProviders={onOpenProviders}
              configOpen={configOpen}
              setConfigOpen={setConfigOpen}
              configView={configView}
              setConfigView={setConfigView}
              effortOpen={effortOpen}
              setEffortOpen={setEffortOpen}
              effort={effort}
              onChangeEffort={changeEffort}
              compact={compact}
              disabled={disabled}
              sending={sending}
              isStreaming={isStreaming}
              isHome={isHome}
              locale={locale}
              sessionId={sessionId}
            />
            {listening && (
              <div className="composer-recording">
                <span className="sr-only" role="status">
                  {locale === 'en' ? 'Recording audio' : 'Đang thu âm'}
                </span>
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="composer-recording-cancel"
                  aria-label={locale === 'en' ? 'Cancel recording' : 'Hủy bản thu'}
                  title={locale === 'en' ? 'Cancel recording' : 'Hủy bản thu'}
                >
                  <X size={14} />
                </button>
                <div className="composer-recording-body">
                  <span className="composer-recording-dot" aria-hidden="true" />
                  <AudioWaveform analyser={micAnalyser} />
                  <span
                    className="composer-recording-time"
                    aria-label={locale === 'en' ? 'Recording duration' : 'Thời gian thu'}
                  >
                    {`${Math.floor(recordingSeconds / 60)
                      .toString()
                      .padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopListening}
                  disabled={disabled}
                  className="composer-recording-submit"
                  aria-label={locale === 'en' ? 'Submit recording' : 'Gửi bản thu'}
                  title={locale === 'en' ? 'Submit recording' : 'Gửi bản thu'}
                >
                  <ArrowUp size={17} />
                </button>
              </div>
            )}
            {!listening && (
              <button
                type="button"
                onClick={toggleListening}
                aria-pressed={listening}
                disabled={disabled || sttBusy || sttStarting}
                aria-label={
                  listening ? 'Dừng ghi âm' : sttBusy ? 'Đang nhận diện giọng nói' : 'Nhập bằng giọng nói (offline)'
                }
                title={
                  listening ? 'Dừng ghi âm' : sttBusy ? 'Đang nhận diện giọng nói' : 'Nhập bằng giọng nói (offline)'
                }
                className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 hover:bg-[var(--surface-hover)]"
                style={{ color: listening ? 'var(--danger)' : 'var(--text-secondary)' }}
              >
                <Mic size={15} className={listening || sttBusy ? 'animate-pulse' : undefined} />
              </button>
            )}
            {!listening && (!isStreaming || canSend) && (
              <button
                onMouseDown={(event) => event.preventDefault()}
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                aria-label={isStreaming ? 'Gửi tin nhắn tiếp theo' : 'Gửi yêu cầu'}
                title={isStreaming ? 'Gửi tin nhắn tiếp theo' : 'Gửi yêu cầu'}
                className="composer-send-btn"
                data-disabled={!canSend}
              >
                <ArrowUp size={17} />
              </button>
            )}
            {!listening && isStreaming && !canSend && (
              <button
                type="button"
                onClick={onAbort}
                disabled={Boolean(finishingState)}
                aria-label={
                  finishingState === 'stopping'
                    ? 'Đang dừng tác vụ'
                    : finishingState
                      ? 'Đang hoàn tất tác vụ'
                      : 'Dừng tác vụ'
                }
                title={
                  finishingState === 'stopping'
                    ? 'Đang dừng tác vụ'
                    : finishingState
                      ? 'Đang hoàn tất tác vụ'
                      : 'Dừng tác vụ'
                }
                className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-all cursor-pointer"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                <Square size={13} fill="currentColor" />
              </button>
            )}
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
            <span className="truncate">
              {finishingState === 'stopping'
                ? locale === 'en'
                  ? 'Stopping…'
                  : 'Đang dừng…'
                : finishingState
                  ? locale === 'en'
                    ? 'Finishing…'
                    : 'Đang hoàn tất…'
                  : waitingForInput
                    ? 'Chờ bạn trả lời'
                    : (AGENT_TEXT[agentStatus] ?? agentStatus)}
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1.5 min-w-0"
            title={status ? `${status.engine} · ${status.toolsCount} công cụ` : 'Chưa kết nối engine'}
          >
            <Server size={12} className="flex-shrink-0" />
            <span className="truncate">
              {status ? `${status.engine} · ${status.toolsCount} công cụ` : 'Chưa kết nối'}
            </span>
          </span>
          {sttNote && !listening ? (
            <span role="status" className="truncate">
              {sttNote}
            </span>
          ) : null}
          {humanReview && (
            <span
              className="truncate"
              title="Chat này cần bạn duyệt thao tác sửa dữ liệu hoặc gửi ra ngoài, kể cả khi chọn chế độ tự động."
            >
              Bạn duyệt thao tác
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
