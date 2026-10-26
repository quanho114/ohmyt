import {CopyHtmlButton} from './CopyHtmlButton.tsx';
import {HtmlCode} from './HtmlCode.tsx';
import {useEffect,useId,useRef,useState} from 'react';
import {Code2,Eye,LoaderCircle} from 'lucide-react';
import type {ToolCallItem} from '../types.ts';
import './LiveHtmlPreview.css';

export function LiveHtmlPreview({draft,tools}:{draft:{toolId:string;name:string;content:string};tools:ToolCallItem[]}) {
  const id=useId();
  const tool=tools.find(item=>item.id===draft.toolId);
  const completed=tool?.status==='completed';
  const content=completed&&typeof tool.input.content==='string'?tool.input.content:draft.content;
  const name=completed&&typeof tool.input.name==='string'?tool.input.name:draft.name;
  const [tab,setTab]=useState<'code'|'preview'>('code');
  const code=useRef<HTMLPreElement>(null);
  const following=useRef(true);
  useEffect(()=>{setTab('code');following.current=true;},[draft.toolId]);
  useEffect(()=>{if(following.current&&code.current)code.current.scrollTop=code.current.scrollHeight;},[content]);
  return <section className="live-html" aria-label="HTML đang tạo">
    <header><span className="live-html-name">{name}</span><span className="live-html-state">{!completed&&<LoaderCircle size={13} className="trace-running-icon"/>}{completed?'Đã tạo HTML':'Đang viết HTML'}</span></header>
    <div className="live-html-code-toolbar"><div className="live-html-tabs" role="tablist" aria-label="Hiển thị HTML">
      <button type="button" role="tab" aria-selected={tab==='code'} aria-controls={`${id}-code`} onClick={()=>setTab('code')}><Code2 size={14}/>Code</button>
      <button type="button" role="tab" aria-selected={tab==='preview'} aria-controls={`${id}-preview`} disabled={!completed} onClick={()=>setTab('preview')}><Eye size={14}/>Preview</button>
      <span>{content.length.toLocaleString()} ký tự</span>
    </div><CopyHtmlButton content={content}/></div>
    {tab==='code'?<HtmlCode id={`${id}-code`} content={content} codeRef={code} onScroll={e=>{const el=e.currentTarget;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<40;}}/>
      :<iframe id={`${id}-preview`} role="tabpanel" title={`Preview ${name}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={content}/>}
  </section>;
}
