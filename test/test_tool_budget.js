import assert from 'node:assert/strict';
import {AppDatabase} from '../server/db.js';
import {AgentLoop} from '../server/agent_loop.js';
const db=new AppDatabase(':memory:');
db.upsertAgent({id:'budget',name:'Test',avatar:'T',system_prompt:'Test',model_provider:'test',model_name:'test',temperature:.7});
for(const fails of [false,true,'recover']) {
 const id=`budget-${fails}`;db.createSession(id,'budget','Battery check');
 let calls=0,turns=0;
 const events=[];
 const tool={execute:async()=>{calls++;const failed=fails===true || (fails==='recover' && calls===1);return {success:!failed,stdout:failed?'':'Known result',exitCode:failed?1:0};}};
 const loop=new AgentLoop({db,tools:{forStandalone(){return this;},get:()=>null,getAllDefinitions:()=>[{name:'shell_exec'}],validateCall:tc=>({tool,arguments:{command:'test'}})},permissions:{evaluate:()=>({action:'ALLOW'})},skills:{},llm:{streamChat:async opts=>{
  turns++;
  if(opts.tools.length) opts.onToolCall({id:`call-${turns}`,name:'shell_exec',arguments:{command:'test'}});
  else {assert(opts.messages.at(-1).content.includes('Never invent'));opts.onChunk(fails===true?'Không đọc được mức pin vì môi trường không cung cấp thông tin pin.':'Kết quả đã xác minh.');}
  return {completed:true};
 }}});
 loop.on('event',e=>events.push(e));
 await loop.run({runId:id,sessionId:id,prompt:'Máy tui còn nhiêu pin'});
 assert.equal(calls,5);assert.equal(turns,6);
 assert.equal(db.getMessages(id).at(-1).content,fails===true?'Không đọc được mức pin vì môi trường không cung cấp thông tin pin.':'Kết quả đã xác minh.');
 if(fails==='recover') assert.equal(JSON.parse(db.getMessages(id).at(-1).metadata).activity.status,'warnings');
 assert(events.some(e=>e.type===(fails===true?'RunFailed':'RunCompleted')));
}
db.close();console.log('✓ Five tool rounds followed by a tool-free conclusion; failed checks never report success');
