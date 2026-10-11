import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUp, Download, Trash2, X, RefreshCw, FolderOpen, FileText, Braces, File, Plus, LoaderCircle, AlertCircle } from 'lucide-react';
import { api, type BrowserFile } from '../api.ts';
export function BrowserFiles({ sessionId, hiddenTrigger = false }: { sessionId: string; hiddenTrigger?: boolean }) {
  const [open, setOpen] = useState(false), [files, setFiles] = useState<BrowserFile[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), picker = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const load = useCallback(async () => { const token = generation.current; const response = await api.getBrowserFiles(sessionId); if (token === generation.current) { setFiles(response.files); setLoaded(true); } }, [sessionId]);
  useEffect(() => { generation.current++;setFiles([]);setOpen(false);setError('');setLoaded(false); }, [sessionId]);
  useEffect(() => { if (!open) return;dialog.current?.showModal();setLoaded(false);void load().catch(e => {setError(e.message);setLoaded(true);});const timer=setInterval(() => void load().catch(() => {}),5000);return () => { clearInterval(timer);dialog.current?.close(); }; }, [open, load]);
  useEffect(()=>window.electronAPI?.onBrowserFiles?.(()=>setOpen(true)),[]);
  const run = async (action: () => Promise<unknown>) => { if (busy) return;setBusy(true);setError('');try { await action();await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <>{!hiddenTrigger && <button type="button" onClick={() => setOpen(true)} className="control-button"><FileUp size={15} /> File trình duyệt</button>}
    {open && createPortal(<dialog ref={dialog} className="session-action-dialog browser-files-dialog" aria-labelledby="browser-files-title" onCancel={e => { if (busy) e.preventDefault(); else setOpen(false); }}>
      <header><div><h2 id="browser-files-title">File trình duyệt</h2><p>File bạn thêm và kết quả AI lưu trong chat này.</p></div><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="Đóng"><X size={17} /></button></header>
      <input ref={picker} type="file" hidden disabled={busy} onChange={e => { const file=e.target.files?.[0];e.target.value='';if(file)void run(() => api.uploadBrowserFile(sessionId,file)); }} />
      <div className="browser-files-content" aria-busy={busy || !loaded}>
        <div className="browser-files-actions"><span>{files.length ? `${files.length} file` : 'Trong chat này'}</span><div><button className="browser-files-icon-button" type="button" disabled={busy || !loaded} onClick={() => void run(load)} aria-label="Làm mới" title="Làm mới"><RefreshCw size={15} /></button><button className="browser-files-add" type="button" disabled={busy} onClick={() => picker.current?.click()}><Plus size={15} /> Thêm file</button></div></div>
        {!loaded ? <div className="browser-files-empty" role="status"><LoaderCircle size={23} className="browser-files-spin" /><p>Đang tải file…</p></div> : files.length ? <div className="browser-files-list">{files.map(file => {
          const Icon=file.kind === 'pdf' ? FileText : file.kind === 'extraction' ? Braces : File;
          const kind=file.kind === 'pdf' ? 'PDF' : file.kind === 'extraction' ? 'Dữ liệu JSON' : file.kind === 'upload' ? 'Bạn đã thêm' : 'Đã tải về';
          return <div key={file.fileId} className="browser-file-row"><span className="browser-file-type"><Icon size={19} /></span><div className="browser-file-info"><strong title={file.name}>{file.name}</strong><small>{file.bytes >= 1024*1024 ? `${(file.bytes/(1024*1024)).toFixed(1)} MB` : `${Math.max(1,Math.round(file.bytes/1024))} KB`}<span>·</span>{kind}</small></div><button className="browser-files-icon-button" type="button" disabled={busy} onClick={() => void run(() => api.downloadBrowserFile(sessionId,file))} title="Tải về" aria-label={`Tải ${file.name}`}><Download size={16} /></button><button className="browser-files-icon-button browser-file-delete" type="button" disabled={busy} onClick={() => void run(() => api.removeBrowserFile(sessionId,file.fileId))} title="Xóa file" aria-label={`Xóa ${file.name}`}><Trash2 size={15} /></button></div>;
        })}</div> : <div className="browser-files-empty"><span className="browser-files-empty-icon"><FolderOpen size={26} strokeWidth={1.5} /></span><h3>Chưa có file</h3><p>Thêm file để AI dùng trên website.<br />PDF và file tải về sẽ xuất hiện ở đây.</p></div>}
        {error && <div className="browser-files-notice" role="alert"><AlertCircle size={15} /><span>{error}</span></div>}
      </div>
      <footer className="browser-files-footer"><span>{busy ? <><LoaderCircle size={13} className="browser-files-spin" /> Đang xử lý…</> : 'Tối đa 25 MB mỗi file'}</span><span>{(files.reduce((sum,file)=>sum+file.bytes,0)/(1024*1024)).toFixed(1)} / 100 MB</span></footer>
    </dialog>, document.body)}</>;
}
