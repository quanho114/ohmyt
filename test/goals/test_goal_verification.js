import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harnessFixture, stringSchema} from '../harness_fixture.js';

const goalData=messages=>{const pinned=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));return pinned?JSON.parse(pinned.content.split('\n')[1]):null;};
const hasResult=(messages,callId)=>messages.some(m=>m.role==='tool'&&m.tool_call_id===callId);
const fixture=async stream=>{const d=await harnessFixture({stream,tools:[{name:'fixture_tool',parameters:stringSchema,execute:async({value})=>({ok:true,value})}]});d.db.createSession('goal','fixture','Goal verification test');return d;};
const startGoal=(goals,config={})=>{const created=goals.create('goal',{objective:'Deliver proof',...config});goals.control('goal',{action:'start',expectedRevision:created.revision,autoContinue:true});};
// Produce evidence first, then finish the plan (optionally through a completion call).
const evidenceFlow=(finishTool,evidence)=>async({messages,onToolCall,onChunk})=>{
  const goal=goalData(messages);
  if(!hasResult(messages,'ev'))onToolCall({id:'ev',name:'fixture_tool',arguments:{value:'proof'}});
  else if(goal&&!hasResult(messages,'completion'))onToolCall({id:'completion',name:finishTool,arguments:finishTool==='goal_progress'
    ?{expectedRevision:goal.revision,steps:[{text:'Produce the evidence',status:'done',...(evidence?{evidence}:{})}],finish:true}
    :{goal_id:goal.id,revision:goal.revision,action:'complete'}});
  else onChunk('The work is concluded.');
  return {completed:true};
};

// Real receipts establish execution, but do not independently prove the goal.
{
 const d=await fixture(evidenceFlow('goal_progress',['ev']));
 try{
  const goals=d.harness.goals;
  startGoal(goals,{objective:'Deliver proof MARKER-VERIFY-1',steps:[{text:'Produce the evidence'}]});
  await goals.drain('goal');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'review_required');
  assert.equal(goal.reason,'unverified');
  assert.deepEqual(goal.evidenceRefs,[]);
  assert.deepEqual(goal.steps[0].evidence,['ev'],'execution evidence stays available for review');
  assert.equal(d.harness.sessions.outcome(goal.currentRound.runId).verificationStatus,'unverified');
 }finally{await d.closeFixture();}
}
// A done step that claims no evidence stays model-reported and goes to human review.
{
 const d=await fixture(evidenceFlow('goal_progress',undefined));
 try{
  const goals=d.harness.goals;
  startGoal(goals,{objective:'Deliver proof MARKER-VERIFY-2',steps:[{text:'Produce the evidence'}]});
  await goals.drain('goal');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'review_required');
  assert.equal(goal.reason,'unverified');
  assert.deepEqual(goal.evidenceRefs,[]);
  assert.equal(d.harness.sessions.outcome(goal.currentRound.runId).verificationStatus,'unverified');
 }finally{await d.closeFixture();}
}
// Claimed evidence that does not resolve to a real receipt is a failed
// verification: the goal blocks instead of trusting the claim.
{
 const d=await fixture(evidenceFlow('goal_progress',['phantom-call']));
 try{
  const goals=d.harness.goals;
  startGoal(goals,{objective:'Deliver proof MARKER-VERIFY-2B',steps:[{text:'Produce the evidence'}]});
  await goals.drain('goal');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'blocked');
  assert.equal(goal.reason,'unresolved_actions');
  const outcome=d.harness.sessions.outcome(goal.currentRound.runId);
  assert.equal(outcome.taskStatus,'failed');
  assert.equal(outcome.verificationStatus,'unverified');
 }finally{await d.closeFixture();}
}
// update_goal complete without evidence completes as model-reported, never verified.
{
 const d=await fixture(async({messages,onToolCall,onChunk})=>{
  const goal=goalData(messages);
  if(!hasResult(messages,'ev'))onToolCall({id:'ev',name:'fixture_tool',arguments:{value:'proof'}});
  else if(goal&&!hasResult(messages,'progress'))onToolCall({id:'progress',name:'goal_progress',arguments:{expectedRevision:goal.revision,steps:[{text:'Produce the evidence',status:'done'}]}});
  else if(goal&&!hasResult(messages,'completion'))onToolCall({id:'completion',name:'update_goal',arguments:{goal_id:goal.id,revision:goal.revision,action:'complete'}});
  else onChunk('I declare this complete.');
  return {completed:true};
 });
 try{
  const goals=d.harness.goals;
  startGoal(goals,{objective:'Deliver proof MARKER-VERIFY-3',steps:[{text:'Produce the evidence'}]});
  await goals.drain('goal');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'completed');
  assert.equal(goal.reason,'model_reported');
  assert.deepEqual(goal.evidenceRefs,[]);
 }finally{await d.closeFixture();}
}
// Rounds that never request completion get no verification verdict at all.
{
 const d=await fixture(async({onChunk})=>{onChunk('Working toward the objective');return {completed:true};});
 try{
  const goals=d.harness.goals;
  startGoal(goals,{objective:'Long objective MARKER-VERIFY-4',maxRounds:2});
  await goals.drain('goal');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'blocked');
  const roundRunIds=d.db.db.prepare("SELECT id FROM runs WHERE session_id='goal' ORDER BY rowid").all().map(row=>row.id);
  assert.equal(roundRunIds.length,2);
  for(const runId of roundRunIds){
    const outcome=d.harness.sessions.outcome(runId);
    assert.equal(outcome.taskStatus,'completed');
    assert.equal(outcome.verificationStatus,'not_applicable');
  }
 }finally{await d.closeFixture();}
}
// Adopting a goal mid-flight must not promote execution receipts to verification.
{
 const d=await fixture(async({messages,onToolCall,onChunk})=>{
  const goal=goalData(messages);
  if(!hasResult(messages,'ev'))onToolCall({id:'ev',name:'fixture_tool',arguments:{value:'proof'}});
  else if(!goal)onToolCall({id:'adopt',name:'goal_start',arguments:{objective:'Deliver proof MARKER-VERIFY-5',steps:[{text:'Produce the evidence',status:'done',evidence:['ev']}]}});
  else if(!hasResult(messages,'completion'))onToolCall({id:'completion',name:'goal_progress',arguments:{expectedRevision:goal.revision,steps:goal.steps,finish:true}});
  else onChunk('Verified within the adopting turn.');
  return {completed:true};
 });
 try{
  await d.agentLoop.run({runId:'adopt-verified',sessionId:'goal',prompt:'Deliver the proof'});
  const goal=d.harness.goals.get('goal');
  assert.equal(goal.phase,'review_required');
  assert.equal(goal.reason,'unverified');
  assert.deepEqual(goal.evidenceRefs,[]);
  assert.equal(d.harness.sessions.outcome('adopt-verified').verificationStatus,'unverified');
 }finally{await d.closeFixture();}
}
// Verifier guards: verdicts only for the admitted round with completion requested.
{
 const d=await fixture(async({onChunk})=>{onChunk('Preparing');return {completed:true};});
 try{
  const goals=d.harness.goals;
  const created=goals.create('goal',{objective:'Guard objective',steps:[{text:'Step'}]});
  assert.equal(goals.verifierFor('goal'),null);
  goals.control('goal',{action:'start',expectedRevision:created.revision,autoContinue:false});
  await goals.drain('goal');
  const verifier=goals.verifierFor('goal');
  assert.equal(typeof verifier,'function');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'paused');
  assert.equal(verifier({runId:'some-other-turn',sessionId:'goal'}),null);
  assert.equal(verifier({runId:goal.currentRound.runId,sessionId:'goal'}),null);
  goals.control('goal',{action:'cancel',expectedRevision:goals.get('goal').revision});
  assert.equal(goals.verifierFor('goal'),null);
 }finally{await d.closeFixture();}
}
// Evidence validation bounds apply at plan time.
{
 const d=await fixture(async({onChunk})=>{onChunk('ok');return {completed:true};});
 try{
  const goals=d.harness.goals;
  assert.throws(()=>goals.create('goal',{objective:'Bounds',steps:[{text:'Step',status:'done',evidence:[42]}]}),/tool call ids/);
  assert.throws(()=>goals.create('goal',{objective:'Bounds',steps:[{text:'Step',status:'done',evidence:Array.from({length:9},(_,i)=>`call-${i}`)}]}),/up to 8/);
  const created=goals.create('goal',{objective:'Bounds',steps:[{text:'Step',status:'done',evidence:['ev-1','ev-1',' ev-2 ']}]});
  assert.deepEqual(created.steps[0].evidence,['ev-1','ev-2']);
 }finally{await d.closeFixture();}
}
// A model can cite an unrelated successful call; the goal still needs review.
{
 const d=await fixture(evidenceFlow('goal_progress',['ev']));
 try{
  const goals=d.harness.goals;
  startGoal(goals,{objective:'Fix the bug and pass its regression test',steps:[{text:'Fix the bug and pass its regression test'}]});
  await goals.drain('goal');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'review_required');
  assert.equal(d.harness.sessions.outcome(goal.currentRound.runId).verificationStatus,'unverified');
 }finally{await d.closeFixture();}
}
// A host-owned oracle can still verify actual artifacts or reject an incorrect
// delivery, independently of successful receipts and the model's completion.
for(const correct of [true,false]){
 const d=await fixture(evidenceFlow('goal_progress',['ev']));
 try{
  const output=path.join(d.fixtureRoot,'delivery.txt');
  d.tools.get('fixture_tool').execute=async()=>{fs.writeFileSync(output,correct?'expected delivery':'incorrect delivery');return {success:true};};
  const goals=d.harness.goals;
  const created=goals.create('goal',{objective:'Write the expected delivery',steps:[{text:'Write delivery'}]});
  goals.verifiers.set(created.id,()=>{
   const verified=fs.existsSync(output)&&fs.readFileSync(output,'utf8')==='expected delivery';
   return {verified,evidenceRefs:verified?['host:delivery-content']:[]};
  });
  goals.control('goal',{action:'start',expectedRevision:created.revision,autoContinue:true});
  await goals.drain('goal');
  const goal=goals.get('goal'),outcome=d.harness.sessions.outcome(goal.currentRound.runId);
  assert.equal(outcome.verificationStatus,correct?'verified':'unverified');
  assert.equal(goal.phase,correct?'completed':'blocked');
  if(correct)assert.deepEqual(goal.evidenceRefs,['host:delivery-content']);
 }finally{await d.closeFixture();}
}
console.log('✓ Goal verification: receipt validation, independent-verification boundary, model-reported fallback and review gates passed');
