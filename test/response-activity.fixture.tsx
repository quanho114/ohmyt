import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResponseActivity} from '../src/components/ResponseActivity.tsx';
import {ChatMessage} from '../src/components/ChatMessage.tsx';
import {defaultAppearance} from '../src/appearance.ts';
import {SubagentActivity} from '../src/components/SubagentActivity.tsx';
import {api} from '../src/api.ts';
import type {TaskOutcome} from '../src/types.ts';
import '../src/index.css';
const childOutcomes:TaskOutcome['taskStatus'][]=['partial','blocked','unknown','failed','completed'];
api.getSubagents=async()=>({children:childOutcomes.map(taskStatus=>({id:taskStatus,task:`Child ${taskStatus}`,state:'completed',outcome:{version:1,protocolStatus:'completed',taskStatus,verificationStatus:'unverified',evidenceRefs:[],unresolvedCallIds:[],stopReason:null}}))});
api.getSubagentResult=async()=>({messages:[]});

function Fixture(){
 const [streaming,setStreaming]=useState(true);
 const [answerComplete,setAnswerComplete]=useState(false);
 const [uncertain,setUncertain]=useState(false);
 const [sources,setSources]=useState(false);
 const [childEnglish,setChildEnglish]=useState(false);
 const [phase,setPhase]=useState<'reasoning'|'tools'|'answer'>('reasoning');
 return <main>
  <button onClick={()=>{setSources(false);setStreaming(true);setUncertain(false);setAnswerComplete(false);setPhase('reasoning');}}>Start</button>
  <button onClick={()=>{setSources(false);setUncertain(true);setStreaming(false);setPhase('tools');}}>Unknown result</button>
  <button onClick={()=>{setSources(true);setPhase('tools');}}>Sources</button>
  <button onClick={()=>setChildEnglish(true)}>English child</button>
  <button onClick={()=>setPhase('tools')}>Tool</button>
  <button onClick={()=>setPhase('answer')}>Answer</button>
  <button onClick={()=>setAnswerComplete(true)}>Answer done</button>
  <button onClick={()=>setStreaming(false)}>Finish</button>
  <ResponseActivity tools={sources?[{id:'search',name:'web_search',input:{query:'trace'},status:'completed',output:{results:[{url:'https://example.com/docs',title:'Documentation'},{url:'https://example.com/docs',title:'Documentation'},{url:'javascript:alert(1)',title:'Unsafe source'}]}}]:phase==='reasoning'?[]:[{id:'read',name:uncertain?'fs_write':'fs_read',input:{path:'README.md'},output:uncertain?{code:'TOOL_OUTCOME_UNKNOWN'}:{content:'File contents'},status:uncertain?'unknown':phase==='tools'?'running':'completed'}]}
   outcome={uncertain?{version:1,protocolStatus:'failed',taskStatus:'unknown',verificationStatus:'unverified',evidenceRefs:[],unresolvedCallIds:['read'],stopReason:null}:undefined}
   reasoning="Checking the project files." hasContent={phase==='answer'} locale="vi" autoExpandTools={false}
   animated={true} isStreaming={streaming} phase={phase} status={streaming?undefined:'completed'}/>
  {uncertain&&<SubagentActivity runId="fixture-parent" live={false} en={childEnglish}/>}
  {phase==='answer'&&<ChatMessage message={{id:'cursor-fixture',session_id:'fixture',sender:'agent',content:'Câu trả lời đã đủ.',created_at:0}}
   isStreaming={streaming} answerComplete={answerComplete} appearance={{...defaultAppearance,responseAnimation:'off'}} activeTheme="light"/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
