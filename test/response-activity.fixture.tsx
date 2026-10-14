import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResponseActivity} from '../src/components/ResponseActivity.tsx';
import {ChatMessage} from '../src/components/ChatMessage.tsx';
import {defaultAppearance} from '../src/appearance.ts';
import '../src/index.css';

function Fixture(){
 const [streaming,setStreaming]=useState(true);
 const [answerComplete,setAnswerComplete]=useState(false);
 const [phase,setPhase]=useState<'reasoning'|'tools'|'answer'>('reasoning');
 return <main>
  <button onClick={()=>{setStreaming(true);setAnswerComplete(false);setPhase('reasoning');}}>Start</button>
  <button onClick={()=>setPhase('tools')}>Tool</button>
  <button onClick={()=>setPhase('answer')}>Answer</button>
  <button onClick={()=>setAnswerComplete(true)}>Answer done</button>
  <button onClick={()=>setStreaming(false)}>Finish</button>
  <ResponseActivity tools={phase==='reasoning'?[]:[{id:'read',name:'fs_read',input:{path:'README.md'},output:{content:'File contents'},status:phase==='tools'?'running':'completed'}]}
   reasoning="Checking the project files." hasContent={phase==='answer'} locale="vi" autoExpandTools={false}
   animated={true} isStreaming={streaming} phase={phase} status={streaming?undefined:'completed'}/>
  {phase==='answer'&&<ChatMessage message={{id:'cursor-fixture',session_id:'fixture',sender:'agent',content:'Câu trả lời đã đủ.',created_at:0}}
   isStreaming={streaming} answerComplete={answerComplete} appearance={{...defaultAppearance,responseAnimation:'off'}} activeTheme="light"/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
