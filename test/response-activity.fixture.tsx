import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResponseActivity} from '../src/components/ResponseActivity.tsx';
import '../src/index.css';

function Fixture(){
 const [streaming,setStreaming]=useState(true);
 const [phase,setPhase]=useState<'reasoning'|'tools'|'answer'>('reasoning');
 return <main>
  <button onClick={()=>{setStreaming(true);setPhase('reasoning');}}>Start</button>
  <button onClick={()=>setPhase('tools')}>Tool</button>
  <button onClick={()=>setPhase('answer')}>Answer</button>
  <button onClick={()=>setStreaming(false)}>Finish</button>
  <ResponseActivity tools={phase==='reasoning'?[]:[{id:'read',name:'fs_read',input:{path:'README.md'},output:{content:'File contents'},status:phase==='tools'?'running':'completed'}]}
   reasoning="Checking the project files." hasContent={phase==='answer'} locale="vi" autoExpandTools={false}
   animated={false} isStreaming={streaming} phase={phase} status={streaming?undefined:'completed'}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
