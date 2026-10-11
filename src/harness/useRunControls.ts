import {useCallback,useEffect,useRef,useState} from 'react';
import {api,type RunControls} from '../api.ts';
export function useRunControls(sessionId:string|null,onDiscovered?:(runId:string)=>void){
  const [data,setData]=useState<RunControls>({messages:[],activeRunId:null,state:'idle'}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const currentSession=useRef(sessionId);currentSession.current=sessionId;
  const discovered=useRef(onDiscovered);discovered.current=onDiscovered;const seen=useRef<string|null>(null);
  const refresh=useCallback(async()=>{if(!sessionId)return;const value=await api.getRunControls(sessionId);if(currentSession.current!==sessionId)return;setData(value);if(value.activeRunId){seen.current=value.activeRunId;discovered.current?.(value.activeRunId);}if(!value.activeRunId)seen.current=null;},[sessionId]);
  useEffect(()=>{let disposed=false;seen.current=null;setData({messages:[],activeRunId:null,state:'idle'});setError('');setBusy(false);if(!sessionId)return;const tick=async()=>{try{const value=await api.getRunControls(sessionId);if(disposed)return;setData(value);if(value.activeRunId){seen.current=value.activeRunId;discovered.current?.(value.activeRunId);}if(!value.activeRunId)seen.current=null;}catch{}};void tick();const interval=window.setInterval(tick,1000);return()=>{disposed=true;window.clearInterval(interval);};},[sessionId]);
  const action=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e){if(currentSession.current===sessionId)setError(e instanceof Error?e.message:String(e));throw e;}finally{if(currentSession.current===sessionId)setBusy(false);}};
  return {...data,error,busy,enqueue:(kind:'queued'|'steering',content:string)=>action(()=>api.enqueueMessage(sessionId!,kind,content)),setMode:(id:string,kind:'queued'|'steering')=>action(()=>api.setPendingMode(sessionId!,id,kind)),edit:(id:string,content:string)=>action(()=>api.editPendingMessage(sessionId!,id,content)),cancel:(id:string)=>action(()=>api.cancelPendingMessage(sessionId!,id)),control:(mode:'pause'|'resume')=>action(()=>api.controlRun(data.activeRunId!,mode))};
}
