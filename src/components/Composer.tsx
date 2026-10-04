import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AIProvider, SystemStatus } from '../types.ts';
import { ModelBrowser, findModelOption, providerMark, shortModelName } from './ModelPicker.tsx';
import { ModelIcon } from './ModelIcon.tsx';
import { Plus, Mic, Send, Square, Bot, Server, ChevronDown, ChevronRight, ChevronLeft, Check, X } from 'lucide-react';

export interface ComposerSuggestion {
  label: string;
  prompt: string;
  icon?: React.ReactNode;
}

interface ComposerProps {
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
  onSend: (text: string) => void;
  onAbort?: () => void;
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

export const Composer: React.FC<ComposerProps> = ({
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
  onAbort
}) => {
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configView, setConfigView] = useState<'menu' | 'models'>('menu');
  const [effortOpen, setEffortOpen] = useState(false);
  const [effort, setEffort] = useState<string>(loadEffort);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<HTMLDivElement>(null);

  const voiceSupported = speechRecognitionCtor() !== null;

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
      try { recogRef.current?.stop(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopListening = () => {
    try { recogRef.current?.stop(); } catch {}
    setListening(false);
  };

  const toggleListening = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    if (listening) {
      stopListening();
      return;
    }
    try {
      const recog = new Ctor();
      recog.lang = 'vi-VN';
      recog.interimResults = false;
      recog.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          setInput(prev => (prev ? prev.replace(/\s+$/, '') + ' ' : '') + transcript.trim() + ' ');
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
              el.focus();
            }
          });
        }
      };
      recog.onend = () => setListening(false);
      recog.onerror = () => setListening(false);
      recogRef.current = recog;
      recog.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || disabled) return;
    stopListening();
    onSend(trimmed);
    setInput('');
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
      handleSend();
    }
  };

  const canSend = input.trim().length > 0 && !isStreaming && !disabled;

  return (
    <div className="w-full">
      <div
        className={`composer-shell relative px-4 pt-3 pb-5${isHome ? ' composer-shell-home' : ''}`}
        style={{ backgroundColor: 'var(--composer-surface, var(--surface))', ...(isHome ? {} : { border: '1px solid var(--border)', paddingBottom: 18 }) }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Nhập yêu cầu tác vụ"
          className={`w-full bg-transparent leading-relaxed resize-none focus:outline-none ${isHome ? 'min-h-[52px] max-h-[160px] composer-home-input' : 'min-h-[58px] max-h-[140px] text-[13.5px]'}`}
          style={{ color: 'var(--text-primary)' }}
        />

        <div className="flex items-center justify-between gap-2 mt-1.5">
          <div className="relative" ref={menuRef} style={isHome ? undefined : { top: 5 }}>
            <button
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              disabled={disabled || suggestions.length === 0}
              aria-label="Tác vụ nhanh"
              aria-expanded={menuOpen}
              title={suggestions.length > 0 ? 'Tác vụ nhanh' : 'Không có gợi ý'}
                className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Plus size={16} />
            </button>
            {menuOpen && suggestions.length > 0 && (
              <div
                role="menu"
                className="absolute bottom-full left-0 mb-2 w-72 max-w-[80vw] rounded-xl p-1.5 z-20"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-composer)' }}
              >
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

          <div className="flex items-center gap-1 min-w-0" style={isHome ? undefined : { position: 'relative', top: 5 }}>
            <div className="relative" ref={configRef}>
              <button
                type="button"
                onClick={() => { setConfigOpen(open => !open); setConfigView('menu'); setEffortOpen(false); }}
                disabled={disabled}
                aria-label={selectedOption ? `Mô hình: ${shortModelName(selectedOption.model)}, nỗ lực ${effort}` : 'Chọn mô hình'}
                aria-expanded={configOpen}
                title="Cấu hình mô hình"
                className="composer-model-pill"
              >
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
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={disabled}
                aria-label={listening ? 'Dừng ghi âm' : 'Nhập bằng giọng nói'}
                title={listening ? 'Dừng ghi âm' : 'Nhập bằng giọng nói'}
                className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 hover:bg-[var(--surface-hover)]"
                style={{ color: listening ? 'var(--danger)' : 'var(--text-secondary)' }}
              >
                <Mic size={15} className={listening ? 'animate-pulse' : undefined} />
              </button>
            )}
            {isStreaming ? (
              <button
                type="button"
                onClick={onAbort}
                aria-label="Dừng tác vụ"
                title="Dừng tác vụ"
                className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-all cursor-pointer"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Gửi yêu cầu"
                title="Gửi yêu cầu"
                className="composer-send-btn"
                data-disabled={!canSend}
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-1 px-1">
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
        </div>
      </div>
    </div>
  );
};
