import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {Goals} from '../../server/harness/goals.js';
import {proposeGoalTransition} from '../../server/harness/goal_lifecycle.js';
import {foldGoal} from '../../server/vendor/deepseek-goal/fold.js';

// The actual upstream service and strict fold reject invalid transitions.
const created=proposeGoalTransition(null,'create',{objective:' Check result ',maxGoalRounds:3});
assert.equal(created.view.objective,'Check result');
const folded=foldGoal([{seq:0,type:'goal/change',data:created.change}]);
assert.equal(folded.goal.id,created.view.id);
assert.equal(folded.roundsStarted,0);
assert.throws(()=>foldGoal([{seq:0,type:'goal/change',data:{...created.change,roundsStarted:1}}]),/zero rounds/);
const snapshot={...created.view,phase:'active',limits:{rounds:3},roundsStarted:1};
assert.equal(proposeGoalTransition(snapshot,'pause').view.phase,'paused');
assert.equal(proposeGoalTransition({...snapshot,createdAt:0,updatedAt:1},'pause').view.createdAt,0);
assert.throws(()=>proposeGoalTransition(snapshot,'resume',{},'armed'),/already active/);
assert.throws(()=>proposeGoalTransition(snapshot,'edit',{maxGoalRounds:0}),/positive safe integer/);
assert.throws(()=>proposeGoalTransition(snapshot,'edit',{maxGoalRounds:0.5}),/positive safe integer/);

const pinned=messages=>{
 const message=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
 return message?JSON.parse(message.content.split('\n')[1]):null;
};
const called=(messages,id)=>messages.some(m=>m.role==='tool'&&m.tool_call_id===id);
for(const mode of ['corrected_args','await_input','complete_fence','unfinished_review']){
 let effects=0,closing=0;
 const d=await harnessFixture({config:{maxSteps:8},tools:[{name:'fixture_effect',parameters:{type:'object',properties:{},additionalProperties:false},execute:()=>{effects++;return {written:true};}}],
  stream:async({messages,tools,onToolCall,onChunk})=>{
   const goal=pinned(messages);assert(goal);
   if(tools.length===0){
    const endingContext=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
    assert.match(endingContext.content,/Execution has ended for this turn/);
    assert.doesNotMatch(endingContext.content,/Use goal_progress|Read get_goal before update_goal/);
    closing++;assert(messages.some(m=>typeof m.content==='string'&&/^<goal_(complete|waiting|review)>/.test(m.content)));
    onChunk(mode==='await_input'?'Which dataset should I use?':'Inspected the observed result.');return {completed:true};
   }
   if(mode==='corrected_args'){
     if(!called(messages,'bad'))onToolCall({id:'bad',name:'get_goal',arguments:{bogus:'Read current state'}});
     else if(!called(messages,'fixed'))onToolCall({id:'fixed',name:'get_goal',arguments:{reason:'Read current state'}});
    else onToolCall({id:'finish',name:'goal_progress',arguments:{expectedRevision:goal.revision,steps:[{text:'Inspect result',status:'done'}],finish:true}});
   }else if(!goal.steps.length){
    onToolCall({id:'plan',name:'goal_progress',arguments:{expectedRevision:goal.revision,steps:[{text:'Inspect dataset',status:mode==='complete_fence'?'done':'in_progress'}]}});
   }else if(mode==='unfinished_review'){
    onToolCall({id:'review',name:'goal_progress',arguments:{expectedRevision:goal.revision,finish:true}});
   }else{
    onToolCall({id:'terminal',name:'update_goal',arguments:{goal_id:goal.id,revision:goal.revision,action:mode==='await_input'?'await_input':'complete',...(mode==='await_input'?{blocked_reason:'Which dataset should I use?'}:{})}});
    // A model can emit a sibling mutation despite its terminal control call.
    onToolCall({id:'late-effect',name:'fixture_effect',arguments:{}});
   }
   return {completed:true};
  }});
 try{
  d.db.createSession('goal','fixture','Upstream integration');
  await d.agentLoop.run({runId:`human-${mode}`,sessionId:'goal',prompt:'/goal Inspect the requested dataset'});
  await d.harness.goals.drain('goal');
  const goal=d.harness.goals.get('goal');
  assert.equal(goal.phase,mode==='await_input'?'paused':mode==='unfinished_review'?'review_required':'completed');
  assert.equal(closing,1);assert.equal(effects,0);
  assert.equal(goal.runtime.running,false);assert.equal(goal.runtime.activation,'disarmed');
  const outcome=d.harness.sessions.outcome(goal.currentRound.runId);
  assert.deepEqual(outcome.unresolvedCallIds,[]);assert.notEqual(outcome.verificationStatus,'verified');
  if(mode==='await_input'){assert.equal(goal.waitingForInput,true);assert.equal(goal.steps[0].status,'in_progress');}
  if(mode==='complete_fence'){
   const receipt=d.harness.sessions.log.readAll('goal').find(e=>e.type==='tool/result'&&e.payload.callId==='late-effect'&&e.payload.executionReceipt);
   assert.equal(receipt.payload.executionReceipt.bodyStarted,false);
   assert.equal(JSON.parse(receipt.payload.modelContent).code,'GOAL_TURN_CLOSED');
  }
  const cold=new Goals(d.harness);assert.equal(cold.get('goal').runtime.activation,'disarmed');
  assert.throws(()=>d.harness.goals.modelRead('fabricated-run'),/live top-level/);
 }finally{await d.closeFixture();}
}
console.log('PASS upstream Goal integration: real lifecycle/fold, corrected error, waiting-input stop, terminal same-batch tool fence, incomplete-plan review, cold disarm and runtime state');
