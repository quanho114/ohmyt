import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {Message} from '../types.ts';
import {visibleDocumentPrompt} from '../documents/chatContext.ts';
import './ChatHistoryRail.css';

interface Props {
  messages: Message[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  feedRef: React.RefObject<HTMLDivElement | null>;
  onJump: (element: HTMLElement) => void;
  en: boolean;
  hasNewContent?: boolean;
}

export function ChatHistoryRail({messages, scrollRef, feedRef, onJump, en, hasNewContent = false}: Props) {
  const turns = useMemo(() => messages.filter(m => m.sender === 'user').map(m => {
    const display = visibleDocumentPrompt(m.content);
    const text = display.text.replace(/^\/goal(?:\s+|$)/i, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').trim();
    let images = 0;
    try { const data = JSON.parse(m.metadata || '{}'); if (Array.isArray(data.images)) images = data.images.length; } catch { /* Historical metadata may be absent. */ }
    return {...m, label: text || display.names.join(', ') || (images ? (en ? `${images} attached images` : `Đã gửi ${images} ảnh`) : (en ? 'Message' : 'Tin nhắn'))};
  }), [messages, en]);
  const [active, setActive] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [previewTop, setPreviewTop] = useState(0);
  const [bounds, setBounds] = useState({top: 76, height: 300, width: 420});
  const rail = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const targets = useRef(new Map<string, HTMLElement>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = turns.find(t => t.id === selected);
  const sourceIndex = messages.findIndex(m => m.id === selected);
  let response = '';
  if (sourceIndex >= 0) {
    for (let i = sourceIndex + 1; i < messages.length && messages[i].sender !== 'user'; i++) {
      if (messages[i].sender === 'agent' && messages[i].content.trim()) {
        response = visibleDocumentPrompt(messages[i].content).text
          .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
          .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
          .replace(/[*_`#>]/g, '').trim();
        break;
      }
    }
  }
  const cancelClose = () => clearTimeout(closeTimer.current);
  const close = () => { clearTimeout(hoverTimer.current); cancelClose(); setSelected(null); };
  const show = (id: string) => {
    cancelClose(); clearTimeout(hoverTimer.current);
    const button = buttons.current.get(id), root = rail.current;
    if (button && root) setPreviewTop(Math.max(0, Math.min(root.clientHeight - 170, button.getBoundingClientRect().top - root.getBoundingClientRect().top - 30)));
    setSelected(id);
  };

  useLayoutEffect(() => {
    const scroller = scrollRef.current, feed = feedRef.current;
    if (!scroller || !feed) return;
    targets.current = new Map(Array.from(feed.querySelectorAll<HTMLElement>('[data-chat-turn]')).map(e => [e.dataset.chatTurn!, e]));
    let frame = 0;
    let positions: {id: string; top: number}[] = [];
    const update = () => {
      frame = 0;
      const threshold = scroller.scrollTop + 80;
      let current = positions[0]?.id || '';
      for (const p of positions) { if (p.top > threshold) break; current = p.id; }
      setActive(current);
    };
    const measure = () => {
      const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
      positions = Array.from(targets.current, ([id, element]) => ({id, top: element.getBoundingClientRect().top - origin}));
      setNarrow(scroller.clientWidth < 420);
      setBounds({top: scroller.offsetTop + (scroller.clientWidth < 420 ? -32 : 20), height: Math.max(0, scroller.clientHeight - 40), width: scroller.clientWidth});
      update();
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(measure);
    observer.observe(scroller); observer.observe(feed);
    scroller.addEventListener('scroll', scroll, {passive: true}); measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); scroller.removeEventListener('scroll', scroll); };
  }, [turns, scrollRef, feedRef]);

  useEffect(() => () => { clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    const id = selected || active;
    const button = buttons.current.get(id), container = list.current;
    if (button && container && (!selected || document.activeElement === button)) {
      container.scrollTop = Math.max(0, button.offsetTop - container.clientHeight / 2 + 12);
    }
  }, [active, selected, expanded]);
  useEffect(() => {
    if (!selected && !expanded) return;
    const dismiss = (event: PointerEvent) => { if (!rail.current?.contains(event.target as Node)) { close(); setExpanded(false); } };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selected, expanded]);

  if (turns.length < 3) return null;
  const jump = (id: string, keyboard: boolean) => {
    const element = targets.current.get(id);
    if (!element) return;
    onJump(element); close(); setExpanded(false);
    if (keyboard) element.focus({preventScroll: true});
  };
  return <nav ref={rail} className="chat-history" style={{top: bounds.top, height: narrow ? undefined : bounds.height, '--history-width': `${Math.max(100, bounds.width - 30)}px`} as React.CSSProperties} data-narrow={narrow} data-expanded={expanded}
    aria-label={en ? 'Conversation sections' : 'Các đoạn hội thoại'}
    onMouseEnter={cancelClose} onMouseLeave={() => { clearTimeout(hoverTimer.current); closeTimer.current = setTimeout(() => setSelected(null), 150); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(); }}
    onKeyDown={event => { if (event.key === 'Escape') { if (narrow) rail.current?.querySelector<HTMLButtonElement>('.chat-history-toggle')?.focus(); else buttons.current.get(active)?.focus({preventScroll: true}); close(); setExpanded(false); } }}>
    <button type="button" className="chat-history-toggle" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{en ? 'Sections' : 'Các đoạn'}</button>
    <div className="chat-history-list" ref={list} onWheel={event => event.stopPropagation()}>
      {turns.map((turn, i) => <button key={turn.id} ref={element => { if (element) buttons.current.set(turn.id, element); else buttons.current.delete(turn.id); }}
        type="button" className="chat-history-mark" data-new={hasNewContent && i === turns.length - 1 || undefined} aria-current={turn.id === active ? 'location' : undefined}
        aria-label={en ? `Section ${i + 1} of ${turns.length}: ${turn.label}` : `Đoạn ${i + 1} trên ${turns.length}: ${turn.label}`}
        tabIndex={turn.id === (active || turns[0].id) ? 0 : -1}
        onMouseEnter={() => { cancelClose(); clearTimeout(hoverTimer.current); if (selected) show(turn.id); else hoverTimer.current = setTimeout(() => show(turn.id), 180); }}
        onFocus={() => show(turn.id)} onClick={event => jump(turn.id, event.detail === 0)}
        onKeyDown={event => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? turns.length - 1 : event.key === 'ArrowUp' ? Math.max(0, i - 1) : event.key === 'ArrowDown' ? Math.min(turns.length - 1, i + 1) : -1;
          if (next >= 0) { event.preventDefault(); buttons.current.get(turns[next].id)?.focus({preventScroll: true}); }
        }}><span className="chat-history-line"/><span className="chat-history-label">{turn.label}</span></button>)}
    </div>
    {shown && !narrow && <button type="button" className="chat-history-preview" style={{top: previewTop}} onMouseEnter={cancelClose}
      onClick={event => jump(shown.id, event.detail === 0)}>
      <span className="chat-history-question">{shown.label}</span>
      {response && <span className="chat-history-response">{response}</span>}
    </button>}
  </nav>;
}
