import {useEffect,useState} from 'react';
import {api} from '../api.ts';
export function SubagentActivity({runId,live,en}:{runId:string;live:boolean;en:boolean}){
 const [opened,setOpened]=useState<string[]>([]);
 const [children,setChildren]=useState<{id:string;task:string;state:string}[]>([]),[results,setResults]=useState<Record<string,{sender:string;content:string}[]>>({}),[error,setError]=useState('');
 useEffect(()=>{setChildren([]);setResults({});setOpened([]);setError('');},[runId]);
 useEffect(()=>{let disposed=false;const refresh=()=>void api.getSubagents(runId).then(value=>{if(!disposed)setChildren(value.children);}).catch(()=>{});refresh();const timer=live?setInterval(refresh,1000):undefined;return()=>{disposed=true;clearInterval(timer);};},[runId,live]);
 useEffect(()=>{let disposed=false;for(const child of children)if(opened.includes(child.id))void api.getSubagentResult(runId,child.id).then(value=>{if(!disposed)setResults(prev=>({...prev,[child.id]:value.messages}));}).catch(e=>{if(!disposed)setError(e.message);});return()=>{disposed=true;};},[children,opened,runId]);
 if(!children.length)return null;
 return <section className="harness-subagents" aria-label={en?'Delegated tasks':'Công việc con'}>{children.map(child=><details key={child.id} onToggle={event=>{const isOpen=event.currentTarget.open;setOpened(previous=>isOpen?[...new Set([...previous,child.id])]:previous.filter(id=>id!==child.id));}}><summary><span>{child.task}</span><small>{['completed'].includes(child.state)?(en?'Completed':'Hoàn tất'):['failed','aborted','cancelled'].includes(child.state)?(en?'Stopped':'Đã dừng'):(en?'Running':'Đang chạy')}</small></summary>{results[child.id]?.filter(m=>m.sender==='agent').map((message,index)=><p key={index}>{message.content}</p>)}{!['completed','failed','aborted','cancelled'].includes(child.state)&&<button onClick={()=>void api.cancelSubagent(runId,child.id).catch(e=>setError(e.message))}>{en?'Stop child task':'Dừng công việc con'}</button>}</details>)}{error&&<p role="alert">{error}</p>}</section>;
}
