import React,{useId,useRef,useState,useEffect} from 'react';
import type {ContextUsage} from '../api.ts';

export function ContextMeter({usage,selectedModel,en=false}:{usage?:ContextUsage|null;selectedModel:{providerId:string;modelId:string}|null;en?:boolean}){
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),id=useId();
  const valid=usage&&Number.isFinite(usage.used)&&usage.used>=0&&usage.limit>0&&usage.providerId===selectedModel?.providerId&&usage.modelId===selectedModel?.modelId;
  const percent=valid?Math.round(usage.used/usage.limit*100):null;
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
  },[]);
  const label=en?'Context used':'Context đã dùng';
  const format=(value:number)=>value.toLocaleString(en?'en-US':'vi-VN');
  return <div ref={root} className="context-meter" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation();}}}>
    <button type="button" className="context-meter-trigger" aria-label={`${label}: ${percent===null?(en?'No data':'Chưa có dữ liệu'):`${percent}%`}`} aria-expanded={open} aria-controls={id} onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle className="context-meter-track" cx="12" cy="12" r="9"/><circle className="context-meter-fill" cx="12" cy="12" r="9" pathLength="100" strokeDasharray={`${Math.min(100,percent??0)} 100`} transform="rotate(-90 12 12)"/></svg>
    </button>
    {open&&<div id={id} className="context-meter-card" role="status">
      <div className="context-meter-heading"><strong>Context</strong><span>{percent===null?'—':`${percent}%`}</span></div>
      {valid?<><div className="context-meter-count">{format(usage.used)} / {format(usage.limit)} tokens</div><progress max={usage.limit} value={Math.min(usage.used,usage.limit)} aria-label={label}/><p>{en?'Latest request input, including instructions and tools. Active harness limit.':'Đầu vào request gần nhất, gồm chỉ dẫn và công cụ. Giới hạn harness đang áp dụng.'} {usage.accuracy!=='exact'?(en?'Estimated.':'Ước tính.'):''}</p>{usage.source==='provider'&&<p>{en?'Provider-reported input':'Đầu vào do provider báo'}</p>}{usage.breakdown&&<div className="context-meter-breakdown"><p>{en?'Estimated composition':'Thành phần ước tính'}</p><p>{en?'Composition uses a separate estimator; totals may differ.':'Phân rã dùng bộ ước tính riêng, tổng có thể khác số ở trên.'}</p>{[['System',usage.breakdown.system],['Tools',usage.breakdown.tools],[en?'Chat':'Hội thoại',usage.breakdown.messages]].map(([name,value])=><div key={name}><span>{name}</span><span>{format(Number(value))}</span></div>)}</div>}{usage.modelLimit&&<p>{en?'Model capacity':'Sức chứa model'}: {format(usage.modelLimit)}</p>}{Boolean(usage.reserved)&&<p>{en?'Reserved for response':'Dành cho phản hồi'}: {format(usage.reserved!)} tokens</p>}</>:<p>{en?'No data for this model yet. If you already sent a message, restart sky and its backend.':'Chưa có số liệu cho model này. Nếu đã gửi tin, hãy khởi động lại sky và backend.'}</p>}
    </div>}
  </div>;
}
