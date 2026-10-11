import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowLeft, Check, ChevronRight, Ellipsis, FolderOpen, List, Pin, PinOff, Plus, Settings, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { Project } from '../types.ts';

interface Props {
  project: Project;
  disabled: boolean;
  sections: string[];
  chatCount: number;
  onUpdate: (values: { name?: string; pinned?: boolean; section?: string | null }) => Promise<void>;
  onArchive: () => Promise<void>;
  onRemove: () => Promise<void>;
}

export function ProjectActions({ project, disabled, sections, chatCount, onUpdate, onArchive, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [sectionMenu, setSectionMenu] = useState(false);
  const [dialog, setDialog] = useState<'edit' | 'section' | 'archive' | 'remove' | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const menuId = useId();
  const titleId = useId();
  const inputId = useId();
  const close = () => { setOpen(false); setSectionMenu(false); triggerRef.current?.focus({ preventScroll: true }); };
  const showDialog = (type: NonNullable<typeof dialog>) => {
    setOpen(false); setSectionMenu(false); setError(''); setValue(type === 'edit' ? project.name : ''); setDialog(type);
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try { await action(); setDialog(null); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { lock.current = false; setSaving(false); }
  };
  useEffect(() => {
    if (!dialog) return;
    dialogRef.current?.showModal();
    inputRef.current?.focus(); inputRef.current?.select();
    return () => { dialogRef.current?.close(); };
  }, [dialog]);
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      if (!rect.width || trigger.closest('[hidden],[inert]')) { setOpen(false); return; }
      menu.style.left = `${Math.max(8, Math.min(rect.right - 40, window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${rect.bottom + menu.offsetHeight + 5 < window.innerHeight - 8 ? rect.bottom + 5 : Math.max(8, rect.top - menu.offsetHeight - 5)}px`;
      menu.style.visibility = 'visible';
    };
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) { setOpen(false); setSectionMenu(false); }
    };
    const scroll = (event: Event) => { if (event.target instanceof Node && !menu.contains(event.target)) { setOpen(false); setSectionMenu(false); } };
    position();
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position); observer.observe(menu); observer.observe(trigger);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('focusin', dismiss, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('focusin', dismiss, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', position);
    };
  }, [open, sectionMenu]);
  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowLeft' && sectionMenu) { event.preventDefault(); setSectionMenu(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  const openFolder = () => run(async () => {
    if (!window.electronAPI?.openProjectDirectory) throw new Error('Mở thư mục cần dùng ứng dụng ohmyt trên máy tính.');
    await window.electronAPI.openProjectDirectory(project.path);
  });
  return <>
    <button ref={triggerRef} type="button" disabled={disabled || saving} className="session-menu-trigger project-menu-trigger" aria-label={`Thao tác dự án: ${project.name}`} title="Thao tác dự án" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => { setError(''); setSectionMenu(false); setOpen(value => !value); }}><Ellipsis size={16} /></button>
    {open && createPortal(<div ref={menuRef} id={menuId} role="menu" aria-label={`Thao tác dự án ${project.name}`} className="session-actions-menu project-actions-menu" style={{ visibility: 'hidden' }} onKeyDown={menuKeys}>
      {sectionMenu ? <>
        <button type="button" role="menuitem" onClick={() => setSectionMenu(false)}><ArrowLeft size={16} /><span>Mục</span></button>
        <div role="separator" />
        <button type="button" role="menuitemradio" aria-checked={!project.section && !project.pinned} disabled={saving} onClick={() => void run(() => onUpdate({ section: null, pinned: false }))}><List size={16} /><span>Dự án</span>{!project.section && !project.pinned && <Check size={15} />}</button>
        <button type="button" role="menuitemradio" aria-checked={Boolean(project.pinned)} disabled={saving} onClick={() => void run(() => onUpdate({ pinned: true }))}><Pin size={16} /><span>Đã ghim</span>{Boolean(project.pinned) && <Check size={15} />}</button>
        {sections.map(section => <button key={section} type="button" role="menuitemradio" aria-checked={project.section === section && !project.pinned} disabled={saving} onClick={() => void run(() => onUpdate({ section, pinned: false }))}><List size={16} /><span>{section}</span>{project.section === section && !project.pinned && <Check size={15} />}</button>)}
        <div role="separator" /><button type="button" role="menuitem" onClick={() => showDialog('section')}><Plus size={16} /><span>Tạo mục mới</span></button>
      </> : <>
        <button type="button" role="menuitem" disabled={saving} onClick={() => void run(() => onUpdate({ pinned: !project.pinned }))}>{project.pinned ? <PinOff size={16} /> : <Pin size={16} />}<span>{project.pinned ? 'Bỏ ghim' : 'Ghim'}</span></button>
        <button type="button" role="menuitem" onClick={() => showDialog('edit')}><Settings size={16} /><span>Chỉnh sửa</span></button>
        <div role="separator" />
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => setSectionMenu(true)} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); setSectionMenu(true); } }}><List size={16} /><span>Mục</span><ChevronRight size={15} /></button>
        <button type="button" role="menuitem" disabled={saving} onClick={() => void openFolder()}><FolderOpen size={16} /><span>Mở trong Trình quản lý tệp</span></button>
        <div role="separator" />
        <button type="button" role="menuitem" disabled={!chatCount} onClick={() => showDialog('archive')}><Archive size={16} /><span>Lưu trữ các cuộc trò chuyện</span></button>
        <div role="separator" />
        <button type="button" role="menuitem" className="session-menu-delete" onClick={() => showDialog('remove')}><X size={16} /><span>Gỡ dự án</span></button>
      </>}
      {error && <p role="alert" className="session-dialog-error px-2 pb-2">{error}</p>}
    </div>, document.body)}
    {dialog && createPortal(<dialog ref={dialogRef} aria-labelledby={titleId} className="session-action-dialog" onCancel={event => { event.preventDefault(); if (!saving) { setDialog(null); close(); } }}>
      <header><h2 id={titleId}>{dialog === 'edit' ? 'Chỉnh sửa dự án' : dialog === 'section' ? 'Tạo mục mới' : dialog === 'archive' ? 'Lưu trữ các cuộc trò chuyện?' : 'Gỡ dự án?'}</h2><button type="button" disabled={saving} aria-label="Đóng" onClick={() => { setDialog(null); close(); }}><X size={17} /></button></header>
      <form onSubmit={event => { event.preventDefault(); void run(() => dialog === 'edit' ? onUpdate({ name: value.trim() }) : dialog === 'section' ? onUpdate({ section: value.trim(), pinned: false }) : dialog === 'archive' ? onArchive() : onRemove()); }}>
        {(dialog === 'edit' || dialog === 'section') ? <><label htmlFor={inputId}>{dialog === 'edit' ? 'Tên dự án' : 'Tên mục'}</label><input ref={inputRef} id={inputId} value={value} onChange={event => setValue(event.target.value)} maxLength={dialog === 'edit' ? 100 : 60} required disabled={saving} />{dialog === 'edit' && <div className="project-directory-detail"><span>Thư mục làm việc</span><p>{project.path}</p><small>Tên hiển thị không làm đổi tên thư mục trên máy.</small></div>}</> : <p className="project-confirm-copy">{dialog === 'archive' ? `Ẩn ${chatCount} cuộc trò chuyện của “${project.name}” khỏi sidebar. Bạn có thể khôi phục trong mục Đã lưu trữ.` : `Gỡ “${project.name}” và xóa vĩnh viễn toàn bộ lịch sử chat, kể cả chat đã lưu trữ, cùng bộ nhớ của dự án. Thêm lại thư mục sẽ bắt đầu mới. Các tệp trên máy được giữ nguyên.`}</p>}
        {error && <p role="alert" className="session-dialog-error">{error}</p>}
        <footer><button type="button" disabled={saving} onClick={() => { setDialog(null); close(); }}>Hủy</button><button type="submit" className="session-dialog-primary" disabled={saving || ((dialog === 'edit' || dialog === 'section') && !value.trim())}>{saving ? 'Đang lưu…' : dialog === 'archive' ? 'Lưu trữ' : dialog === 'remove' ? 'Gỡ dự án' : 'Lưu'}</button></footer>
      </form>
    </dialog>, document.body)}
  </>;
}
