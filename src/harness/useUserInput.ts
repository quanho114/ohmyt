import {useEffect,useMemo,useRef,useState} from 'react';
import {api,type UserInputRequest,type ProjectContinuation} from '../api.ts';
import {RuntimeOutdatedError} from '../runtimeCompatibility.ts';

export function useUserInput(sessionId:string|null,onContinueProject:(data:ProjectContinuation)=>void|boolean|Promise<void|boolean>){
  const [requests,setRequests]=useState<UserInputRequest[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [pollError,setPollError]=useState('');
  const [updateRequired,setUpdateRequired]=useState(false);
  const visit=useMemo(()=>({version:0,responding:false}),[sessionId]);
  const current=useRef(visit);current.current=visit;
  const continuation=useRef(onContinueProject);continuation.current=onContinueProject;
  useEffect(()=>{
    let disposed=false,running=false,unavailable=false;setRequests([]);setError('');setPollError('');setBusy(false);setUpdateRequired(false);
    if(!sessionId)return;
    const refresh=async()=>{if(running||unavailable)return;running=true;const revision=visit.version;try{const data=await api.getUserInputs(sessionId);if(!disposed&&revision===visit.version){setRequests(data.requests);setPollError('');}}catch(e){if(!disposed&&revision===visit.version){setPollError(e instanceof Error?e.message:String(e));if(e instanceof RuntimeOutdatedError){unavailable=true;setUpdateRequired(true);setRequests([]);}}}finally{running=false;}};
    void refresh();const timer=window.setInterval(refresh,800);return()=>{disposed=true;window.clearInterval(timer);};
  },[sessionId,visit]);
  const respond=async(item:UserInputRequest,answer:Parameters<typeof api.answerUserInput>[1])=>{
    if(current.current!==visit||visit.responding)return false;visit.responding=true;setBusy(true);setError('');
    try{
      const result=await api.answerUserInput(item,answer);
      visit.version++;
      if(current.current!==visit)return false;
      setPollError('');
      if(result.continuation)await continuation.current(result.continuation);
      if(current.current!==visit)return false;
      setRequests(items=>items.filter(request=>request.id!==item.id));return true;
    }catch(e){if(current.current===visit)setError(e instanceof Error?e.message:String(e));return false;}
    finally{visit.responding=false;if(current.current===visit)setBusy(false);}
  };
  return {requests,error:error||pollError,busy,updateRequired,respond,sendText:(text:string)=>requests.length===1&&requests[0].kind==='questions'?respond(requests[0],{text}):Promise.resolve(false)};
}
