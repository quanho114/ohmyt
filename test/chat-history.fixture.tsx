import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TraceRow} from '../src/components/ui/Trace.tsx';
import {ChatHistoryRail} from '../src/components/ChatHistoryRail.tsx';
import {useChatFollow} from '../src/chatMotion.ts';
import '../src/index.css';
const messages=Array.from({length:120},(_,i)=>({id:`m${i}`,session_id:'a',sender:'user' as const,content:`Question ${i+1}`,created_at:i}));
function Fixture(){
 const [session,setSession]=useState('a'),[growth,grow]=useState(0);
 const [newTurn,setNewTurn]=useState(false);
 const items=messages.flatMap(m=>[{...m,session_id:session},{...m,id:`reply-${m.id}`,session_id:session,sender:'agent' as const,content:`Reply to ${m.content}`}]);
 if(newTurn)items.push({id:'new-turn',session_id:session,sender:'user',content:'New question',created_at:999});
 const follow=useChatFollow(session,items,true,false,false);
 return <><button onClick={()=>setNewTurn(true)}>New turn</button><button onClick={()=>grow(n=>n+500)}>Stream</button><button onClick={()=>setSession(s=>s==='a'?'b':'a')}>Switch</button><div style={{height:600,width:760,position:'relative',display:'flex',flexDirection:'column'}}><div ref={follow.scrollRef} className="chat-scroller" style={{overflow:'auto',flex:1}}><div ref={follow.feedRef}>{items.map(m=><div key={m.id} data-chat-turn={m.sender==='user'?m.id:undefined} tabIndex={-1} style={{height:200,paddingLeft:45}}>{m.content}</div>)}<TraceRow title="Inspect trace" icon={null}><div style={{height:240}}>Trace output</div></TraceRow><div style={{height:300+growth}}/></div></div><ChatHistoryRail key={session} messages={items} scrollRef={follow.scrollRef} feedRef={follow.feedRef} onJump={follow.jumpToMessage} en={true}/><button onClick={follow.jumpToBottom}>Latest</button><output>{String(follow.following)}</output></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
