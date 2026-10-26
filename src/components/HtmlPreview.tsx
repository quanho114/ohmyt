import {CopyHtmlButton} from './CopyHtmlButton.tsx';
import {HtmlCode} from './HtmlCode.tsx';
import './LiveHtmlPreview.css';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCode2, Code2, Play, Download, ExternalLink, X } from 'lucide-react';
import type { HtmlArtifact } from '../htmlArtifacts.ts';

export function HtmlPreview({ artifact }: { artifact: HtmlArtifact }) {
  const [open, setOpen] = useState(false);
  const [tab,setTab] = useState<'code'|'preview'>('preview');
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([artifact.content], { type: 'text/html' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = artifact.name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chrome = async () => {
    setError(''); setOpening(true);
    try {
      if (!window.electronAPI?.openHtmlPreview) throw new Error('Khởi động lại app desktop để mở preview trong trình duyệt của app.');
      await new Promise<void>((resolve,reject) => window.dispatchEvent(new CustomEvent('ohmyt-browser-open-html', {detail:{content:artifact.content,resolve,reject}})));
    } catch (err) { setError(err instanceof Error ? err.message : 'Không mở được Chrome.'); }
    finally { setOpening(false); }
  };
  return <>
    <section className="html-artifact">
      <FileCode2 size={22} aria-hidden="true" />
      <div className="html-artifact-copy"><strong>{artifact.name}</strong><span>Trang web · HTML</span></div>
      <div className="html-artifact-actions">
        <button type="button" onClick={() => {setTab('preview');setOpen(true);}}><Play size={15} />Xem preview</button>
        <button type="button" onClick={()=>{setTab('code');setOpen(true);}}><Code2 size={15}/>Code</button>
        <button type="button" disabled={opening} onClick={chrome}><ExternalLink size={15} />{opening ? 'Đang mở…' : 'Mở Chrome'}</button>
        <button type="button" onClick={download} aria-label="Tải file HTML"><Download size={16} /></button>
      </div>
      {error && <p role="alert" className="html-artifact-error">{error}</p>}
    </section>
    {open && createPortal(<dialog ref={dialog} className="html-preview-dialog html-editor-dialog" onCancel={() => setOpen(false)}>
      <header><div className="html-editor-title"><span className="html-editor-file-icon"><FileCode2 size={20}/></span><div><strong>{artifact.name}</strong><small>HTML · {artifact.content.split('\n').length.toLocaleString()} dòng</small></div></div><button type="button" aria-label="Đóng preview" autoFocus onClick={() => setOpen(false)}><X size={20} /></button></header>
      <div className="html-editor-toolbar"><div className="live-html-tabs" role="tablist" aria-label="Hiển thị HTML">
        <button type="button" role="tab" aria-selected={tab==='code'} onClick={()=>setTab('code')}><Code2 size={14}/>Code</button>
        <button type="button" role="tab" aria-selected={tab==='preview'} onClick={()=>setTab('preview')}><Play size={14}/>Preview</button>
      </div>{tab==='code'&&<CopyHtmlButton content={artifact.content}/>}</div>
      {tab==='code'?<HtmlCode className="html-preview-code" content={artifact.content}/>:<iframe title={`Preview ${artifact.name}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={artifact.content} />}
    </dialog>, document.body)}
  </>;
}
