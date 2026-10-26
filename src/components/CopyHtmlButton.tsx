import {useEffect,useRef,useState} from 'react';
import {Copy,Check} from 'lucide-react';
import {copyToClipboard} from '../clipboard.ts';

export function CopyHtmlButton({content}:{content:string}) {
  const [state,setState]=useState<'idle'|'copied'|'failed'>('idle');
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const revision=useRef(0);
  useEffect(()=>{revision.current++;setState('idle');clearTimeout(timer.current);return()=>{revision.current++;clearTimeout(timer.current);};},[content]);
  const copy=async()=>{
    const current=++revision.current;
    clearTimeout(timer.current);
    try{
      await copyToClipboard(content);
      if(current!==revision.current)return;
      setState('copied');
      timer.current=setTimeout(()=>setState('idle'),2000);
    }catch{if(current===revision.current)setState('failed');}
  };
  return <div className="html-copy-control" data-state={state}>
    <button type="button" aria-label="Copy code" onClick={()=>void copy()}>
      <span className="html-copy-icons" aria-hidden="true"><Copy size={14}/><Check size={14}/></span>
      <span>{state==='copied'?'Đã sao chép':state==='failed'?'Thử lại':'Copy code'}</span>
    </button>
    <span role="status" className="sr-only">{state==='copied'?'Đã sao chép code':state==='failed'?'Không thể sao chép code. Vui lòng thử lại.':''}</span>
  </div>;
}
