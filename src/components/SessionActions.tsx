import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronRight, Download, Ellipsis, FolderInput, Hash, Link, MessagesSquare, Pencil, Trash2, X } from 'lucide-react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Message, Session } from '../types.ts';
import { api } from '../api.ts';

interface SessionActionsProps {
  session: Session;
  folders: Array<{ id: string; name: string }>;
  folderId?: string;
  onMoveFolder: (folderId: string | null) => void;
  onRename: (title: string) => Promise<void>;
  onDelete: () => void;
  onRequestRename?: () => void;
}

export function SessionActions({ session, folders, folderId, onMoveFolder, onRename, onDelete, onRequestRename }: SessionActionsProps) {
  const menuId = useId();
  const dialogTitleId = useId();
  const titleInputId = useId();
  const [open, setOpen] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'messages' | null>(null);
  const [title, setTitle] = useState(session.title);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; failed: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogWasOpenRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const dialogGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const closeMenu = (restoreFocus = true) => {
    setOpen(false);
    setFolderMenu(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const position = () => {
      const anchor = trigger.getBoundingClientRect();
      if (!anchor.width || trigger.closest('[hidden],[inert]')) { setOpen(false); return; }
      const left = Math.max(8, Math.min(anchor.right - 44, window.innerWidth - menu.offsetWidth - 8));
      const top = anchor.bottom + 5 + menu.offsetHeight <= window.innerHeight - 8
        ? anchor.bottom + 5 : Math.max(8, anchor.top - menu.offsetHeight - 5);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = 'visible';
    };
    const dismissOutside = (event: Event) => {
      if (!(event.target instanceof Node) || menu.contains(event.target) || trigger.contains(event.target)) return;
      setOpen(false);
      setFolderMenu(false);
    };
    const dismissScroll = (event: Event) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      setOpen(false);
      setFolderMenu(false);
    };
    position();
    menu.querySelector<HTMLButtonElement>('[role="menuitem"],[role="menuitemradio"]')?.focus({ preventScroll: true });
    const resize = new ResizeObserver(position);
    resize.observe(menu);
    resize.observe(trigger);
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside, true);
    document.addEventListener('scroll', dismissScroll, true);
    window.addEventListener('resize', position);
    return () => {
      resize.disconnect();
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside, true);
      document.removeEventListener('scroll', dismissScroll, true);
      window.removeEventListener('resize', position);
    };
  }, [open, folderMenu]);

  useEffect(() => {
    if (!dialog) {
      if (dialogWasOpenRef.current) triggerRef.current?.focus({ preventScroll: true });
      dialogWasOpenRef.current = false;
      return;
    }
    dialogWasOpenRef.current = true;
    const element = dialogRef.current;
    element?.showModal();
    if (dialog === 'rename') { titleRef.current?.focus(); titleRef.current?.select(); }
    return () => { element?.close(); };
  }, [dialog]);

  useEffect(() => {
    if (dialog !== 'messages') return;
    let cancelled = false;
    api.getMessages(session.id).then(result => {
      if (!cancelled) setMessages(result);
    }).catch(error => {
      if (!cancelled) setDialogError(error instanceof Error ? error.message : 'Không thể tải tin nhắn.');
    });
    return () => { cancelled = true; };
  }, [dialog, session.id]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') { closeMenu(false); return; }
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)') || [])];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowLeft' && folderMenu) { event.preventDefault(); setFolderMenu(false); return; }
    else return;
    event.preventDefault();
    items[next]?.focus();
  };

  const openDialog = (type: 'rename' | 'messages') => {
    closeMenu(false);
    dialogGenerationRef.current += 1;
    setSaving(false);
    setTitle(session.title);
    setMessages(null);
    setDialogError('');
    setDialog(type);
  };

  const closeDialog = () => {
    dialogGenerationRef.current += 1;
    setSaving(false);
    setDialog(null);
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle.length > 200 || saving) return;
    const generation = dialogGenerationRef.current;
    setSaving(true);
    setDialogError('');
    try {
      await onRename(nextTitle);
      if (mountedRef.current && generation === dialogGenerationRef.current) closeDialog();
    } catch (error) {
      if (mountedRef.current && generation === dialogGenerationRef.current) setDialogError(error instanceof Error ? error.message : 'Không thể đổi tên phiên.');
    } finally {
      if (mountedRef.current && generation === dialogGenerationRef.current) setSaving(false);
    }
  };

  const copy = async (value: string, label: string) => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(value);
      if (mountedRef.current) setFeedback({ text: `Đã sao chép ${label}.`, failed: false });
    } catch {
      if (mountedRef.current) setFeedback({ text: 'Không thể sao chép vào clipboard.', failed: true });
    }
  };

  const exportSession = async () => {
    if (exporting) return;
    closeMenu();
    setExporting(true);
    setFeedback({ text: 'Đang chuẩn bị tệp xuất…', failed: false });
    try {
      const history = await api.getMessages(session.id);
      if (!mountedRef.current) return;
      const blob = new Blob([JSON.stringify({ version: 1, session, messages: history }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${session.title.replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_').slice(0, 80) || 'session'}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ text: 'Đã tạo tệp xuất phiên.', failed: false });
    } catch (error) {
      if (mountedRef.current) setFeedback({ text: error instanceof Error ? error.message : 'Không thể xuất phiên.', failed: true });
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  };

  return <>
    <button ref={triggerRef} type="button" className="sidebar-session-action session-menu-trigger" aria-label={`Thao tác phiên: ${session.title}`} title="Thao tác phiên" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { setFeedback(null); setFolderMenu(false); setOpen(current => !current); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setFolderMenu(false); setOpen(true); } }}>
      <Ellipsis size={16} aria-hidden="true" />
    </button>
    {feedback && createPortal(<div className="session-action-feedback" role="status" data-failed={feedback.failed}><span>{feedback.text}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setFeedback(null)}><X size={14} aria-hidden="true" /></button></div>, document.body)}
    {open && createPortal(<div ref={menuRef} id={menuId} role="menu" aria-label={`Thao tác phiên ${session.title}`} className="session-actions-menu" style={{ visibility: 'hidden' }} onKeyDown={handleMenuKeyDown}>
      {folderMenu ? <>
        <button type="button" role="menuitem" onClick={() => setFolderMenu(false)}><ArrowLeft size={15} aria-hidden="true" /><span>Chuyển đến folder</span></button>
        <div role="separator" />
        <button type="button" role="menuitemradio" aria-checked={!folderId} onClick={() => { onMoveFolder(null); closeMenu(); }}><FolderInput size={15} aria-hidden="true" /><span>Chưa xếp</span>{!folderId && <Check size={14} aria-hidden="true" />}</button>
        {folders.map(folder => <button key={folder.id} type="button" role="menuitemradio" aria-checked={folderId === folder.id} onClick={() => { onMoveFolder(folder.id); closeMenu(); }}><FolderInput size={15} aria-hidden="true" /><span>{folder.name}</span>{folderId === folder.id && <Check size={14} aria-hidden="true" />}</button>)}
      </> : <>
        <button type="button" role="menuitem" onClick={() => { if (onRequestRename) { closeMenu(false); onRequestRename(); } else openDialog('rename'); }}><Pencil size={15} aria-hidden="true" /><span>Đổi tên</span></button>
        <button type="button" role="menuitem" onClick={() => openDialog('messages')}><MessagesSquare size={15} aria-hidden="true" /><span>Xem tin nhắn</span></button>
        <div role="separator" />
        <button type="button" role="menuitem" onClick={() => void copy(session.id, 'Session ID')}><Hash size={15} aria-hidden="true" /><span>Sao chép Session ID</span></button>
        <button type="button" role="menuitem" onClick={() => { const url = new URL(window.location.href); url.hash = `session/${encodeURIComponent(session.id)}`; void copy(url.href, 'liên kết'); }}><Link size={15} aria-hidden="true" /><span>Sao chép liên kết</span></button>
        {folders.length > 0 && <><div role="separator" /><button type="button" role="menuitem" aria-haspopup="menu" onClick={() => setFolderMenu(true)} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); setFolderMenu(true); } }}><FolderInput size={15} aria-hidden="true" /><span>Chuyển đến folder</span><ChevronRight size={14} aria-hidden="true" /></button></>}
        <div role="separator" />
        <button type="button" role="menuitem" disabled={exporting} onClick={() => void exportSession()}><Download size={15} aria-hidden="true" /><span>Xuất</span></button>
        <div role="separator" />
        <button type="button" role="menuitem" className="session-menu-delete" onClick={() => { closeMenu(); onDelete(); }}><Trash2 size={15} aria-hidden="true" /><span>Xóa</span></button>
      </>}
    </div>, document.body)}
    {dialog && createPortal(<dialog ref={dialogRef} className={`session-action-dialog ${dialog === 'messages' ? 'session-history-dialog' : ''}`} aria-labelledby={dialogTitleId} onCancel={event => { event.preventDefault(); closeDialog(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } }}>
      <header><h2 id={dialogTitleId}>{dialog === 'rename' ? 'Đổi tên phiên' : 'Tin nhắn trong phiên'}</h2><button type="button" aria-label="Đóng" onClick={closeDialog}><X size={17} aria-hidden="true" /></button></header>
      {dialog === 'rename' ? <form onSubmit={submitRename}>
        <label htmlFor={titleInputId}>Tên phiên</label><input ref={titleRef} id={titleInputId} value={title} maxLength={200} required disabled={saving} onChange={event => setTitle(event.currentTarget.value)} aria-invalid={Boolean(dialogError)} aria-describedby={dialogError ? `${dialogTitleId}-error` : undefined} />
        {dialogError && <p id={`${dialogTitleId}-error`} role="alert" className="session-dialog-error">{dialogError}</p>}
        <footer><button type="button" onClick={closeDialog}>Hủy</button><button type="submit" className="session-dialog-primary" disabled={saving || !title.trim()}>{saving ? 'Đang lưu…' : 'Lưu'}</button></footer>
      </form> : <div className="session-history-content">
        <p className="session-history-title">{session.title}</p>
        {dialogError ? <p role="alert" className="session-dialog-error">{dialogError}</p> : messages === null ? <p role="status">Đang tải tin nhắn…</p> : messages.length === 0 ? <p>Phiên này chưa có tin nhắn.</p> : <ol>{messages.map(message => <li key={message.id}><header><strong>{message.sender === 'user' ? 'Bạn' : message.sender === 'agent' ? 'Trợ lý' : 'Hệ thống'}</strong><time dateTime={new Date(message.created_at).toISOString()}>{new Date(message.created_at).toLocaleString('vi-VN')}</time></header><pre>{message.content}</pre></li>)}</ol>}
      </div>}
    </dialog>, document.body)}
  </>;
}
