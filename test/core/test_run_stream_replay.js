import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const daemon=await harnessFixture({stream:async()=>({completed:true})});
const controllers=[];
try{
 daemon.db.createSession('stream-session','fixture','Stream replay');daemon.db.createRun('stream-run','stream-session');
 daemon.agentLoop.emitEvent('stream-run','TextDelta',{delta:'one'});daemon.agentLoop.emitEvent('stream-run','TextDelta',{delta:'two'});
 const {port}=await daemon.start(),url=`http://127.0.0.1:${port}/api/runs/stream-run/stream`;
 const subscribe=async cursor=>{
  const controller=new AbortController();controllers.push(controller);
  const response=await fetch(url,{signal:controller.signal,headers:cursor?{'Last-Event-ID':cursor}:{}});
  if(!response.ok)return {response};
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  return {response,controller,next:async()=>{
   while(!buffer.includes('\n\n')){const part=await reader.read();assert.equal(part.done,false);buffer+=decoder.decode(part.value,{stream:true});}
   const end=buffer.indexOf('\n\n'),frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
   const lines=frame.split('\n');return {id:lines.find(line=>line.startsWith('id: '))?.slice(4),event:JSON.parse(lines.find(line=>line.startsWith('data: ')).slice(6))};
  }};
 };
 const first=await subscribe();const one=await first.next(),two=await first.next();
 assert.equal(one.id,'e_stream-run_1');assert.equal(two.id,'e_stream-run_2');first.controller.abort();
 daemon.agentLoop.emitEvent('stream-run','TextDelta',{delta:'three'});
 const resumed=await subscribe(two.id);const three=await resumed.next();assert.equal(three.event.payload.delta,'three','Reconnect replays only events after the cursor');
 daemon.agentLoop.emitEvent('stream-run','RunCompleted',{runId:'stream-run'});
 assert.equal((await resumed.next()).id,'e_stream-run_4','Live events carry resumable IDs');resumed.controller.abort();
 for(const cursor of ['e_other_1','e_stream-run_-1','e_stream-run_foo','e_stream-run_9007199254740992']){
  const invalid=await subscribe(cursor);assert.equal(invalid.response.status,400);await invalid.response.json();
 }
 console.log('PASS run SSE replay: stable IDs, scoped cursor, missing-event replay and live continuation');
}finally{controllers.forEach(controller=>controller.abort());await daemon.closeFixture();}
