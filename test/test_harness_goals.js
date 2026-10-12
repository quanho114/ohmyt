import assert from 'node:assert/strict';
import {harnessFixture} from './harness_fixture.js';
import {Goals} from '../server/harness/goals.js';

const goalData=messages=>JSON.parse(messages.at(-1).content.split('\n')[1]);
async function fixture(stream){const d=await harnessFixture({stream});d.db.createSession('goal','fixture','Goal test');return d;}
const start=(goals,{autoContinue=true,...config}={})=>{const goal=goals.create('goal',{objective:'Preserve target MARKER-903 and complete the requested work',...config});return goals.control('goal',{action:'start',expectedRevision:goal.revision,autoContinue});};

// No goal tool overhead on normal chat. Goal data is pinned on every request.
{
 let calls=0;
 const d=await fixture(async({messages,tools,onChunk})=>{calls++;assert(tools.some(t=>t.name==='goal_start'));assert(!messages.some(m=>typeof m.content==='string'&&m.content.includes('Current durable objective')));onChunk('Normal reply');return {completed:true};});
 try{await d.agentLoop.run({runId:'normal',sessionId:'goal',prompt:'hello'});assert.equal(calls,1);assert.equal(d.harness.goals.get('goal'),null);}finally{await d.closeFixture();}
}
// Sequential rounds share a root budget; unverified completion only requests review.
{
 let calls=0,concurrency=0,peak=0;
 const d=await fixture(async({messages,onChunk,onToolCall})=>{
  concurrency++;peak=Math.max(peak,concurrency);calls++;
  const context=goalData(messages);assert.match(context.objective,/MARKER-903/);
  if(context.round===2&&!messages.some(m=>m.role==='tool'&&m.tool_call_id==='finish'))onToolCall({id:'finish',name:'goal_progress',arguments:{expectedRevision:context.revision,steps:[{text:'Task finished',status:'done'}],finish:true}});
  else onChunk('Round ended');concurrency--;return {completed:true,usage:{inputTokens:10,outputTokens:5}};
 });
 try{
  const goals=d.harness.goals;const created=goals.create('goal',{objective:'MARKER-903',steps:[{text:'Do the work'}],maxRounds:3});
  assert.equal(created.phase,'paused');await new Promise(r=>setTimeout(r,10));assert.equal(calls,0);
  assert.throws(()=>goals.edit('goal',{expectedRevision:0,objective:'bad'}),/revision/);
  goals.control('goal',{action:'start',expectedRevision:created.revision,autoContinue:true});await goals.drain('goal');
  const goal=goals.get('goal');assert.equal(goal.phase,'review_required');assert.equal(goal.roundsStarted,2);assert.equal(goal.usage.used.requests,3);assert.equal(goal.usage.used.tools,1);assert.equal(peak,1);
  assert.equal(new Goals(d.harness).get('goal').id,goal.id);
  assert.equal(d.harness.sessions.outcome(goal.currentRound.runId).verificationStatus,'unverified');
  const confirmed=goals.control('goal',{action:'confirm',expectedRevision:goal.revision});assert.equal(confirmed.phase,'completed');assert.equal(confirmed.reason,'human_confirmed');assert.deepEqual(confirmed.evidenceRefs,[]);
 }finally{await d.closeFixture();}
}
// Round limit, explicit one-round activation, and a trusted evidence oracle.
for(const mode of ['limit','single','oracle']){
 const d=await fixture(async({onChunk})=>{onChunk('Done');return {completed:true,usage:{inputTokens:1,outputTokens:2}};});
 try{
  const goals=d.harness.goals;const created=goals.create('goal',{objective:'Objective',maxRounds:2});
  if(mode==='oracle')goals.verifiers.set(created.id,()=>({verified:true,evidenceRefs:['test:independent-oracle']}));
  goals.control('goal',{action:'start',expectedRevision:created.revision,autoContinue:mode!=='single'});await goals.drain('goal');
  const goal=goals.get('goal');assert.equal(goal.phase,mode==='limit'?'blocked':mode==='single'?'paused':'completed');assert.equal(goal.roundsStarted,mode==='limit'?2:1);
  if(mode==='limit')assert.throws(()=>goals.control('goal',{action:'start',expectedRevision:goal.revision,autoContinue:true}),/exhausted/);
  if(mode==='oracle')assert.deepEqual(goal.evidenceRefs,['test:independent-oracle']);
 }finally{await d.closeFixture();}
}
// Requests are bounded across rounds, including a cold budget reader.
{
 const d=await fixture(async({onChunk})=>{onChunk('Still working');return {completed:true};});
 try{start(d.harness.goals,{requests:2,maxRounds:10});await d.harness.goals.drain('goal');const goal=d.harness.goals.get('goal');assert.equal(goal.phase,'blocked');assert.equal(goal.usage.used.requests,2);const cold=new Goals(d.harness);const budget=cold.budget(cold.get('goal'));assert.throws(()=>budget.consume('requests'),/exhausted/);}finally{await d.closeFixture();}
}
// Pause aborts physical work and prevents resume until quiescence. Late results cannot re-arm.
{
 let release,entered,requests=0;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const d=await fixture(async({onChunk})=>{requests++;entered();await gate;onChunk('late');return {completed:true};});
 try{
  start(d.harness.goals);await waiting;const goals=d.harness.goals,g=goals.get('goal');goals.control('goal',{action:'pause',expectedRevision:g.revision});
  assert.throws(()=>goals.control('goal',{action:'start',expectedRevision:goals.get('goal').revision,autoContinue:true}),/Wait/);
  assert.equal(goals.get('goal').phase,'paused');assert(goals.tasks.has('goal'));release();await goals.drain('goal');assert.equal(requests,1);assert.equal(goals.get('goal').phase,'paused');
 }finally{release();await d.closeFixture();}
}
// Human input, denial and unknown mutation stop the automatic chain.
for(const mode of ['human','denied','unknown']){
 let requests=0,effects=0;
 const d=await harnessFixture({stream:async({messages,onToolCall,onChunk})=>{requests++;if(mode==='human'){d.harness.goals.interrupt('goal');onChunk('late');}else if(!messages.some(m=>m.role==='tool'))onToolCall({id:'effect',name:'fixture_effect',arguments:{}});else onChunk('Confident done');return {completed:true};},tools:[{name:'fixture_effect',parameters:{type:'object',properties:{}},execute:()=>{effects++;throw new Error('after effect');}}]});
 d.db.createSession('goal','fixture','Goal');if(mode==='denied')d.permissions.evaluate=()=>({action:'DENY',reason:'denied'});
 try{start(d.harness.goals);await d.harness.goals.drain('goal');const goal=d.harness.goals.get('goal');assert.equal(goal.roundsStarted,1);assert.equal(goal.phase,mode==='human'?'paused':'blocked');assert.equal(effects,mode==='unknown'?1:0);assert(requests<=2);}finally{await d.closeFixture();}
}
// Pause/cancel and session deletion settle the chain before reclaiming scope.
{
 let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const d=await fixture(async()=>{entered();await gate;return {completed:true};});
 try{
  start(d.harness.goals);await waiting;const goals=d.harness.goals,g=goals.get('goal');
  const runId=g.currentRound.runId;d.agentLoop.abortRun(runId,'User stopped');
  assert.equal(d.db.getRunEvents(runId).filter(e=>e.event_type==='RunAborted').length,1);
  release();await goals.drain('goal');assert.equal(goals.get('goal').phase,'paused');
 }finally{release();await d.closeFixture();}
}
// Goal budget propagates into actual child turns, rather than a fresh child counter.
{
 let d;let childRequests=0;
 d=await fixture(async({runId,messages,onToolCall,onChunk})=>{
  if(runId.startsWith('run_child_')){childRequests++;onChunk('Child observed data');}
  else if(!messages.some(m=>m.role==='tool'))onToolCall({id:'spawn',name:'subagent_spawn',arguments:{task:'Read data',capabilities:[]}});
  else if(!messages.some(m=>m.tool_call_id==='wait')){
   const result=JSON.parse(messages.find(m=>m.tool_call_id==='spawn').content);
   onToolCall({id:'wait',name:'subagent_wait',arguments:{childId:result.childId}});
  }else onChunk('Child finished');
  return {completed:true,usage:{inputTokens:1,outputTokens:1}};
 });
 try{start(d.harness.goals,{requests:3,maxRounds:1});await d.harness.goals.drain('goal');const goal=d.harness.goals.get('goal');assert.equal(goal.usage.used.requests,3);assert.equal(childRequests,1);assert.equal(goal.phase,'blocked');assert.equal(d.harness.childSessions.size,0);assert.equal(d.harness.subagents.list(goal.currentRound.runId).filter(c=>c.state==='running').length,0);}finally{await d.closeFixture();}
}
// A late admitted turn cannot publish a terminal goal after cancellation or deletion.
for(const mode of ['cancel','delete','shutdown']){
 let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const d=await fixture(async()=>{entered();await gate;return {completed:true};});
 try{
  start(d.harness.goals);await waiting;const goals=d.harness.goals,g=goals.get('goal');let stopping;
  if(mode==='cancel')goals.control('goal',{action:'cancel',expectedRevision:g.revision});
  else if(mode==='delete'){
   const {port}=await d.start();stopping=fetch('http://127.0.0.1:'+port+'/api/sessions/goal',{method:'DELETE'});await new Promise(r=>setTimeout(r,20));assert(d.db.getSession('goal'),'deletion waits for the physical request to drain');
  }else stopping=d.stop();
  release();await goals.drain('goal');if(stopping){const result=await stopping;if(mode==='delete')assert.equal(result.status,200);}
  if(mode==='cancel')assert.equal(goals.get('goal').phase,'cancelled');if(mode==='delete')assert.equal(d.db.getSession('goal'),undefined);
 }finally{release();await d.closeFixture();}
}
// A changed project cannot inherit the old goal activation.
{
 const d=await fixture(async()=>{throw Error('Must not dispatch');});
 try{const goals=d.harness.goals,g=goals.create('goal',{objective:'Original standalone work'});const session=d.db.getSession.bind(d.db);d.db.getSession=id=>id==='goal'?{...session(id),project_id:'different-project'}:session(id);assert.throws(()=>goals.control('goal',{action:'start',expectedRevision:g.revision,autoContinue:true}),/scope changed/);assert.equal(goals.get('goal').phase,'paused');}finally{await d.closeFixture();}
}
// Reservation survives cold reading; only admitted turns consume a round.
{
 const d=await fixture(async()=>{throw new Error('Must not dispatch');});
 try{
  const goals=d.harness.goals,g=goals.create('goal',{objective:'Restart test',maxRounds:3});
  goals.change('goal',g.revision,'test-arm',goal=>({...goal,phase:'active',autoContinue:true}));
  const round=goals.reserve('goal');round.budget.consume('requests');
  const cold=new Goals(d.harness);cold.recover();const recovered=cold.get('goal');assert.equal(recovered.phase,'paused');assert.equal(recovered.roundsStarted,0);assert.equal(recovered.usage.used.requests,1);assert.throws(()=>goals.admit(round.runId,'goal'),/Stale/);
  d.db.deleteSession('goal');assert.equal(goals.get('goal'),null);
 }finally{await d.closeFixture();}
}
console.log('Durable goals: sequential rounds, pinned plan, shared budget, review, pause/drain, denial/unknown/human fences and cold recovery passed');

// The agent adopts a human turn without a form; completion settles before continuation.
{
 let requests=0;
 const d=await fixture(async({messages,onToolCall,onChunk})=>{
  requests++;
  const context=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
  if(!context)onToolCall({id:'start-auto',name:'goal_start',arguments:{objective:'Fix the requested issue',steps:[{text:'Inspect and fix'}]}});
  else {const goal=JSON.parse(context.content.split('\n')[1]);
   if(!messages.some(m=>m.tool_call_id==='finish-auto'))onToolCall({id:'finish-auto',name:'goal_progress',arguments:{expectedRevision:goal.revision,finish:true}});
   else onChunk('Ready for review');
  }
  return {completed:true};
 });
 try{await d.agentLoop.run({runId:'automatic-human',sessionId:'goal',prompt:'Fix this issue'});await d.harness.goals.drain('goal');
  const goal=d.harness.goals.get('goal');assert.equal(goal.phase,'completed');assert.equal(goal.roundsStarted,1);assert.equal(goal.currentRound.runId,'automatic-human');assert(goal.usage.used.requests>=requests);assert.equal(d.harness.goals.rounds.size,0);
 }finally{await d.closeFixture();}
}

// A normal first turn hands off to one sequential continuation automatically.
{
 const d=await fixture(async({messages,onToolCall,onChunk})=>{
  const pinned=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
  if(!pinned)onToolCall({id:'auto-plan',name:'goal_start',arguments:{objective:'Complete multi-turn work',steps:[{text:'Finish stage two'}]}});
  else {const goal=JSON.parse(pinned.content.split('\n')[1]);
   if(goal.round===1)onChunk('First stage complete');
   else if(!messages.some(m=>m.tool_call_id==='auto-done'))onToolCall({id:'auto-done',name:'goal_progress',arguments:{expectedRevision:goal.revision,finish:true}});
   else onChunk('Result ready');
  }
  return {completed:true};
 });
 try{await d.agentLoop.run({runId:'auto-multi',sessionId:'goal',prompt:'Do this task'});await d.harness.goals.drain('goal');
  const goal=d.harness.goals.get('goal');assert.equal(goal.roundsStarted,2);assert.equal(goal.phase,'completed');assert.equal(d.harness.agents.sessionOwners.size,0);
 }finally{await d.closeFixture();}
}

// Automatic adoption never continues after an unknown side effect or user stop.
for(const mode of ['unknown-auto','stop-auto']){
 let effects=0;
 const d=await harnessFixture({stream:async({messages,onToolCall,onChunk})=>{
  const pinned=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
  if(!pinned)onToolCall({id:'adopt',name:'goal_start',arguments:{objective:'Handle requested work'}});
  else if(mode==='stop-auto'){d.agentLoop.abortRun(mode,'User stopped');onChunk('Stopped');}
  else if(!messages.some(m=>m.tool_call_id==='uncertain'))onToolCall({id:'uncertain',name:'fixture_effect',arguments:{}});
  else onChunk('Result uncertain');
  return {completed:true};
 },tools:[{name:'fixture_effect',parameters:{type:'object',properties:{}},execute:()=>{effects++;throw new Error('Unknown result after side effect');}}]});
 d.db.createSession('goal','fixture','Automatic fences');d.db.setPolicy('fixture_effect:*','ALLOW');
 try{await d.agentLoop.run({runId:mode,sessionId:'goal',prompt:'Do this work'});await d.harness.goals.drain('goal');
  const goal=d.harness.goals.get('goal');assert.equal(goal.roundsStarted,1);assert.equal(goal.phase,mode==='stop-auto'?'paused':'blocked');assert.equal(effects,mode==='stop-auto'?0:1);
 }finally{await d.closeFixture();}
}

// Resuming from another human turn retains every physical attempt and the root limit.
{
 let d,requests=0;
 d=await fixture(async({runId,messages,onToolCall,onChunk})=>{
  requests++;
  const pinned=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
  if(!pinned)onToolCall({id:'resume-'+runId,name:'goal_start',arguments:{objective:'Continue the same bounded task'}});
  else {
   const g=d.harness.goals.get('goal');
   d.harness.goals.change('goal',g.revision,'test-single',goal=>({...goal,autoContinue:false}));
   onChunk('Stage recorded');
  }
  return {completed:true,usage:{inputTokens:7,outputTokens:2}};
 });
 try{
  d.harness.goals.create('goal',{objective:'Bounded task',requests:4,steps:[{text:'Retain the existing plan'}]});
  await d.agentLoop.run({runId:'resume-first',sessionId:'goal',prompt:'Do stage one'});
  assert.equal(d.harness.goals.get('goal').phase,'paused');
  await d.agentLoop.run({runId:'resume-second',sessionId:'goal',prompt:'Continue stage two'});
  const g=d.harness.goals.get('goal');assert.equal(requests,4);assert.equal(g.usage.used.requests,4);
  assert.equal(g.usage.attempts.length,4);assert.equal(g.usage.used.tools,2);assert.equal(g.phase,'blocked');
  assert.equal(g.steps[0].text,'Retain the existing plan');
  assert.equal(new Goals(d.harness).get('goal').usage.attempts.length,4);
  assert.throws(()=>d.harness.goals.budget(g).consume('requests'),/exhausted/);
 }finally{await d.closeFixture();}
}

// Users can disable planning through the existing extensions setting.
{
 let requests=0;
 const d=await fixture(async({tools,onChunk})=>{requests++;assert(!tools.some(t=>t.name.startsWith('goal_')));onChunk('Direct reply');return {completed:true};});
 try{
  const extension=d.harness.extensions.get('tools/goals');
  await d.harness.extensions.update(extension.id,{enabled:false,expectedVersion:extension.revision});
  await d.agentLoop.run({runId:'planning-disabled',sessionId:'goal',prompt:'Explain this directly'});
  assert.equal(requests,1);assert.equal(d.harness.goals.get('goal'),null);
  await d.agentLoop.run({runId:'disabled-explicit',sessionId:'goal',prompt:'/goal Create a disabled goal'});
  assert.equal(requests,1);assert.equal(d.harness.goals.get('goal'),null);
  const g=d.harness.goals.create('goal',{objective:'Stored draft'});
  assert.throws(()=>d.harness.goals.control('goal',{action:'start',autoContinue:true,expectedRevision:g.revision}),/disabled/);
 }finally{await d.closeFixture();}
}

// Editing an adopted human goal must wait for its aborted request to drain.
{
 let d,entered,release;
 const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 d=await fixture(async({messages,onToolCall})=>{
  if(!messages.some(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective')))onToolCall({id:'human-plan',name:'goal_start',arguments:{objective:'Work from chat'}});
  else {entered();await gate;}
  return {completed:true};
 });
 try{
  const task=d.agentLoop.run({runId:'human-drain',sessionId:'goal',prompt:'Do the requested work'});await waiting;
  const g=d.harness.goals.get('goal');d.harness.goals.control('goal',{action:'pause',expectedRevision:g.revision});
  assert.throws(()=>d.harness.goals.edit('goal',{objective:'New work',expectedRevision:d.harness.goals.get('goal').revision}),/wait/);
  release();await task;assert.equal(d.harness.goals.get('goal').phase,'paused');
 }finally{release();await d.closeFixture();}
}

// Explicit composer goals exist before the first model call, even if the model never creates one.
{
 let observed=false;
 const d=await fixture(async({messages,onToolCall,onChunk})=>{
  const pinned=messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));
  assert(pinned);const goal=JSON.parse(pinned.content.split('\n')[1]);observed=true;assert.equal(goal.objective,'Analyze Messi');
  if(!messages.some(m=>m.tool_call_id==='explicit-done'))onToolCall({id:'explicit-done',name:'goal_progress',arguments:{expectedRevision:goal.revision,finish:true}});else onChunk('Analysis ready');return {completed:true};
 });
 try{d.harness.goals.create('goal',{objective:'Analyze Messi'});await d.agentLoop.run({runId:'explicit-composer',sessionId:'goal',prompt:'/goal Analyze Messi'});await d.harness.goals.drain('goal');assert(observed);assert.equal(d.harness.goals.get('goal').phase,'completed');assert.equal(d.db.getMessages('goal').find(m=>m.sender==='user').content,'Analyze Messi');}finally{await d.closeFixture();}
}

// Compatibility StepStarted events lack stepId; repeated cancellations must not
// create a shared undefined:end event or prevent the session owner from draining.
{
 let entered,release;
 const d=await fixture(async({purpose,onChunk})=>{if(purpose==='title'){onChunk('Fixture title');return {completed:true};}entered();await new Promise(r=>release=r);return {completed:true};});
 try{
  for(const runId of ['cancel-same-chat-1','cancel-same-chat-2']){
   const waiting=new Promise(r=>entered=r),task=d.agentLoop.run({runId,sessionId:'goal',prompt:'Do work'});
   await waiting;d.agentLoop.abortRun(runId,'User stopped');release();await task;
   assert.equal(d.harness.sessions.outcome(runId).protocolStatus,'cancelled');
   assert.equal(d.harness.agents.sessionOwners.size,0);
  }
  assert(!d.harness.sessions.log.readAll('goal').some(e=>e.eventId==='undefined:end'));
 }finally{release?.();await d.closeFixture();}
}
