import { readMarkdownTable } from '../markdownTables.ts';
import { MessageImages } from './MessageImages.tsx';
import { htmlArtifacts } from '../htmlArtifacts.ts';
import { HtmlPreview } from './HtmlPreview.tsx';
import { copyToClipboard } from '../clipboard.ts';
import { spaceProseSentences } from '../proseSpacing.ts';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Message, ToolCallItem, ResponseActivityData } from '../types.ts';
import { ToolCallCard } from './ToolCallCard.tsx';
import { ResponseActivity } from './ResponseActivity.tsx';
import { Copy, Check, Link, GitBranch, RotateCcw, Pencil, MoreHorizontal, Trash2, Bold, Italic, Underline, Strikethrough, List, ListOrdered, ListChecks, Quote, Sigma, Code, SquareCode, CircleCheck, CircleAlert, X, Languages, GitFork, CheckCheck, ChevronRight, ChevronDown } from 'lucide-react';
import type { Appearance } from '../appearance.ts';
import { ContentBlock } from './ContentBlock.tsx';
import { MathFormula } from './MathFormula.tsx';
import { useSmoothedText } from '../streamAnimation.ts';

export const TRANSLATE_LANGUAGES = [
  { code: 'en', label: 'Tiếng Anh (Mỹ)' },
  { code: 'zh-CN', label: 'Tiếng Trung giản thể' },
  { code: 'zh-TW', label: 'Tiếng Trung phồn thể' },
  { code: 'ja', label: 'Tiếng Nhật' },
  { code: 'ko', label: 'Tiếng Hàn' },
  { code: 'de', label: 'Tiếng Đức' },
  { code: 'es', label: 'Tiếng Tây Ban Nha' },
  { code: 'ar', label: 'Tiếng Ả Rập' },
  { code: 'fr', label: 'Tiếng Pháp' },
  { code: 'pt-BR', label: 'Tiếng Bồ Đào Nha (Brazil)' },
  { code: 'ru', label: 'Tiếng Nga' },
  { code: 'tr', label: 'Tiếng Thổ Nhĩ Kỳ' },
  { code: 'vi', label: 'Tiếng Việt' },
] as const;

function detectSourceLang(text: string): { code: string; label: string } {
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) {
    return { code: 'vi', label: 'Tiếng Việt' };
  }
  return { code: 'en', label: 'Tiếng Anh (Mỹ)' };
}

async function translateWithMyMemory(text: string, source: string, target: string): Promise<string> {
  const src = source === 'zh-CN' || source === 'zh-TW' ? 'zh' : source.split('-')[0];
  const tgt = target === 'zh-CN' || target === 'zh-TW' ? 'zh' : target.split('-')[0];
  const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(tgt)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const out = typeof data?.responseData?.translatedText === 'string' ? data.responseData.translatedText : '';
  if (!out.trim()) throw new Error('Empty translation');
  return out;
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  allowEntryAnimation?: boolean;
  tools?: ToolCallItem[];
  activity?: ResponseActivityData;
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
  actionsDisabled?: boolean;
  onEditMessage?: (message: Message, content: string) => void;
  onDeleteMessage?: (message: Message) => void;
  onRegenerateMessage?: (message: Message) => void;
  onBranchMessage?: (message: Message, includeContext: boolean) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (message: Message) => void;
  onEnterSelect?: (message: Message) => void;
}

const messageLabels = {
  vi: {
    edit: 'Chỉnh sửa', copy: 'Sao chép', copied: 'Đã sao chép', copyFailed: 'Không thể sao chép',
    regenerate: 'Tạo lại', del: 'Xóa', save: 'Gửi', cancel: 'Hủy',
    menu: 'Thao tác tin nhắn', copyMessage: 'Sao chép tin nhắn',
    branch: 'Tạo chủ đề phụ', translate: 'Dịch', select: 'Chọn',
    branchTitle: 'Bắt đầu chủ đề phụ mới', includeContext: 'Bao gồm ngữ cảnh chủ đề',
    branchHint: 'Được tách ra tại đây, kế thừa ngữ cảnh chính của cuộc trò chuyện cho đến nay',
    start: 'Bắt đầu', translating: 'Đang dịch...', translateFailed: 'Không dịch được, thử lại sau.',
    justNow: 'vừa xong', minutesAgo: (n: number) => `${n} phút trước`,
    hoursAgo: (n: number) => `${n} giờ trước`, daysAgo: (n: number) => `${n} ngày trước`
  },
  en: {
    edit: 'Edit', copy: 'Copy', copied: 'Copied', copyFailed: "Couldn't copy",
    regenerate: 'Regenerate', del: 'Delete', save: 'Send', cancel: 'Cancel',
    menu: 'Message actions', copyMessage: 'Copy message',
    branch: 'Create sub topic', translate: 'Translate', select: 'Select',
    branchTitle: 'Start new sub topic', includeContext: 'Include topic context',
    branchHint: 'Branched here, inheriting the main conversation context so far',
    start: 'Start', translating: 'Translating...', translateFailed: "Couldn't translate, try again.",
    justNow: 'just now', minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} hours ago`, daysAgo: (n: number) => `${n} days ago`
  }
} as const;

function relativeTime(timestamp: number, lang: 'vi' | 'en'): string {
  const t = messageLabels[lang];
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return t.justNow;
  if (diff < 3_600_000) return t.minutesAgo(Math.floor(diff / 60_000));
  if (diff < 86_400_000) return t.hoursAgo(Math.floor(diff / 3_600_000));
  if (diff < 7 * 86_400_000) return t.daysAgo(Math.floor(diff / 86_400_000));
  return new Date(timestamp).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US');
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  allowEntryAnimation = true,
  tools = [],
  activity: liveActivity,
  appearance,
  activeTheme,
  actionsDisabled = false,
  onEditMessage,
  onDeleteMessage,
  onRegenerateMessage,
  onBranchMessage,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelect
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [translation, setTranslation] = useState<{
    target: string; targetLabel: string; sourceLabel: string;
    text: string; loading: boolean; error: boolean; collapsed: boolean;
  } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const lang: 'vi' | 'en' = appearance.locale === 'system'
    ? (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en')
    : appearance.locale;
  const t = messageLabels[lang];
  let savedActivity: ResponseActivityData | undefined;
  try {
    const parsed = message.metadata ? JSON.parse(message.metadata)?.activity : undefined;
    if (parsed && typeof parsed.reasoning === 'string' && Array.isArray(parsed.tools) && typeof parsed.startedAt === 'number') savedActivity = parsed;
  } catch {}
  let messageImages: import('../types.ts').ImageAttachment[] = [];
  try {const images=JSON.parse(message.metadata || '{}').images;if(Array.isArray(images))messageImages=images.filter(image=>typeof image?.name==='string' && /^data:image\/(png|jpeg|webp);base64,/.test(image?.dataUrl)).slice(0,4);}catch{}
  const activity = liveActivity ?? savedActivity;
  const actionsEnabled = !isStreaming && !actionsDisabled && !message.id.startsWith('temp_');
  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'failed') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!menuOpen) {
      if (subTimer.current) window.clearTimeout(subTimer.current);
      setTranslateOpen(false);
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onScroll = (event: Event) => {
      if (actionMenuRef.current && event.target instanceof Node && actionMenuRef.current.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menuOpen]);
  const [entryTransition] = useState(allowEntryAnimation ? appearance.transition : 'none');
  const [responseEntry] = useState(allowEntryAnimation ? appearance.responseAnimation : 'none');
  // LobeHub: lịch sử cũ mở lại thì đứng yên, tin mới hiện ngay;
  // chỉ chế độ Mượt mà mới có entrance bay nhẹ.
  const [animateEntry] = useState(
    () => allowEntryAnimation && appearance.transition === 'smooth'
      && (message.id.startsWith('temp_') || message.id === 'streaming-active' || Date.now() - message.created_at < 4000)
  );
  const animOn = appearance.responseAnimation !== 'off' && appearance.transition !== 'none';
  const streamingNow = Boolean(isStreaming) && message.sender !== 'user';
  // Saved replies replace the live bubble without replaying its text animation.
  const smoothActive = animOn && streamingNow;
  const smoothContent = useSmoothedText(
    message.content,
    smoothActive,
    appearance.transition === 'smooth' ? 'silky' : 'balanced'
  );
  // LobeHub: fade từng ký tự khi stream (không áp cho chế độ none).
  // Mượt mà dùng fade theo từ (đúng granularity word của streamdown).
  const charFade = smoothActive && message.sender !== 'user';
  const fadeGranularity = appearance.transition === 'smooth' ? 'word' : 'char';

  const segmentWords = (value: string): string[] => {
    try {
      const Segmenter = (Intl as unknown as { Segmenter?: new (l: undefined, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
      if (Segmenter) return [...new Segmenter(undefined, { granularity: 'word' }).segment(value)].map(s => s.segment);
    } catch {}
    return value.match(/\s+|\S+/g) ?? [];
  };

  const fadeTail = (text: string, keyPrefix: string) => {
    if (!charFade || text.length === 0) return text;
    if (fadeGranularity === 'word') {
      const segments = segmentWords(text);
      const WINDOW = 12;
      const cut = Math.max(0, segments.length - WINDOW);
      return (
        <>
          {segments.slice(0, cut).join('')}
          {segments.slice(cut).map((seg, k) => (
            <span
              key={`${keyPrefix}-w${cut + k}`}
              className="stream-char"
              style={{ animationDelay: `${Math.min(150, k * 20)}ms` }}
            >
              {seg}
            </span>
          ))}
        </>
      );
    }
    const CHAR_WINDOW = 40;
    const cut = Math.max(0, text.length - CHAR_WINDOW);
    return (
      <>
        {text.slice(0, cut)}
        {[...text.slice(cut)].map((ch, k) => (
          <span
            key={`${keyPrefix}-${cut + k}`}
            className="stream-char"
            style={{ animationDelay: `${Math.min(120, k * 12)}ms` }}
          >
            {ch}
          </span>
        ))}
      </>
    );
  };
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string; selected: boolean } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    const raf = requestAnimationFrame(() => editTextareaRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [editing]);
  const isUser = message.sender === 'user';
  const activeMenu = appearance.contextMenu === 'default' ? contextMenu : null;
  const copyLabel = copyState === 'copied' ? t.copied : copyState === 'failed' ? t.copyFailed : t.copyMessage;

  const doCopy = (event: React.SyntheticEvent) => {
    void copyText(message.content);
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
    setMenuOpen(false);
  };

  const toggleMenu = (alignRight: boolean) => {
    if (menuOpen) { setMenuOpen(false); return; }
    const r = barRef.current?.getBoundingClientRect();
    if (r) {
      const w = 208; // 13rem
      const left = alignRight
        ? Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))
        : Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      setMenuPos({ top: Math.min(r.bottom + 4, window.innerHeight - 8), left });
    } else {
      setMenuPos({ top: window.innerHeight - 200, left: 100 });
    }
    setMenuOpen(true);
  };

  const barButtonClass = 'message-action-btn';

  type MenuItem = {
    key: string; label: string; icon: React.ReactNode; danger?: boolean;
    dividerBefore?: boolean; submenu?: boolean; onSelect?: () => void;
  };

  const openEdit = () => { setDraft(message.content); setEditing(true); setMenuOpen(false); };
  const doTranslate = async (target: string, targetLabel: string) => {
    const src = detectSourceLang(message.content);
    if (src.code.split('-')[0] === target.split('-')[0]) {
      setTranslation({ target, targetLabel, sourceLabel: src.label, text: message.content, loading: false, error: false, collapsed: false });
      setMenuOpen(false); setTranslateOpen(false);
      return;
    }
    setTranslation({ target, targetLabel, sourceLabel: src.label, text: '', loading: true, error: false, collapsed: false });
    setMenuOpen(false); setTranslateOpen(false);
    try {
      const out = await translateWithMyMemory(message.content, src.code, target);
      setTranslation({ target, targetLabel, sourceLabel: src.label, text: out, loading: false, error: false, collapsed: false });
    } catch {
      setTranslation({ target, targetLabel, sourceLabel: src.label, text: '', loading: false, error: true, collapsed: false });
    }
  };

  const subTimer = useRef<number | null>(null);
  const openTranslateSoon = () => {
    if (subTimer.current) window.clearTimeout(subTimer.current);
    subTimer.current = window.setTimeout(() => setTranslateOpen(true), 150);
  };
  const closeTranslateSoon = () => {
    if (subTimer.current) window.clearTimeout(subTimer.current);
    setTranslateOpen(false);
  };

  const userMenuItems: MenuItem[] = [
    ...(onEditMessage ? [{ key: 'edit', label: t.edit, icon: <Pencil size={15} />, onSelect: openEdit }] : []),
    { key: 'copy', label: t.copy, icon: <Copy size={15} />, onSelect: () => { void copyText(message.content); } },
    ...(onBranchMessage ? [{ key: 'branch', label: t.branch, icon: <GitFork size={15} />, onSelect: () => { onBranchMessage(message, true); setMenuOpen(false); } }] : []),
    { key: 'translate', label: t.translate, icon: <Languages size={15} />, submenu: true },
    ...(onEnterSelect ? [{ key: 'select', label: t.select, icon: <CheckCheck size={15} />, dividerBefore: true, onSelect: () => { onEnterSelect(message); setMenuOpen(false); } }] : []),
    ...(onRegenerateMessage ? [{ key: 'regen', label: t.regenerate, icon: <RotateCcw size={15} />, dividerBefore: !onEnterSelect, onSelect: () => onRegenerateMessage(message) }] : []),
    ...(onDeleteMessage ? [{ key: 'delete', label: t.del, icon: <Trash2 size={15} />, danger: true, dividerBefore: true, onSelect: () => onDeleteMessage(message) }] : [])
  ];

  const assistantMenuItems: MenuItem[] = [
    { key: 'copy', label: t.copy, icon: <Copy size={15} />, onSelect: () => { void copyText(message.content); } },
    { key: 'translate', label: t.translate, icon: <Languages size={15} />, submenu: true },
    ...(onEnterSelect ? [{ key: 'select', label: t.select, icon: <CheckCheck size={15} />, dividerBefore: true, onSelect: () => { onEnterSelect(message); setMenuOpen(false); } }] : []),
    ...(onRegenerateMessage ? [{ key: 'regen', label: t.regenerate, icon: <RotateCcw size={15} />, dividerBefore: !onEnterSelect, onSelect: () => onRegenerateMessage(message) }] : []),
    ...(onDeleteMessage ? [{ key: 'delete', label: t.del, icon: <Trash2 size={15} />, danger: true, dividerBefore: true, onSelect: () => onDeleteMessage(message) }] : [])
  ];

  const renderLobeMenu = (items: MenuItem[], alignRight: boolean) => {
    if (!menuOpen || !menuPos) return null;
    const flipUp = menuPos.top + 340 > window.innerHeight;
    return createPortal(
    <div ref={actionMenuRef} role="menu" aria-label={t.menu}
      className={`lobe-actions-menu${alignRight ? ' align-right' : ''}${flipUp ? ' submenu-up' : ''}`}
      style={{ top: flipUp ? undefined : menuPos.top, bottom: flipUp ? Math.max(8, window.innerHeight - menuPos.top + 8) : undefined, left: menuPos.left }}>
      {items.map(item => (
        <React.Fragment key={item.key}>
          {item.dividerBefore && <div aria-hidden="true" className="lobe-actions-sep" />}
          {item.submenu ? (
            <div
              className="lobe-actions-item lobe-actions-has-sub"
              role="menuitem" tabIndex={0}
              onMouseEnter={openTranslateSoon}
              onMouseLeave={closeTranslateSoon}
              onFocus={() => setTranslateOpen(true)}
              onClick={() => setTranslateOpen(v => !v)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTranslateOpen(v => !v); } }}
            >
              <span className="lobe-actions-icon">{item.icon}</span>
              <span className="lobe-actions-label">{item.label}</span>
              <ChevronRight size={14} className="lobe-actions-arrow" />
              {translateOpen && (
                <div role="menu" aria-label={t.translate} className="lobe-actions-submenu">
                  <div className="lobe-actions-submenu-list">
                  {TRANSLATE_LANGUAGES.map(l => (
                    <button key={l.code} type="button" role="menuitem"
                      className="lobe-actions-item"
                      onClick={e => { e.stopPropagation(); void doTranslate(l.code, l.label); }}>
                      <span className="lobe-actions-label">{l.label}</span>
                    </button>
                  ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button type="button" role="menuitem"
              onClick={() => { item.onSelect?.(); setMenuOpen(false); }}
              className="lobe-actions-item"
              data-danger={item.danger || undefined}>
              <span className="lobe-actions-icon">{item.icon}</span>
              <span className="lobe-actions-label">{item.label}</span>
            </button>
          )}
        </React.Fragment>
      ))}
    </div>,
    document.body
    );
  };

  const renderTranslation = () => {
    if (!translation) return null;
    return (
      <div className="lobe-translate-block">
        <div className="lobe-translate-head">
          <span className="lobe-translate-lang">{translation.sourceLabel}</span>
          <span className="lobe-translate-arrow">››</span>
          <span className="lobe-translate-lang">{translation.targetLabel}</span>
          <span className="lobe-translate-head-actions">
            <button type="button" title={t.copy} aria-label={t.copy}
              className="lobe-translate-iconbtn"
              disabled={translation.loading || !translation.text}
              onClick={() => { if (translation.text) void copyText(translation.text); }}>
              <Copy size={13} />
            </button>
            <button type="button" title={t.del} aria-label={t.del}
              className="lobe-translate-iconbtn"
              onClick={() => setTranslation(null)}>
              <Trash2 size={13} />
            </button>
            <button type="button" aria-label="Thu gọn"
              className="lobe-translate-iconbtn"
              onClick={() => setTranslation(prev => prev && { ...prev, collapsed: !prev.collapsed })}>
              <ChevronDown size={13} style={{ transform: translation.collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 140ms' }} />
            </button>
          </span>
        </div>
        {!translation.collapsed && (
          <div className="lobe-translate-body">
            {translation.loading ? t.translating : translation.error ? t.translateFailed : translation.text}
          </div>
        )}
      </div>
    );
  };

  const copyText = async (text: string) => {
    setCopyState('copying');
    try {
      await copyToClipboard(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const closeContextMenu = (restoreFocus: boolean) => {
    setContextMenu(null);
    if (restoreFocus) bodyRef.current?.focus({ preventScroll: true });
  };


  const openContextMenu = (x: number, y: number) => {
    const body = bodyRef.current;
    if (!body) return;
    const selection = window.getSelection();
    const selected = selection?.rangeCount
      && body.contains(selection.anchorNode)
      && body.contains(selection.focusNode)
      ? selection.toString() : '';
    setContextMenu({ x, y, text: selected || message.content, selected: Boolean(selected) });
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (appearance.contextMenu !== 'default' || !(event.target instanceof Element)
      || event.target.closest('a,input,textarea,select,button,pre,svg,[data-content-block]')) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    openContextMenu(event.clientX || bounds.left + 12, event.clientY || bounds.top + 12);
  };

  const handleBodyKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    if (appearance.contextMenu !== 'default' || !(event.target instanceof Element)
      || event.target.closest('a,input,textarea,select,button,pre,svg,[data-content-block]')) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    openContextMenu(bounds.left + 12, bounds.top + 12);
  };

  useLayoutEffect(() => {
    if (appearance.contextMenu === 'off') setContextMenu(null);
  }, [appearance.contextMenu]);

  useLayoutEffect(() => {
    if (!activeMenu) return;
    const clampPosition = () => {
      const menu = menuRef.current;
      if (!menu) return;
      menu.style.left = `${Math.max(8, Math.min(activeMenu.x, window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(activeMenu.y, window.innerHeight - menu.offsetHeight - 8))}px`;
    };
    const handleOutside = (event: Event) => {
      if (!(event.target instanceof Node) || menuRef.current?.contains(event.target)) return;
      setContextMenu(null);
      if (event.type === 'pointerdown' && event.target instanceof Element
        && !event.target.closest('a,button,input,textarea,select,[tabindex]')) {
        bodyRef.current?.focus({ preventScroll: true });
      }
    };
    clampPosition();
    menuButtonRef.current?.focus({ preventScroll: true });
    window.addEventListener('resize', clampPosition);
    document.addEventListener('pointerdown', handleOutside, true);
    document.addEventListener('contextmenu', handleOutside, true);
    document.addEventListener('focusin', handleOutside, true);
    const observer = new ResizeObserver(() => {
      if (!bodyRef.current?.clientHeight) setContextMenu(null);
    });
    if (bodyRef.current) observer.observe(bodyRef.current);
    return () => {
      window.removeEventListener('resize', clampPosition);
      document.removeEventListener('pointerdown', handleOutside, true);
      document.removeEventListener('contextmenu', handleOutside, true);
      document.removeEventListener('focusin', handleOutside, true);
      observer.disconnect();
    };
  }, [activeMenu]);

  const menu = activeMenu && createPortal(
    <div
      ref={menuRef}
      className="message-context-menu"
      role="menu"
      aria-label="Thao tác tin nhắn"
      style={{ left: activeMenu.x, top: activeMenu.y }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeContextMenu(true);
        } else if (event.key === 'Tab') {
          closeContextMenu(false);
        }
      }}
    >
      <button
        ref={menuButtonRef}
        type="button"
        role="menuitem"
        onClick={() => {
          const text = activeMenu.text;
          closeContextMenu(true);
          void copyText(text);
        }}
      >
        <Copy size={14} aria-hidden="true" />
        {activeMenu.selected ? 'Sao chép phần đang chọn' : 'Sao chép tin nhắn'}
      </button>
    </div>,
    document.body
  );

  const copyFeedback = (copyState === 'copied' || copyState === 'failed') ? createPortal(
    <div className="copy-toast-wrap">
      <div className="copy-toast" role="status" aria-live="polite" data-failed={copyState === 'failed'}>
        {copyState === 'copied'
          ? <CircleCheck size={18} className="copy-toast-icon" style={{ color: 'var(--success)' }} />
          : <CircleAlert size={18} className="copy-toast-icon" style={{ color: 'var(--danger)' }} />}
        <span className="copy-toast-text">
          {copyState === 'copied' ? 'Đã sao chép' : 'Không thể sao chép. Kiểm tra quyền clipboard và thử lại.'}
        </span>
        <button type="button" className="copy-toast-close" aria-label="Đóng" onClick={() => setCopyState('idle')}>
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  // Render markdown elements
  const renderFormattedContent = (text: string) => {
    const codeBlockRegex = /(?:^|\n)[ \t]*(`{3,}|~{3,})([a-zA-Z0-9_+.#\-]*)[^\S\r\n]*\r?\n([\s\S]*?)(?:\r?\n[ \t]*\1[ \t]*(?=\r?\n|$)|$)/g;
    type ContentPart = { type: 'code'; language: string; code: string } | { type: 'text'; content: string } | { type: 'math'; source: string };
    const parts: ContentPart[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      parts.push({
        type: 'code',
        language: match[2] || 'text',
        code: match[3] || ''
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.substring(lastIndex) });
    }

    // Split display formulas only after fenced code has been extracted.
    const formattedParts = parts.flatMap((part): ContentPart[] => {
      if (part.type !== 'text') return [part];
      const result: ContentPart[] = [];
      const displayMath = /`[^`\n]+`|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
      let cursor = 0;
      for (const match of part.content.matchAll(displayMath)) {
        if (match[1] === undefined && match[2] === undefined) continue;
        if (match.index! > cursor) result.push({ type: 'text', content: part.content.slice(cursor, match.index) });
        result.push({ type: 'math', source: (match[1] ?? match[2]).trim() });
        cursor = match.index! + match[0].length;
      }
      if (cursor < part.content.length) result.push({ type: 'text', content: part.content.slice(cursor) });
      return result;
    });
    return formattedParts.map((part, idx) => {
      if (part.type === 'math') return <MathFormula key={idx} source={part.source} display />;
      if (part.type === 'code') {
        return <ContentBlock key={idx} language={part.language} code={part.code} appearance={appearance} activeTheme={activeTheme} isStreaming={isStreaming} />;
      }

      const lines = part.content.split('\n');
      let tableEnd = -1;
      return (
        <div key={idx} className="space-y-1 my-1">
          {lines.map((line, lIdx) => {
            if (lIdx < tableEnd) return null;
            const table = readMarkdownTable(lines, lIdx);
            if (table) {
              tableEnd = table.end;
              return <div key={lIdx} className="message-table-scroll" tabIndex={0} role="region" aria-label={lang === 'vi' ? 'Bảng dữ liệu' : 'Data table'}>
                <table className="message-table">
                  <thead><tr>{table.header.map((cell, column) => <th key={column} scope="col" style={{textAlign:table.alignments[column]}}>{formatInlineMarkdown(cell, `${idx}:${lIdx}:header:${column}`)}</th>)}</tr></thead>
                  <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} style={{textAlign:table.alignments[column]}}>{formatInlineMarkdown(cell, `${idx}:${lIdx}:${rowIndex}:${column}`)}</td>)}</tr>)}</tbody>
                </table>
              </div>;
            }
            const trimmed = line.trim();
            // Omit decorative Markdown dividers from prose; fenced code is rendered separately.
            if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(trimmed)) return null;
            if (!trimmed) return <div key={lIdx} className="h-2" />;

            if (trimmed.startsWith('> ')) {
              return <blockquote key={lIdx} className="message-quote">{formatInlineMarkdown(trimmed.substring(2), `${idx}:${lIdx}`)}</blockquote>;
            }

            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2">
                  <span className="mt-1" style={{ color: 'var(--text-tertiary)' }}>•</span>
                  <span>{formatInlineMarkdown(trimmed.substring(2), `${idx}:${lIdx}`)}</span>
                </div>
              );
            }

            const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
            if (numMatch) {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2">
                  <span className="font-mono-code mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{numMatch[1]}.</span>
                  <span>{formatInlineMarkdown(numMatch[2], `${idx}:${lIdx}`)}</span>
                </div>
              );
            }

            const heading = trimmed.match(/^(#{1,6})(?:[ \t]+(.*)|$)/);
            if (heading) {
              const level = heading[1].length;
              const title = (heading[2] || '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
              return React.createElement(`h${Math.min(level + 1, 6)}`, {
                key: lIdx,
                className: 'message-heading',
                'data-level': level
              }, formatInlineMarkdown(title, `${idx}:${lIdx}`));
            }

            return <p key={lIdx} className="leading-relaxed">{formatInlineMarkdown(line, `${idx}:${lIdx}`)}</p>;
          })}
        </div>
      );
    });
  };

  const formatInlineMarkdown = (line: string, keyPrefix: string) => {
    const displayLine = line.replace(/\$\\(rightarrow|leftarrow|leftrightarrow|Rightarrow)\$/g, (_match, command: string) => ({rightarrow:'→',leftarrow:'←',leftrightarrow:'↔',Rightarrow:'⇒'}[command] || _match));
    const tokens = displayLine.split(/(`[^`]+`|\\\([^\n]+?\\\)|(?<![\\$])\$(?!\s|\d+[.,]?\d*(?:\s|$))[^$\n]+?(?<!\s)\$(?!\d)|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/gi);
    return tokens.map((token, i) => {
      const tokenKey = `${keyPrefix}:${i}`;
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code
            key={tokenKey}
            className="message-inline-code px-1.5 py-0.5 rounded font-mono-code"
            style={{
              backgroundColor: 'var(--control-background)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      if (token.startsWith('\\(') && token.endsWith('\\)')) return <MathFormula key={tokenKey} source={token.slice(2, -2)} />;
      if (token.startsWith('$') && token.endsWith('$') && token.length > 2) return <MathFormula key={tokenKey} source={token.slice(1, -1)} />;
      if (token.startsWith('**') && token.endsWith('**')) {
        return <strong key={tokenKey} className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatInlineMarkdown(token.slice(2, -2), tokenKey)}</strong>;
      }
      if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
        return <em key={tokenKey}>{formatInlineMarkdown(token.slice(1, -1), tokenKey)}</em>;
      }
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i);
      if (link) {
        try {
          const url = new URL(link[2]);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return token;
          const LinkIcon = url.hostname === 'github.com' || url.hostname.endsWith('.github.com') ? GitBranch : Link;
          return (
            <a key={tokenKey} href={url.href} onClick={event => {
                if (!window.electronAPI?.openBrowserUrl || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                window.dispatchEvent(new CustomEvent('ohmyt-browser-open-url', {detail:url.href}));
              }} target="_blank" rel="noopener noreferrer" className="message-link">
              {appearance.linkIcons && <LinkIcon size={13} aria-hidden="true" className="message-link-icon" />}
              {link[1]}
            </a>
          );
        } catch {
          return token;
        }
      }
      return fadeTail(spaceProseSentences(token), tokenKey);
    });
  };

  if (isUser) {
    if (editing) {
      const wrapSelection = (prefix: string, suffix: string = prefix) => {
        const el = editTextareaRef.current;
        if (!el) { setDraft(d => `${prefix}${d}${suffix}`); return; }
        const start = el.selectionStart ?? draft.length;
        const end = el.selectionEnd ?? draft.length;
        const selected = draft.slice(start, end) || 'text';
        const next = draft.slice(0, start) + prefix + selected + suffix + draft.slice(end);
        setDraft(next);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        });
      };
      const prefixLines = (prefix: string) => {
        const el = editTextareaRef.current;
        if (!el) { setDraft(d => d.split('\n').map(l => prefix + l).join('\n')); return; }
        const end = el.selectionEnd ?? 0;
        const lineStart = draft.lastIndexOf('\n', (el.selectionStart ?? 0) - 1) + 1;
        const lineEndIdx = draft.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? draft.length : lineEndIdx;
        const block = draft.slice(lineStart, lineEnd);
        const replaced = block.split('\n').map(l => (l.startsWith(prefix) ? l : prefix + l)).join('\n');
        const next = draft.slice(0, lineStart) + replaced + draft.slice(lineEnd);
        setDraft(next);
        requestAnimationFrame(() => { el.focus(); });
      };
      const saveEdit = () => {
        if (draft.trim() && onEditMessage) { onEditMessage(message, draft.trim()); setEditing(false); }
      };
      const toolbarBtn = 'message-edit-toolbtn';
      return createPortal(
        <div className="message-edit-overlay" onClick={() => setEditing(false)} role="dialog" aria-modal="true" aria-label={t.edit}>
          <div className="message-edit-card" onClick={e => e.stopPropagation()}>
            <div className="message-edit-toolbar" role="toolbar" aria-label="Định dạng">
              <button type="button" className={toolbarBtn} title="Bold" onClick={() => wrapSelection('**')}><Bold size={16} /></button>
              <button type="button" className={toolbarBtn} title="Italic" onClick={() => wrapSelection('*')}><Italic size={16} /></button>
              <button type="button" className={toolbarBtn} title="Underline" onClick={() => wrapSelection('<u>', '</u>')}><Underline size={16} /></button>
              <button type="button" className={toolbarBtn} title="Strikethrough" onClick={() => wrapSelection('~~')}><Strikethrough size={16} /></button>
              <span className="message-edit-sep" />
              <button type="button" className={toolbarBtn} title="Bullet list" onClick={() => prefixLines('- ')}><List size={16} /></button>
              <button type="button" className={toolbarBtn} title="Ordered list" onClick={() => prefixLines('1. ')}><ListOrdered size={16} /></button>
              <button type="button" className={toolbarBtn} title="Todo list" onClick={() => prefixLines('- [ ] ')}><ListChecks size={16} /></button>
              <span className="message-edit-sep" />
              <button type="button" className={toolbarBtn} title="Quote" onClick={() => prefixLines('> ')}><Quote size={16} /></button>
              <button type="button" className={toolbarBtn} title="Math" onClick={() => wrapSelection('$')}><Sigma size={16} /></button>
              <button type="button" className={toolbarBtn} title="Inline code" onClick={() => wrapSelection('`')}><Code size={16} /></button>
              <button type="button" className={toolbarBtn} title="Code block" onClick={() => wrapSelection('\n```\n', '\n```\n')}><SquareCode size={16} /></button>
            </div>
            <textarea
              ref={editTextareaRef}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  saveEdit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setEditing(false);
                }
              }}
              aria-label={t.edit}
              className="message-edit-textarea"
              placeholder={message.content}
            />
            <div className="message-edit-footer">
              <button type="button" onClick={() => setEditing(false)} className="message-edit-cancel">
                {t.cancel}
              </button>
              <button type="button" disabled={!draft.trim()} onClick={saveEdit} className="message-edit-send">
                {t.save === 'Gửi' ? t.save : 'Gửi'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      );
    }
    return (
      <div
        className={`message-row message-row-user${selectMode ? ' is-selecting' : ''}${animateEntry ? ' message-enter' : ''}`}
        data-message-transition={entryTransition}
        role="group"
        aria-label="Tin nhắn của bạn"
      >
        {selectMode && onToggleSelect && (
          <button type="button" role="checkbox" aria-checked={selected}
            aria-label={t.select} onClick={() => onToggleSelect(message)}
            className="message-select-box" data-checked={selected}>
            {selected && <Check size={13} />}
          </button>
        )}
        <div
          ref={bodyRef}
          className="group relative message-body message-body-user select-text"
          role="group"
          aria-label="Nội dung tin nhắn của bạn"
          tabIndex={appearance.contextMenu === 'default' ? 0 : undefined}
          onContextMenu={handleContextMenu}
          onKeyDown={handleBodyKeyDown}
        >
          {actionsEnabled && (
            <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block whitespace-nowrap text-[11px]" style={{ color: 'var(--text-tertiary)' }}
              title={new Date(message.created_at).toLocaleString()}>
              {relativeTime(message.created_at, lang)}
            </div>
          )}
          <MessageImages images={messageImages}/>
          <div className="message-content select-text leading-relaxed break-words whitespace-pre-wrap font-normal">
            {message.content}
          </div>
          {!isStreaming && htmlArtifacts(message.content, activity?.tools ?? tools).map((artifact, index) => <HtmlPreview key={`${artifact.name}-${index}`} artifact={artifact} />)}

        {renderTranslation()}
          {copyFeedback}
          {menu}
          {actionsEnabled && !selectMode && (
            <div ref={barRef} className={`message-actions-bar is-user${menuOpen ? ' is-open' : ''}`}>
              {onRegenerateMessage && (
                <button type="button" onClick={() => onRegenerateMessage(message)} title={t.regenerate} aria-label={t.regenerate}
                  className={barButtonClass}>
                  <RotateCcw size={15} />
                </button>
              )}
              {onEditMessage && (
                <button type="button" onClick={openEdit} title={t.edit} aria-label={t.edit}
                  className={barButtonClass}>
                  <Pencil size={15} />
                </button>
              )}
              <button type="button" onClick={doCopy} title={copyLabel} aria-label={copyLabel}
                className={barButtonClass}>
                {copyState === 'copied' ? <Check size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
              </button>
              <button type="button" onClick={() => toggleMenu(true)} title={t.menu} aria-label={t.menu} aria-expanded={menuOpen} aria-haspopup="menu"
                className={barButtonClass}>
                <MoreHorizontal size={15} />
              </button>
              {renderLobeMenu(userMenuItems, true)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`message-row message-row-assistant flex items-start gap-3${selectMode ? ' is-selecting' : ''}${animateEntry ? ' message-enter' : ''}`}
      data-message-transition={entryTransition}
      data-response-animation={appearance.responseAnimation}
      role="group"
      aria-label="Trả lời của ohmyt"
    >
      {selectMode && onToggleSelect && (
        <button type="button" role="checkbox" aria-checked={selected}
          aria-label={t.select} onClick={() => onToggleSelect(message)}
          className="message-select-box mt-1" data-checked={selected}>
          {selected && <Check size={13} />}
        </button>
      )}
      <div
        ref={bodyRef}
        className="group relative message-body select-text flex-1 min-w-0"
        role="group"
        aria-label="Nội dung trả lời của ohmyt"
        tabIndex={appearance.contextMenu === 'default' ? 0 : undefined}
        onContextMenu={handleContextMenu}
        onKeyDown={handleBodyKeyDown}
      >
        {(isStreaming || activity) && (
          <ResponseActivity runId={activity?.runId} tools={activity?.tools ?? tools} reasoning={activity?.reasoning ?? ''} progress={activity?.progress}
            phase={activity?.phase} startedAt={activity?.startedAt} durationMs={activity?.durationMs} status={activity?.status}
            isStreaming={Boolean(isStreaming)} hasContent={Boolean(message.content.trim())}
            locale={lang} autoExpandTools={appearance.autoExpandTools} animated={animOn} />
        )}
        {/* Content */}
        {(smoothContent || (!isStreaming && message.content)) && <div className={`message-content message-response select-text leading-relaxed${isStreaming ? ' is-streaming' : ''}`} data-response-entry={responseEntry} style={{ color: 'var(--text-primary)' }}>
          {renderFormattedContent(smoothContent)}

          {isStreaming && (
            <span
              className="response-cursor"
              aria-hidden="true"
              style={{ backgroundColor: 'var(--accent)' }}
            />
          )}
        </div>}

        {!isStreaming && htmlArtifacts(message.content, activity?.tools ?? tools).map((artifact, index) => <HtmlPreview key={`${artifact.name}-${index}`} artifact={artifact} />)}

        {renderTranslation()}

        {/* Inline tool calls */}
        {!isStreaming && !activity && tools.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {tools.map(tool => (
              <ToolCallCard key={tool.id} tool={tool} autoExpandTools={appearance.autoExpandTools} />
            ))}
          </div>
        )}
        {actionsEnabled && !selectMode && (
          <div ref={barRef} className={`message-actions-bar is-assistant${menuOpen ? ' is-open' : ''}`}>
            <button type="button" onClick={doCopy} title={copyLabel} aria-label={copyLabel}
              className={barButtonClass}>
              {copyState === 'copied' ? <Check size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
            </button>
            {onRegenerateMessage && (
              <button type="button" onClick={() => onRegenerateMessage(message)} title={t.regenerate} aria-label={t.regenerate}
                className={barButtonClass}>
                <RotateCcw size={15} />
              </button>
            )}
            <button type="button" onClick={() => toggleMenu(false)} title={t.menu} aria-label={t.menu} aria-expanded={menuOpen} aria-haspopup="menu"
              className={barButtonClass}>
              <MoreHorizontal size={15} />
            </button>
            {renderLobeMenu(assistantMenuItems, false)}
          </div>
        )}
        {copyFeedback}
        {menu}
      </div>
    </div>
  );
};
