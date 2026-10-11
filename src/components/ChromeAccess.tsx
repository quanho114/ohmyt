import { copyToClipboard } from '../clipboard.ts';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Link, RefreshCw, Unplug, X } from 'lucide-react';
import { api } from '../api.ts';
import type { ChromeStatus, ChromeTab } from '../types.ts';

function Chrome({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 8h8M8.5 14l-4-7M14 15.5 10.5 21" /></svg>;
}

export function ChromeAccess({ sessionId }: { sessionId: string }) {
  const integrated = Boolean(window.electronAPI?.openBrowser);
  const [open, setOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(() => sessionStorage.getItem(`ohmyt-browser-open:${JSON.stringify(sessionId)}`) === 'true');
  useEffect(() => {
    setBrowserOpen(sessionStorage.getItem(`ohmyt-browser-open:${JSON.stringify(sessionId)}`) === 'true');
    const update = (event: Event) => setBrowserOpen((event as CustomEvent<boolean>).detail);
    window.addEventListener('ohmyt-browser-state', update);
    return () => window.removeEventListener('ohmyt-browser-state', update);
  }, [sessionId]);
  const [status, setStatus] = useState<ChromeStatus>({ connected: false, tabs: [] });
  const [tabs, setTabs] = useState<ChromeTab[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [pairing, setPairing] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const titleId = useId();
  const refresh = useCallback(async (listTabs = false) => {
    const current = generation.current;
    const next = await api.getChromeStatus(sessionId);
    if (current !== generation.current) return;
    setStatus(next);
    if (listTabs) {
      setSelected(next.tabs.map(tab => tab.id));
      const available = next.connected ? await api.getChromeTabs() : [];
      if (current === generation.current) setTabs(available);
    }
  }, [sessionId]);
  useEffect(() => {
    generation.current++; setPairing(''); setSelected([]); setTabs([]); setError('');
    void refresh().catch(() => {});
    const timer = setInterval(() => void refresh().catch(() => {}), open ? 3000 : 15000);
    return () => { generation.current++; clearInterval(timer); };
  }, [refresh, open]);
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    return () => { dialogRef.current?.close(); };
  }, [open, refresh]);
  useEffect(() => {
    if (open && status.connected) void refresh(true).catch(cause => setError(cause.message));
  }, [open, status.connected, refresh]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { lock.current = false; setBusy(false); }
  };
  const close = () => { if (busy) return; setOpen(false); triggerRef.current?.focus(); };
  const active = status.connected && status.tabs.length > 0;
  return <>
    <button ref={triggerRef} type="button" title={integrated ? (browserOpen ? 'Đóng trình duyệt' : 'Mở trình duyệt') : active ? `Trình duyệt · ${status.tabs.length} tab được chia sẻ` : integrated ? 'Mở trình duyệt' : 'Kết nối Chrome'} aria-label="Truy cập Chrome" onClick={() => integrated ? window.dispatchEvent(new Event('ohmyt-browser-toggle')) : setOpen(true)} className="chrome-access-trigger" data-active={integrated ? browserOpen : active} aria-pressed={integrated ? browserOpen : open}><Chrome size={16} />{active && <span className="chrome-access-dot" />}</button>
    {open && createPortal(<dialog ref={dialogRef} className="session-action-dialog chrome-access-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}>
      <header><div><h2 id={titleId}><Chrome size={19} /> {integrated ? 'Trình duyệt' : 'Truy cập Chrome'}</h2><p>Cho AI làm việc trên các tab bạn chọn.</p></div><button type="button" disabled={busy} aria-label="Đóng" onClick={close}><X size={17} /></button></header>
      <div className="chrome-access-body">
        <div className="chrome-connection-state" data-connected={status.connected}><span className="chrome-state-dot" /><strong>{status.connected ? integrated ? 'Trình duyệt sẵn sàng' : 'Chrome đã kết nối' : integrated ? 'Đang chuẩn bị trình duyệt…' : 'Chrome chưa kết nối'}</strong>{status.connected && !integrated && <button type="button" disabled={busy} title="Ngắt kết nối Chrome" aria-label="Ngắt kết nối Chrome" onClick={() => void run(async () => { await api.disconnectChrome(); setTabs([]); setSelected([]); await refresh(); })}><Unplug size={15} /></button>}</div>
        {integrated && <button type="button" disabled={busy} onClick={() => void run(async () => { await window.electronAPI!.openBrowser(); await refresh(true); })}>Mở trình duyệt</button>}
        {!status.connected ? integrated ? <p className="chrome-access-note">Trình duyệt có sẵn trong bản desktop. Mở website rồi chọn tab để chia sẻ với AI.</p> : <>
          <ol className="chrome-setup-steps"><li><strong>Cài tiện ích ohmyt</strong><p>Tải và giải nén tiện ích. Vào <code>chrome://extensions</code>, bật Chế độ nhà phát triển, chọn “Tải tiện ích đã giải nén” và chọn thư mục vừa giải nén.</p><button type="button" disabled={busy} onClick={() => void run(api.downloadChromeExtension)}><Download size={15} /> Tải tiện ích Chrome</button></li><li><strong>Ghép nối với ohmyt</strong><p>Tạo mã, mở tiện ích ohmyt trên Chrome rồi dán mã để kết nối.</p><button type="button" disabled={busy} onClick={() => void run(async () => { const result = await api.createChromePairing(); setPairing(result.connection); setCopied(false); })}><Link size={15} /> {pairing ? 'Tạo mã mới' : 'Tạo mã kết nối'}</button>{pairing && <div className="chrome-pair-code"><input aria-label="Mã kết nối Chrome" type="password" readOnly value={pairing} /><button type="button" title="Sao chép mã" aria-label="Sao chép mã" onClick={() => void run(async () => { await copyToClipboard(pairing); setCopied(true); })}>{copied ? <Check size={15} /> : <Copy size={15} />}</button><small>Mã dùng một lần, hết hạn sau 10 phút.</small></div>}</li></ol>
        </> : <>
          <div className="chrome-tab-heading"><strong>Tab cho cuộc trò chuyện này</strong><button type="button" disabled={busy} title="Tải lại danh sách tab" aria-label="Tải lại danh sách tab" onClick={() => void run(() => refresh(true))}><RefreshCw size={15} /></button></div>
          <p className="chrome-access-note">{integrated ? 'Mở website trong trình duyệt ohmyt rồi chọn tab bên dưới. Phiên đăng nhập được lưu riêng trong app.' : 'Mở tiện ích trên trang cần dùng và bấm “Cho phép trang này”, sau đó chọn tab bên dưới.'} Nội dung được đọc có thể được gửi tới mô hình AI đang dùng.</p>
          <div className="chrome-tab-list">{tabs.length ? tabs.map(tab => <label key={tab.id} className="chrome-tab-option"><input type="checkbox" disabled={busy} checked={selected.includes(tab.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, tab.id] : ids.filter(id => id !== tab.id))} /><span><strong>{tab.title}</strong><small>{tab.url}</small></span></label>) : <p className="chrome-access-note">Chưa có tab. Mở một website trong Chrome rồi tải lại danh sách.</p>}</div>
          <p className="chrome-access-note">AI có thể đọc, bấm, nhập và cuộn trong tab được chia sẻ. Bạn có thể thu hồi quyền bất cứ lúc nào.</p>
          <footer><button type="button" disabled={busy || !status.tabs.length} onClick={() => void run(async () => { const next = await api.shareChromeTabs(sessionId, []); setStatus(next); setSelected([]); })}>Thu hồi quyền</button><button type="button" className="session-dialog-primary" disabled={busy || !selected.length} onClick={() => void run(async () => { const next = await api.shareChromeTabs(sessionId, selected); setStatus(next); setOpen(false); triggerRef.current?.focus(); })}>{busy ? 'Đang lưu…' : `Chia sẻ ${selected.length || ''} tab với AI`}</button></footer>
        </>}
        {error && <p role="alert" className="session-dialog-error">{error}</p>}
      </div>
    </dialog>, document.body)}
  </>;
}
