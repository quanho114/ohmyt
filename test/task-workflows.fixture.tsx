import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HomeView} from '../src/components/HomeView.tsx';
import {Composer} from '../src/components/Composer.tsx';
import {UserInputCard} from '../src/components/UserInputCard.tsx';
import {useUserInput} from '../src/harness/useUserInput.ts';
import {api} from '../src/api.ts';
import {RuntimeCompatibilityNotice} from '../src/components/RuntimeCompatibilityNotice.tsx';
import type {UserInputRequest} from '../src/api.ts';
import '../src/index.css';
let pending:UserInputRequest[]=[];
let legacy=false,pollCount=0,runCount=0,restarts=0;
const sent:{prompt:string;options:unknown}[]=[],answers:unknown[]=[],continuations:unknown[]=[];
(window as any).taskWorkflows={sent,answers,continuations,ask:(item:UserInputRequest)=>{pending=[item];},setLegacy:(value:boolean)=>{legacy=value;pollCount=0;},counts:()=>({pollCount,runCount,restarts}),tryRun:async()=>{try{await api.startRun('guided','Tìm hiểu dự án',undefined,undefined,'project-overview');return null;}catch(e){return (e as Error).message;}}};
(window as any).electronAPI={selectProjectDirectory:async()=>'/chosen/folder',restart:()=>{restarts++;}};
window.fetch=async(input,init)=>{
  const url=String(input),body=JSON.parse(String(init?.body||'{}'));let result:unknown={};
  if(url.endsWith('/harness'))result=legacy?{plugins:[]}:{userInputVersion:1};
  else if(url.endsWith('/runs')){runCount++;result={runId:'run'};}
  else if(url.endsWith('/projects'))result=init?.method==='POST'?{id:'folder-project',name:'Folder project',path:body.path}:[{id:'project-a',name:'Project A',path:'/workspace/a'}];
  else if(url.endsWith('/user-input')){pollCount++;if(legacy)return new Response(JSON.stringify({error:'Endpoint not found: GET '+url}),{status:404,headers:{'Content-Type':'application/json'}});result={requests:pending};}
  else if(url.includes('/user-input/')){answers.push(body);pending=[];result=body.projectId?{ok:true,continuation:{projectId:body.projectId,prompt:sent.at(-1)?.prompt,workflowId:(sent.at(-1)?.options as any)?.workflowId}}:{ok:true};}
  else if(url.endsWith('/goal'))result={goal:null};
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
function Chat(){
  const input=useUserInput('guided',data=>{continuations.push(data);});
  return <main style={{maxWidth:760,margin:'24px auto'}}><h1>Khung chat</h1>
    {input.error&&<RuntimeCompatibilityNotice message={input.error}/>}
    {input.requests.map(item=><UserInputCard key={item.id} request={item} busy={input.busy} onRespond={input.respond} onCancel={()=>{pending=[];}}/>)}
    <Composer sessionId="guided" providers={[]} selectedModel={null} onSelectModel={()=>{}} isStreaming waitingForInput={input.requests.length>0} onBusySend={(_,text)=>input.sendText(text)} onSend={()=>{}}/>
  </main>;
}
function Fixture(){
  const [chat,setChat]=useState(false);
  return <><button onClick={()=>{pending=[];setChat(false);}}>Trang chủ</button>{chat?<Chat/>:<HomeView approvalMode="full" onChangeApprovalMode={async()=>{}} mascot="fluffy" sessions={[]} providers={[]} selectedModel={null} onSelectModel={()=>{}} onSubmit={async(prompt,images,options)=>{await api.requireUserInputRuntime();sent.push({prompt,options});setChat(true);}} onSelectSession={()=>{}} onOpenProviders={()=>{}}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
