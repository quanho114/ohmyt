import assert from 'node:assert/strict';
import {AppDatabase} from '../server/db.js';
import {AgentLoop} from '../server/agent_loop.js';
const db = new AppDatabase(':memory:');
try {
 for (const repeated of [false, true]) {
  const id = `final-recovery-${repeated}`;
  db.createSession(id, 'default-assistant', 'Manual conversation');
  let requests = 0, executions = 0;
  const events = [];
  const loop = new AgentLoop({db,permissions:{evaluate:()=>({action:'ALLOW'})},skills:{},
   tools:{forStandalone(){return this;},getAllDefinitions:()=>[{name:'shell_exec'}],validateCall:call=>({arguments:call.arguments,tool:{execute:async()=>{executions++;return {success:true,stdout:'Known result'};}}})},
   llm:{streamChat:async options=>{
    requests++;
    if (requests <= 6 || repeated) options.onToolCall({id:`call-${requests}`,name:'shell_exec',arguments:{command:'test'}});
    else {
     assert.equal(options.tools.length,0);
     const result = options.messages.find(message=>message.tool_call_id==='call-6');
     assert(JSON.parse(result.content).error.includes('not executed'));
     options.onChunk('Đã xác minh kết quả trước đó; chưa xác minh được thông tin bổ sung.');
    }
    return {completed:true};
   }}});
  loop.on('event',event=>events.push(event));
  await loop.run({runId:id,sessionId:id,prompt:'Kiểm tra thông tin'});
  assert.equal(executions,5);
  assert.equal(requests,7);
  assert(events.some(event=>event.type===(repeated?'RunFailed':'RunCompleted')));
  const saved=db.getMessages(id).at(-1).content;
  if(repeated) assert(saved.includes('không thể kết luận'));
  else {
   let live='';for(const event of events){if(event.type==='TextReset')live='';if(event.type==='TextDelta')live+=event.payload.delta;}
   assert.equal(live,saved);
  }
 }
 console.log('PASS final tool recovery: paired rejection, no extra execution, bounded retry and live text');
} finally {db.close();}
