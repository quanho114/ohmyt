import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Session } from '../types.ts';

export function ArchivedChats({ sessions, onClose, onRestore, onSelect }: { sessions: Session[]; onClose: () => void; onRestore: (id: string) => Promise<void>; onSelect: (id: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => { dialogRef.current?.showModal(); return () => { dialogRef.current?.close(); }; }, []);
  const restore = async (id: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(id); setError('');
    try { await onRestore(id); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { lock.current = false; setBusy(null); }
  };
  const items = sessions.filter(session => `${session.title} ${session.project_name || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return createPortal(<dialog ref={dialogRef} aria-labelledby={titleId} className="session-action-dialog session-history-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id={titleId}>Các cuộc trò chuyện đã lưu trữ</h2><button type="button" aria-label="Đóng" disabled={Boolean(busy)} onClick={onClose}><X size={17} /></button></header>
    <div className="archived-chat-list">
      <input aria-label="Tìm cuộc trò chuyện đã lưu trữ" placeholder="Tìm theo tên cuộc trò chuyện hoặc dự án…" value={query} onChange={event => setQuery(event.target.value)} />
      {error && <p role="alert" className="session-dialog-error">{error}</p>}
      {items.length ? items.map(session => <div key={session.id} className="archived-chat-row"><button type="button" disabled={Boolean(busy)} onClick={() => onSelect(session.id)}><strong>{session.title}</strong><small>{session.project_name || 'Không có dự án'} · {new Date(session.archived_at!).toLocaleDateString('vi-VN')}</small></button><button type="button" className="archived-chat-restore" disabled={Boolean(busy)} onClick={() => void restore(session.id)}>{busy === session.id ? 'Đang khôi phục…' : 'Khôi phục'}</button></div>) : <p className="project-confirm-copy py-4">{query ? 'Không tìm thấy cuộc trò chuyện.' : 'Chưa có cuộc trò chuyện nào được lưu trữ.'}</p>}
    </div>
  </dialog>, document.body);
}
