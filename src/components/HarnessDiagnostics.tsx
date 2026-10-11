import {useEffect,useState} from 'react';
import {api} from '../api.ts';
export function HarnessDiagnostics({runId}:{runId:string}){
  const [data,setData]=useState<unknown>(null),[error,setError]=useState('');
  useEffect(()=>{let disposed=false;void api.getDiagnostics(runId).then(value=>{if(!disposed)setData(value);}).catch(e=>{if(!disposed)setError(e.message);});return()=>{disposed=true;};},[runId]);
  const exportData=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='run-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <details className="harness-diagnostics"><summary>{document.documentElement.lang==='en'?'Diagnostics':'Chẩn đoán'}</summary>{error?<p role="alert">{error}</p>:data?<><button onClick={exportData}>Export JSON</button><pre>{JSON.stringify(data,null,2)}</pre></>:<p>…</p>}</details>;
}
