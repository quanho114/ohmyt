import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {parseGoalCommand} from '../../shared/goal_command.js';

assert.deepEqual(parseGoalCommand(' Pause '),{kind:'pause'});
assert.deepEqual(parseGoalCommand('edit Mục tiêu mới'),{kind:'edit',objective:'Mục tiêu mới'});
assert.deepEqual(parseGoalCommand('edit'),{kind:'invalid-edit'});
assert.deepEqual(parseGoalCommand(''),{kind:'show'});
assert.deepEqual(parseGoalCommand('Prepare a report'),{kind:'create',objective:'Prepare a report'});
let hold=true,entered,requests=0;
let entering=new Promise(r=>entered=r);
const d=await harnessFixture({stream:async({messages,signal,tools,onToolCall,onChunk})=>{
 requests++;
 if(hold){entered();await new Promise(resolve=>signal.aborted?resolve():signal.addEventListener('abort',resolve,{once:true}));return {completed:true};}
 const context=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
 const goal=JSON.parse(context.content.split('\n')[1]);
 if(tools.length)onToolCall({id:'complete',name:'update_goal',arguments:{goal_id:goal.id,revision:goal.revision,action:'complete'}});
 else onChunk('Done and checked.');return {completed:true};
}});
try{
 d.db.createSession('goal','fixture','Human command fixture');
 const {port}=await d.start(),base=`http://127.0.0.1:${port}/api/sessions/goal/goal/command`;
 const send=async(input,revision=d.harness.goals.get('goal')?.revision || 0)=>{
  const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input,expectedRevision:revision})});
  return {status:response.status,...await response.json()};
 };
 assert.equal((await send('/goal')).goal,null);assert.equal(requests,0);
 let goal=d.harness.goals.create('goal',{objective:'Initial objective'});
 assert.equal((await send('/goal pause',0)).status,409);
 const edit=await send('/goal edit Revised objective');assert.equal(edit.goal.objective,'Revised objective');assert.equal(requests,0);
 assert.equal((await send('/goal edit')).status,400);
 assert.equal((await send('/goal resume')).status,200);await entering;
 assert.equal((await send('/goal pause')).status,200);await d.harness.goals.drain('goal');
 goal=d.harness.goals.get('goal');assert.equal(goal.phase,'paused');assert.equal(goal.objective,'Revised objective');assert.equal(requests,1);
 assert.equal((await send('/goal clear')).goal.phase,'cancelled');assert.equal(requests,1);
 hold=false;
 assert.equal((await send('/goal New requested outcome')).status,200);await d.harness.goals.drain('goal');
 assert.equal(d.harness.goals.get('goal').phase,'completed');
 const messagesUrl=`http://127.0.0.1:${port}/api/sessions/goal/messages`;
 assert(d.db.getMessages('goal').some(m=>m.content.startsWith('<goal_round>')),'Internal prompt remains in canonical storage');
 assert.equal((await (await fetch(messagesUrl)).json()).some(m=>m.content.startsWith('<goal_round>')),false);
 // Old rounds have no metadata; hide only when the runtime recorded a reservation.
 d.db.db.prepare("UPDATE messages SET metadata=NULL WHERE session_id='goal' AND content LIKE '<goal_round>%'").run();
 d.db.addMessage('literal-goal-tags','goal','user','<goal_round> quoted by the human');
 const visible=await (await fetch(messagesUrl)).json();
 assert.equal(visible.filter(m=>m.content.startsWith('<goal_round>')).length,1);
 assert.equal(visible.find(m=>m.content.startsWith('<goal_round>')).id,'literal-goal-tags');
 assert.equal(d.db.getMessages('goal').some(m=>/^\/goal (pause|resume|clear|edit)/.test(m.content)),false);
 assert.equal((await send('/goal')).goal.phase,'completed');
 console.log('PASS upstream Goal commands: grammar, HTTP CAS, show/edit without model requests, pause/resume/clear and explicit objective execution');
}finally{await d.closeFixture();}
