import {browserBounds} from '../browserBounds.ts';
import {flushSync} from 'react-dom';
import {useSessionEvents} from '../harness/useSessionEvents.ts';
import {ClientContributions} from '../harness/ClientContributions.tsx';
import {ArtifactPane} from './ArtifactPane.tsx';
import { api, type BrowserUseConfig } from '../api.ts';
import { BrowserFiles } from './BrowserFiles.tsx';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
export function BrowserPane({sessionId}:{sessionId:string|null}){
 const semanticSession=useSessionEvents(sessionId);
 const storageKey=`ohmyt-browser-open:${JSON.stringify(sessionId)}`;
 const [artifact,setArtifact]=useState<{artifactId:string;sessionId:string}|null>(null);
 const [open,setOpen]=useState(()=>sessionStorage.getItem(storageKey)==='true'),[error,setError]=useState('');
 useEffect(()=>{setArtifact(null);},[sessionId]);
 useEffect(()=>{const handler=(event:Event)=>{const item=(event as CustomEvent).detail;if(item.sessionId!==sessionId)return;setArtifact(item);setOpen(true);};window.addEventListener('ohmyt-artifact-open',handler);return()=>window.removeEventListener('ohmyt-artifact-open',handler);},[sessionId]);
 useLayoutEffect(()=>{sessionStorage.setItem(storageKey,String(open));sessionStorage.setItem('ohmyt-browser-open',String(open));window.dispatchEvent(new CustomEvent('ohmyt-browser-state',{detail:open}));},[open,storageKey]);
 const [runs,setRuns]=useState<{runId:string;state:string;authentication:boolean}[]>([]);
 useEffect(()=>{if(!sessionId||!open){setRuns([]);return;}let disposed=false;const refresh=()=>void api.getBrowserRuns(sessionId).then(value=>{if(!disposed)setRuns(value.runs);}).catch(()=>{});refresh();const timer=window.setInterval(refresh,1000);return()=>{disposed=true;clearInterval(timer);};},[sessionId,open]);
 const control=async(runId:string,action:'pause'|'resume'|'authentication')=>{if(!sessionId)return;try{await api.controlBrowserRun(sessionId,runId,action);setRuns((await api.getBrowserRuns(sessionId)).runs);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const [browserUse,setBrowserUse]=useState<BrowserUseConfig|null>(null);
 useEffect(()=>{
   if(!open)return;
   let disposed=false;
   const refresh=()=>void api.getBrowserUseConfig().then(value=>{if(!disposed)setBrowserUse(value);}).catch(()=>{if(!disposed)setBrowserUse(null);});
   refresh();const timer=window.setInterval(refresh,5000);
   return()=>{disposed=true;window.clearInterval(timer);};
 },[open]);
 useEffect(()=>{void window.electronAPI?.setBrowserFeatures?.({enabled:Boolean(browserUse?.enabled),installed:Boolean(browserUse?.installed),canFiles:Boolean(sessionId)}).catch(e=>setError(e.message));},[browserUse,sessionId]);
 useLayoutEffect(()=>{void window.electronAPI?.setBrowserChat?.(sessionId).catch(e=>setError(e.message));},[sessionId]);
 const [expanded,setExpanded]=useState(false);
 const changingLayout=useRef(false);
 useEffect(()=>{
   let animation:Animation|null=null;
   let request=0;
   const unsubscribe=window.electronAPI?.onBrowserPaneExpand?.(next=>{
     if(!animation && next===layoutState.current.expanded)return;
     const currentRequest=++request;
     const pane=paneRef.current;
     const current=pane?.getBoundingClientRect();
     animation?.cancel();
     if(!pane || !current || !layoutState.current.open || window.matchMedia('(prefers-reduced-motion: reduce)').matches){setExpanded(next);return;}
     const parent=pane.parentElement!;
     const origin=parent.getBoundingClientRect().left+parent.clientLeft;
     const parentStyle=getComputedStyle(parent);
     const fullWidth=parent.getBoundingClientRect().width-parseFloat(parentStyle.borderLeftWidth)-parseFloat(parentStyle.borderRightWidth);
     const probe=document.createElement('div');
     probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none;width:var(--browser-pane-width)';
     parent.appendChild(probe);
     const splitWidth=probe.getBoundingClientRect().width;
     probe.remove();
     const targetLeft=origin+(next?0:fullWidth-splitWidth)+1;
     const targetWidth=Math.round(origin+fullWidth)-Math.round(targetLeft);
     // Preparation runs alongside the animation, never before button feedback.
     const preparation=window.electronAPI?.beginBrowserResize?.(targetWidth).catch(e=>{setError(e instanceof Error?e.message:String(e));return false;});
     // Keep one absolute coordinate system in both directions. Suppress
     // intermediate React layouts so native Chrome never receives a jump.
     changingLayout.current=true;
     flushSync(()=>setExpanded(true));
     animation=pane.animate([
       {left:`${current.left-origin}px`},
       {left:`${next?0:fullWidth-splitWidth}px`}
     ],{duration:300,easing:'cubic-bezier(.4, 0, .2, 1)',fill:'forwards'});
     changingLayout.current=false;
     updateBounds.current?.();
     // ResizeObserver below follows the animated width before paint. A second
     // rAF loop can send the preceding layout as well as the current layout
     // in one frame, making native toolbar surfaces resize twice.
     animation.onfinish=()=>{
       changingLayout.current=true;
       flushSync(()=>setExpanded(next));
       animation?.cancel();
       animation=null;
       changingLayout.current=false;
       updateBounds.current?.();
       void Promise.resolve(preparation).then(()=>{
         if(currentRequest===request)return window.electronAPI?.finishBrowserResize?.();
       }).catch(e=>setError(e.message));
     };
   });
   return()=>{++request;unsubscribe?.();animation?.cancel();void window.electronAPI?.finishBrowserResize?.().catch(()=>{});};
 },[]);
 const pendingUrl=useRef<string|null>(null);
 const pendingHtml=useRef<{content:string;resolve:()=>void;reject:(error:Error)=>void}|null>(null);
 const [requestId,setRequestId]=useState(0);
 useEffect(()=>{const handle=(event:Event)=>{pendingUrl.current=(event as CustomEvent<string>).detail;setArtifact(null);setOpen(true);setRequestId(id=>id+1);};window.addEventListener('ohmyt-browser-open-url',handle);return()=>window.removeEventListener('ohmyt-browser-open-url',handle);},[]);
 useEffect(()=>{
   const handle=(event:Event)=>{const request=(event as CustomEvent).detail;if(pendingHtml.current)pendingHtml.current.reject(new Error('Một preview khác đang mở.'));pendingHtml.current=request;setArtifact(null);setError('');setOpen(true);setRequestId(id=>id+1);};
   window.addEventListener('ohmyt-browser-open-html',handle);
   return()=>{window.removeEventListener('ohmyt-browser-open-html',handle);pendingHtml.current?.reject(new Error('Trình duyệt đã đóng.'));};
 },[]);
 const ref=useRef<HTMLElement>(null);
 const paneRef=useRef<HTMLElement>(null);
 const layoutState=useRef({open,expanded});
 layoutState.current={open,expanded};
 const updateBounds=useRef<(()=>void)|null>(null);
 useEffect(()=>window.electronAPI?.onBrowserPaneClose(()=>setOpen(false)),[]);
 useEffect(()=>window.electronAPI?.onBrowserPaneOpen?.(chatId=>{
   if(chatId!==sessionId)return;
   setArtifact(null);setError('');setOpen(true);
 }),[sessionId]);
 useEffect(()=>{const toggle=()=>{setArtifact(null);setOpen(v=>!v);};window.addEventListener('ohmyt-browser-toggle',toggle);return()=>window.removeEventListener('ohmyt-browser-toggle',toggle);},[]);
 useLayoutEffect(()=>{
   if(artifact || !ref.current || !paneRef.current){void window.electronAPI?.setBrowserBounds(null,false);return;}
   let lastBounds='';
   const update=()=>{
     if(changingLayout.current)return;
     const r=ref.current!.getBoundingClientRect();
     const pane=paneRef.current!.getBoundingClientRect();
     const state=layoutState.current;
     // The surface keeps its final width as the flex pane slides. Move the
     // common native frame, never resize Chromium during the transition.
     const visible=state.open || (!state.expanded && pane.width>1);
     // An open pane is anchored to the right edge, including fractional CSS
     // widths. Round shared edges consistently across the animation handoff.
     // Closing slides a fixed viewport instead, so retain its fixed width.
     const bounds=visible && r.width && r.height && !document.querySelector('dialog[open], [aria-modal="true"]') ? browserBounds(r,state.open?undefined:Math.round(r.width)) : null;
     const key=JSON.stringify([bounds,state.open]);
     if(key===lastBounds)return;
     lastBounds=key;
     void window.electronAPI?.setBrowserBounds(bounds,state.open).catch(e=>setError(e.message));
   };
   updateBounds.current=update;
   const observer=new ResizeObserver(update);
   observer.observe(paneRef.current);observer.observe(ref.current);
   const modals=new MutationObserver(update);
   modals.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','aria-modal','class','data-expanded','data-open']});
   window.addEventListener('resize',update);update();
   return()=>{updateBounds.current=null;observer.disconnect();modals.disconnect();window.removeEventListener('resize',update);void window.electronAPI?.setBrowserBounds(null,false);};
 },[artifact]);
 useLayoutEffect(()=>{updateBounds.current?.();},[open,expanded]);
 useEffect(()=>{
   if(!open || artifact || !ref.current)return;
   if(pendingHtml.current){
     const request=pendingHtml.current;pendingHtml.current=null;
     const api=window.electronAPI;
     if(!api?.openHtmlPreview){request.reject(new Error('Khởi động lại app để mở preview trong trình duyệt.'));return;}
     void (async()=>{
       // Wait for usable layout before loading the preview.
       for(let attempt=0;attempt<30;attempt++){
         await new Promise<void>(resolve=>window.setTimeout(resolve,16));
         const r=ref.current?.getBoundingClientRect();
         if(!r)throw new Error('Khung trình duyệt đã đóng.');
         if(r.width<100 || r.height<=84)continue;
         await api.setBrowserBounds(browserBounds(r,Math.round(r.width)),true);
         await api.openHtmlPreview!(request.content,sessionId);
         return;
       }
       throw new Error('Khung trình duyệt chưa sẵn sàng. Hãy mở lại preview.');
     })().then(()=>request.resolve()).catch(e=>{setError(e.message);request.reject(e);});
     return;
   }
   if(!pendingUrl.current)return;
   const url=pendingUrl.current;pendingUrl.current=null;
   const r=ref.current.getBoundingClientRect();
   void window.electronAPI?.setBrowserBounds(browserBounds(r,Math.round(r.width)),true).then(()=>window.electronAPI?.openBrowserUrl(url)).catch(e=>setError(e.message));
 },[open,requestId,artifact,sessionId]);


 return <aside ref={paneRef} className="integrated-browser-pane" data-open={open} data-expanded={open && expanded} aria-hidden={!open} inert={!open}><ClientContributions slot="sidepanel.view" data={{sessionId,artifact,open,semanticSession}}/>{artifact?<ArtifactPane key={artifact.artifactId} artifactId={artifact.artifactId} sessionId={artifact.sessionId} onClose={()=>{setArtifact(null);setOpen(false);window.dispatchEvent(new Event('ohmyt-artifact-closed'));}}/>:<>{sessionId && <BrowserFiles key={sessionId} sessionId={sessionId} hiddenTrigger /> }{runs.map(run=><div key={run.runId} className="browser-run-controls" role="group" aria-label="Điều khiển tác vụ trình duyệt"><span>{run.authentication?'Đăng nhập thủ công · AI đang chờ':run.state==='paused'?'AI đang tạm dừng':'AI điều khiển trình duyệt'}</span><button disabled={run.state==='busy'||run.state==='stopped'} onClick={()=>void control(run.runId,run.state==='paused'?'resume':'pause')}>{run.state==='paused'?'Tiếp tục':'Tạm dừng'}</button>{run.state!=='paused'&&<button disabled={run.state!=='ready'} onClick={()=>void control(run.runId,'authentication')}>Tự đăng nhập</button>}</div>)}{error&&<p role="status">{error}</p>}<section ref={ref} className="integrated-browser-surface" aria-label="Nội dung trình duyệt"/></>}</aside>;
}
