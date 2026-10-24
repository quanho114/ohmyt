import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';

const waitRunsSettled=(d,sessionId,expected)=>new Promise(resolve=>{
  const started=Date.now();
  const poll=()=>{
    const runs=d.db.db.prepare('SELECT id,status FROM runs WHERE session_id=?').all(sessionId);
    const done=runs.filter(run=>['completed','failed','aborted'].includes(run.status)).length;
    if(done>=expected)resolve(runs);
    else if(Date.now()-started>10000)resolve(runs);
    else setTimeout(poll,25);
  };
  poll();
});

// Validation: exactly one of schedule or trigger; known trigger kinds only.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  d.db.createSession('trig','fixture','Trigger validation');
  const habits=d.habits;
  assert.throws(()=>habits.createHabit({sessionId:'trig',prompt:'x',schedule:{kind:'interval',minutes:5},trigger:{kind:'run_failed'}}),/either a schedule or a trigger/);
  assert.throws(()=>habits.createHabit({sessionId:'trig',prompt:'x'}),/schedule or a trigger/);
  assert.throws(()=>habits.createHabit({sessionId:'trig',prompt:'x',trigger:{kind:'on_tuesday'}}),/trigger kind must be/);
  const created=habits.createHabit({sessionId:'trig',prompt:'Summarize what went wrong',trigger:{kind:'run_failed'}});
  assert.equal(created.kind,'trigger');
  assert.equal(created.triggerKind,'run_failed');
  assert.equal(created.nextRunAt,null);
  const converted=habits.updateHabit(created.id,{schedule:{kind:'daily',hour:9,minute:0}});
  assert.equal(converted.kind,'schedule');
  assert.equal(converted.triggerKind,null);
  assert.ok(converted.nextRunAt>Date.now());
  const back=habits.updateHabit(created.id,{trigger:{kind:'run_completed'}});
  assert.equal(back.kind,'trigger');
  assert.equal(back.triggerKind,'run_completed');
 }finally{await d.closeFixture();}
}
// A run_failed trigger fires once for a failing run and the habit-sourced
// retry never re-fires itself (loop guard).
{
 const d=await harnessFixture({stream:async({messages,onChunk})=>{
  if(messages.some(m=>typeof m.content==='string'&&m.content.includes('FAIL_MARKER')))throw new Error('synthetic model failure');
  onChunk('healthy reply');
  return {completed:true};
 }});
 try{
  d.db.createSession('trig-run','fixture','Trigger runs');
  // Baseline successful run happens before the trigger exists.
  await d.agentLoop.run({runId:'baseline',sessionId:'trig-run',prompt:'All good work'});
  const habits=d.habits;
  habits.createHabit({sessionId:'trig-run',prompt:'FAIL_MARKER: summarize the failure',trigger:{kind:'run_failed'}});
  await d.agentLoop.run({runId:'breaking',sessionId:'trig-run',prompt:'FAIL_MARKER break'});
  const breaking=d.db.db.prepare("SELECT status,error FROM runs WHERE id='breaking'").get();
  assert.equal(breaking.status,'failed');
  assert.match(breaking.error,/synthetic model failure/);
  await waitRunsSettled(d,'trig-run',2);
  await new Promise(resolve=>setTimeout(resolve,300));
  const triggerRuns=d.db.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id='trig-run' AND sender='user' AND content LIKE '%summarize the failure%'").get().n;
  assert.equal(triggerRuns,1);
  const direct=habits.onRunFinished({runId:'run_goal_x',status:'failed'});
  assert.deepEqual(direct,[]);
 }finally{await d.closeFixture();}
}
// Disabled triggers never fire; a completed run fires run_completed triggers.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('fine');return {completed:true};}});
 try{
  d.db.createSession('trig-ok','fixture','Trigger completed');
  const habits=d.habits;
  const trigger=habits.createHabit({sessionId:'trig-ok',prompt:'Log the completion',trigger:{kind:'run_completed'}});
  habits.updateHabit(trigger.id,{enabled:false});
  await d.agentLoop.run({runId:'ok-run',sessionId:'trig-ok',prompt:'Do it well'});
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(d.db.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id='trig-ok' AND sender='user' AND content LIKE 'Log the completion%'").get().n,0);
  habits.updateHabit(trigger.id,{enabled:true});
  await d.agentLoop.run({runId:'ok-run-2',sessionId:'trig-ok',prompt:'Do it well again'});
  await waitRunsSettled(d,'trig-ok',3);
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.ok(d.db.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id='trig-ok' AND sender='user' AND content LIKE 'Log the completion%'").get().n>=1);
 }finally{await d.closeFixture();}
}
// HTTP surface accepts triggers and rejects mixed definitions.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  d.db.createSession('trig-api','fixture','Trigger API');
  const address=await d.start();
  const base=`http://127.0.0.1:${address.port}/api/habits`;
  const post=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'trig-api',prompt:'React to failures',trigger:{kind:'run_failed'}})});
  assert.equal(post.status,200);
  const habit=await post.json();
  assert.equal(habit.kind,'trigger');
  assert.equal(habit.triggerKind,'run_failed');
  const mixed=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'trig-api',prompt:'x',schedule:{kind:'interval',minutes:5},trigger:{kind:'run_failed'}})});
  assert.equal(mixed.status,400);
  const patched=await fetch(`${base}/${habit.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({schedule:{kind:'interval',minutes:10}})});
  assert.equal((await patched.json()).kind,'schedule');
 }finally{await d.closeFixture();}
}
console.log('✓ Triggers: schedule/trigger exclusivity, failed-run firing, loop guard, goal-round guard, enable/disable and HTTP surface passed');
