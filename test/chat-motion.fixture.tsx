import React, { Profiler, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatStage } from '../src/components/ChatStage.tsx';
import { defaultAppearance, applyAppearance } from '../src/appearance.ts';
import type { Message } from '../src/types.ts';
import type {ToolCallItem} from '../src/types.ts';
import '../src/index.css';

// Isolated renderer fixture: no provider calls, user database or OS tools.
window.fetch = async () => new Response(JSON.stringify({messages:[],activeRunId:null,state:'idle',connected:false,tabs:[],goal:null}), {headers:{'Content-Type':'application/json'}});
const commits: number[] = [];
const appearance = {...defaultAppearance, transition:'smooth' as const};
applyAppearance(appearance, document.documentElement, false);
document.body.style.margin = '0';
const histories = Array.from({length:5}, (_, session) => Array.from({length:500}, (_, i):Message => ({
  id:`${session}-${i}`, session_id:String(session), sender:i%2?'agent':'user', created_at:1,
  content:i%10===1?'A code example:\n```js\nconst answer = 42;\n```\nFollowed by explanatory prose.':'Historical message with enough text to exercise the transcript layout and rendering.'
})));
function Fixture() {
  const [session, setSession] = useState(0);
  const [content, setContent] = useState('');
  const [live, setLive] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [tools,setTools] = useState<ToolCallItem[]>([]);
  const [reasoning,setReasoning] = useState('');
  const [autoScroll,setAutoScroll] = useState(true);
  const [animated,setAnimated] = useState(true);
  const settings = useMemo(()=>({...appearance,autoScroll,transition:animated?'smooth' as const:'none' as const}),[autoScroll,animated]);
  (window as any).fixture = {
    commits, setContent:(text:string)=>flushSync(()=>setContent(text)),
    live:(value:boolean)=>flushSync(()=>setLive(value)),
    session:(value:number)=>flushSync(()=>{setSession(value);setContent('');setLive(false);}),
    empty:(value:boolean)=>flushSync(()=>setEmpty(value)),
    tools:(value:ToolCallItem[])=>flushSync(()=>setTools(value)),
    reasoning:(value:string)=>flushSync(()=>setReasoning(value)),
    autoScroll:(value:boolean)=>flushSync(()=>setAutoScroll(value)),
    animated:(value:boolean)=>flushSync(()=>setAnimated(value))
  };
  return <div style={{height:'100vh',display:'flex'}}><Profiler id="chat" onRender={(_,__,duration)=>commits.push(duration)}><ChatStage
    session={{id:String(session),agent_id:'test',title:'Motion fixture',created_at:1,updated_at:1}}
    sessions={[]} messages={empty?[]:histories[session]} isStreaming={live} streamingContent={content}
    activeTools={tools} streamingReasoning={reasoning} status={null} agentStatus={live?'running':'idle'} activeTheme="light" appearance={settings}
    providers={[]} selectedModel={null} onSelectModel={()=>{}} approvalMode="ask" approvalModeSaving={false}
    onChangeApprovalMode={async()=>{}} onToggleTheme={()=>{}} onSendMessage={()=>{setEmpty(false);return true;}}
    onAbortRun={()=>setLive(false)} onRefreshMessages={()=>{}}
  /></Profiler></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
