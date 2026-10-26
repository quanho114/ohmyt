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
 const [minimal,setMinimal]=useState(false);
 const [timeline,setTimeline]=useState(false);
 const [content,setContent]=useState('Mình sẽ chỉnh chuyển động và ánh sáng cho tự nhiên hơn.');
 const [startedAt,setStartedAt]=useState(Date.now());
 const [phase,setPhase]=useState<'waiting'|'reasoning'|'tools'|'answer'|'approval'|'summary'|`preparing:${string}`>('reasoning');
 const previewTool = {id:'preview',name:'html_preview',input:{name:'bo-nong-dan.html',content:'<!doctype html>'+'<div>sea</div>'.repeat(1000)},status:'running' as const};
 return <main>
  <button onClick={()=>{setTimeline(true);setPhase('reasoning');setStreaming(true);}}>Timeline</button>
  <button onClick={()=>{setMinimal(true);setStreaming(true);setAnswerComplete(false);setStartedAt(Date.now());setPhase('waiting');}}>Silent model</button>
  <button onClick={()=>setPhase('answer')}>Commentary</button>
  <button onClick={()=>setContent(value=>value+' Đang cập nhật cảnh biển.')}>More text</button>
  <button onClick={()=>setPhase('approval')}>Approval</button>
  <button onClick={()=>setPhase('tools')}>HTML tool</button>
  <button onClick={()=>{setSources(false);setStreaming(true);setUncertain(false);setAnswerComplete(false);setPhase('reasoning');}}>Start</button>
  <button onClick={()=>{setSources(false);setUncertain(true);setStreaming(false);setPhase('tools');}}>Unknown result</button>
  <button onClick={()=>{setSources(true);setPhase('tools');}}>Sources</button>
  <button onClick={()=>setChildEnglish(true)}>English child</button>
  <button onClick={()=>setPhase('tools')}>Tool</button>
  <button onClick={()=>setPhase('summary')}>Summary</button>
  <button onClick={()=>setPhase('preparing:html_preview:12000')}>Preparing</button>
  <button onClick={()=>setPhase('answer')}>Answer</button>
  <button onClick={()=>setAnswerComplete(true)}>Answer done</button>
  <button onClick={()=>setStreaming(false)}>Finish</button>
  {!minimal&&<ResponseActivity tools={timeline?[{id:'timeline-read',name:'fs_read',input:{path:'README.md'},status:'completed',reasoningOffset:'**Read files**\nDetails.\n'.length}]:sources?[{id:'search',name:'web_search',input:{query:'trace'},status:'completed',output:{results:[{url:'https://example.com/docs',title:'Documentation'},{url:'https://example.com/docs',title:'Documentation'},{url:'javascript:alert(1)',title:'Unsafe source'}]}}]:phase==='reasoning'?[]:[{id:'read',name:uncertain?'fs_write':'fs_read',input:{path:'README.md'},output:uncertain?{code:'TOOL_OUTCOME_UNKNOWN'}:{content:'File contents'},status:uncertain?'unknown':phase==='tools'?'running':'completed'}]}
   outcome={uncertain?{version:1,protocolStatus:'failed',taskStatus:'unknown',verificationStatus:'unverified',evidenceRefs:[],unresolvedCallIds:['read'],stopReason:null}:undefined}
   progress={timeline?['Inspect project files','Prepare the output']:[]} reasoning={timeline?'**Read files**\nDetails.\n**Check output**\nMore details.':'Checking the project files.'} hasContent={phase==='answer'} locale="vi" autoExpandTools={false}
   animated={true} isStreaming={streaming} phase={phase} status={streaming?undefined:'completed'}/>}
  {uncertain&&<SubagentActivity runId="fixture-parent" live={false} en={childEnglish}/>}
  {(phase==='answer'||minimal)&&<div style={{maxWidth:760,margin:'60px auto',padding:24}}><ChatMessage message={{id:'cursor-fixture',session_id:'fixture',sender:'agent',content:minimal?(phase==='waiting'?'':content):'Câu trả lời đã đủ.',created_at:0}}
   tools={minimal&&phase==='tools'?[previewTool]:[]}
   activity={minimal?{phase,startedAt,reasoning:'',tools:phase==='tools'?[previewTool]:[]}:undefined}
   isStreaming={streaming} answerComplete={answerComplete} appearance={{...defaultAppearance,locale:'vi',autoExpandTools:false,responseAnimation:'off'}} activeTheme="light"/></div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
