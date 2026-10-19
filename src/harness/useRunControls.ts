import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {api,type RunControls} from '../api.ts';
const idle:RunControls={messages:[],activeRunId:null,state:'idle'};
export function useRunControls(sessionId:string|null,onDiscovered?:(runId:string)=>void,onIdle?:()=>void){
  const [data,setData]=useState<RunControls>(idle),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  // Identity changes even when returning to a previously visited chat.
  const visit=useMemo(()=>({sessionId,revision:0,polling:false,mutations:0,activeRunId:null as string|null}),[sessionId]);
  const current=useRef(visit);current.current=visit;
  const discovered=useRef(onDiscovered);discovered.current=onDiscovered;
  const idleCallback=useRef(onIdle);idleCallback.current=onIdle;
  const refresh=useCallback(async(poll=false)=>{
    if(!sessionId||current.current!==visit||(poll&&(visit.polling||visit.mutations)))return;
    if(poll)visit.polling=true;
    const revision=++visit.revision;
    try{
      const value=await api.getRunControls(sessionId);
      if(current.current!==visit||revision!==visit.revision)return;
      const wasActive=visit.activeRunId;visit.activeRunId=value.activeRunId;
      setData(value);
      if(value.activeRunId&&!['stopping','settling'].includes(value.state))discovered.current?.(value.activeRunId);
      if(wasActive&&!value.activeRunId)idleCallback.current?.();
    }finally{if(poll)visit.polling=false;}
  },[sessionId,visit]);
  useEffect(()=>{
    setData(idle);setError('');setBusy(false);
    const tick=()=>{void refresh(true).catch(()=>{});};
    tick();const interval=window.setInterval(tick,1000);
    return()=>{visit.revision++;window.clearInterval(interval);};
  },[refresh,visit]);
  const action=async(fn:()=>Promise<unknown>)=>{
    if(!sessionId||current.current!==visit)throw new Error('Chat is no longer active');
    visit.revision++;visit.mutations++;setBusy(true);setError('');
    try{await fn();await refresh();}
    catch(e){if(current.current===visit)setError(e instanceof Error?e.message:String(e));throw e;}
    finally{visit.mutations--;if(current.current===visit)setBusy(visit.mutations>0);}
  };
  return {...data,error,busy,enqueue:(kind:'queued'|'steering',content:string)=>action(()=>api.enqueueMessage(sessionId!,kind,content)),setMode:(id:string,kind:'queued'|'steering')=>action(()=>api.setPendingMode(sessionId!,id,kind)),edit:(id:string,content:string)=>action(()=>api.editPendingMessage(sessionId!,id,content)),cancel:(id:string)=>action(()=>api.cancelPendingMessage(sessionId!,id)),control:(mode:'pause'|'resume')=>action(()=>api.controlRun(data.activeRunId!,mode))};
}
