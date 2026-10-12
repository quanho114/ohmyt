import assert from 'node:assert/strict';
import {harnessFixture} from './harness_fixture.js';
import {PermissionEngine} from '../server/permissions.js';

const pinned=messages=>{const message=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));return message?JSON.parse(message.content.split('\n')[1]):null;};
const called=(messages,id)=>messages.some(m=>m.role==='tool'&&m.tool_call_id===id);
const call=(onToolCall,id,name,args)=>onToolCall({id,name,arguments:args});
async function fixture(stream){const d=await harnessFixture({stream,config:{maxSteps:12}});d.db.createSession('goal','fixture','Goal runtime contract');return d;}

// Canonical tools infer a goal, create/update a plan and settle over multiple turns.
{
 let peak=0,running=0;
 const d=await fixture(async({messages,tools,onToolCall,onChunk})=>{
  peak=Math.max(peak,++running);
  assert(['get_goal','create_goal','update_goal'].every(name=>tools.some(t=>t.name===name)));
  const g=pinned(messages);
  if(!g)call(onToolCall,'create','create_goal',{objective:'Deliver the two-stage requested result'});
  else if(!g.steps.length)call(onToolCall,'plan','goal_progress',{expectedRevision:g.revision,steps:[{id:'one',text:'Inspect current inputs',status:'done'},{id:'two',text:'Deliver checked result',status:'in_progress'}]});
  else if(g.round===1)onChunk('Stage one complete; continuing with stage two.');
  else if(g.steps.some(s=>s.status!=='done'))call(onToolCall,'progress','goal_progress',{expectedRevision:g.revision,steps:g.steps.map(s=>({...s,status:'done'}))});
  else if(!called(messages,'read'))call(onToolCall,'read','get_goal',{});
  else if(!called(messages,'stale'))call(onToolCall,'stale','update_goal',{goal_id:g.id,revision:g.revision-1,action:'complete'});
  else if(!called(messages,'recover-read'))call(onToolCall,'recover-read','get_goal',{});
  else if(!called(messages,'complete'))call(onToolCall,'complete','update_goal',{goal_id:g.id,revision:g.revision,action:'complete'});
  else onChunk('Result delivered; inspected both stages.');
  running--;return {completed:true};
 });
 try {
  // Real default policies allow only the local goal controls; external tools keep their policies.
  d.permissions.evaluate=PermissionEngine.prototype.evaluate.bind(d.permissions);
  await d.agentLoop.run({runId:'canonical-human',sessionId:'goal',prompt:'Build and check this multi-stage result'});
  await d.harness.goals.drain('goal');
  const g=d.harness.goals.get('goal');assert.equal(g.phase,'completed');assert.equal(g.roundsStarted,2);assert.equal(g.limits.rounds,256);assert.equal(peak,1);
  assert.equal(g.reason,'model_reported');assert.deepEqual(g.evidenceRefs,[]);
  assert.equal(d.harness.sessions.outcome(g.currentRound.runId).verificationStatus,'unverified');
  assert.equal(d.harness.agents.sessionOwners.size,0);
 } finally {await d.closeFixture();}
}

// A model-reported blocker is counted once per round and stops at three consecutive rounds.
{
 const d=await fixture(async({messages,onToolCall,onChunk})=>{
  const g=pinned(messages);
  if(!g)call(onToolCall,'create','create_goal',{objective:'Obtain unavailable input'});
  else if(!called(messages,`blocked-${g.round}`))call(onToolCall,`blocked-${g.round}`,'update_goal',{goal_id:g.id,revision:g.revision,action:'blocked',blocked_reason:'The required input does not exist'});
  else if(g.round===1&&!called(messages,'duplicate'))call(onToolCall,'duplicate','update_goal',{goal_id:g.id,revision:g.revision,action:'blocked',blocked_reason:'The required input does not exist'});
  else onChunk('Inspected available sources; required input still unavailable.');
  return {completed:true};
 });
 try{await d.agentLoop.run({runId:'blocker-human',sessionId:'goal',prompt:'Find required input'});await d.harness.goals.drain('goal');const g=d.harness.goals.get('goal');assert.equal(g.phase,'blocked');assert.equal(g.roundsStarted,3);assert.equal(g.blocker.count,3);assert.match(g.reason,/required input/);}finally{await d.closeFixture();}
}

// Awaiting human input stops immediately, preserves the objective and resumes in a human turn.
{
 const d=await fixture(async({runId,messages,onToolCall,onChunk})=>{
  const g=pinned(messages);
  if(runId==='answer-human'){
   if(!called(messages,'resume-read'))call(onToolCall,'resume-read','get_goal',{});
   else if(!g) {const value=JSON.parse(messages.find(m=>m.tool_call_id==='resume-read').content).goal;call(onToolCall,'resume','update_goal',{goal_id:value.id,revision:value.revision,action:'resume'});}
   else if(!called(messages,'complete'))call(onToolCall,'complete','update_goal',{goal_id:g.id,revision:g.revision,action:'complete'});
   else onChunk('Delivered with your supplied input.');
  } else if(!g)call(onToolCall,'create','create_goal',{objective:'Deliver with user-selected input'});
  else if(!called(messages,'ask'))call(onToolCall,'ask','update_goal',{goal_id:g.id,revision:g.revision,action:'await_input',blocked_reason:'Which dataset should I use?'});
  else onChunk('Which dataset should I use?');
  return {completed:true};
 });
 try{await d.agentLoop.run({runId:'question-human',sessionId:'goal',prompt:'Deliver the requested result'});await d.harness.goals.drain('goal');const before=d.harness.goals.get('goal');assert.equal(before.phase,'paused');assert.equal(before.roundsStarted,1);assert.equal(before.autoContinue,false);assert.match(before.reason,/dataset/);await d.agentLoop.run({runId:'answer-human',sessionId:'goal',prompt:'Use dataset A and continue'});await d.harness.goals.drain('goal');assert.equal(d.harness.goals.get('goal').phase,'completed');assert.equal(d.harness.goals.get('goal').id,before.id);}finally{await d.closeFixture();}
}

// CAS conflicts and unfinished work cannot silently complete; empty plans don't imply completion.
{
 const d=await fixture(async({messages,onChunk})=>{const g=pinned(messages);assert(g);onChunk('More work remains');return {completed:true};});
 try{
  const goals=d.harness.goals,g=goals.create('goal',{objective:'Not yet achieved',maxRounds:2});
  goals.control('goal',{action:'start',expectedRevision:g.revision,autoContinue:true});await goals.drain('goal');
  assert.equal(goals.get('goal').phase,'blocked');assert.equal(goals.get('goal').reason,'limit_exhausted');assert.equal(goals.get('goal').roundsStarted,2);
 }finally{await d.closeFixture();}
}
{
 let checked=false;
 const d=await fixture(async({runId,messages,onToolCall,onChunk})=>{
  const g=pinned(messages);
  if(!g)call(onToolCall,'create','goal_start',{objective:'Complete remaining work',steps:[{text:'Unfinished step'}]});
  else {
   const goals=d.harness.goals;
   assert.throws(()=>goals.modelUpdate(runId,{goal_id:g.id,revision:g.revision-1,action:'complete'}),/revision/);
   assert.throws(()=>goals.modelUpdate(runId,{goal_id:g.id,revision:g.revision,action:'complete'}),/Unfinished/);
   const run=d.harness.runContexts.get(runId);run.depth=1;assert.throws(()=>goals.modelRead(runId),/top-level/);run.depth=0;
   checked=true;goals.interrupt('goal');onChunk('Paused incomplete work.');
  }
  return {completed:true};
 });
 try{await d.agentLoop.run({runId:'guard-human',sessionId:'goal',prompt:'Complete work'});await d.harness.goals.drain('goal');assert(checked);assert.equal(d.harness.goals.get('goal').phase,'paused');}finally{await d.closeFixture();}
}
console.log('PASS DeepSeek Goal contracts: canonical tools, automatic/manual adoption, sequential continuation, plan/revision fences, completion provenance, repeated blockers, await-input/resume, empty-plan guard, direct-human authority and real permission defaults');
