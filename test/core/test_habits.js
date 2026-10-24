import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeHabitSchedule, nextHabitRunAt, HabitScheduler} from '../../server/habits.js';
import {harnessFixture} from '../harness_fixture.js';
import {createDaemon} from '../../server/index.js';

// Schedule normalization and local-time next-run math.
{
 const daily=normalizeHabitSchedule({kind:'daily',hour:8,minute:30});
 const morning=new Date(2026,9,24,7,0).getTime();
 assert.equal(nextHabitRunAt(daily,morning),new Date(2026,9,24,8,30).getTime());
 const afterSlot=new Date(2026,9,24,9,0).getTime();
 assert.equal(nextHabitRunAt(daily,afterSlot),new Date(2026,9,25,8,30).getTime());
 const base=new Date(2026,9,21,10,0);
 const weekly=normalizeHabitSchedule({kind:'weekly',weekday:(base.getDay()+2)%7,hour:9,minute:0});
 const expected=new Date(base);expected.setDate(expected.getDate()+2);expected.setHours(9,0,0,0);
 assert.equal(nextHabitRunAt(weekly,base.getTime()),expected.getTime());
 const weeklySameDay=normalizeHabitSchedule({kind:'weekly',weekday:base.getDay(),hour:5,minute:0});
 const expectedNextWeek=new Date(base);expectedNextWeek.setDate(expectedNextWeek.getDate()+7);expectedNextWeek.setHours(5,0,0,0);
 assert.equal(nextHabitRunAt(weeklySameDay,base.getTime()),expectedNextWeek.getTime());
 assert.equal(nextHabitRunAt(normalizeHabitSchedule({kind:'interval',minutes:5}),morning),morning+300000);
 assert.throws(()=>normalizeHabitSchedule({kind:'cron',expr:'0 8 * * *'}),/schedule kind/);
 assert.throws(()=>normalizeHabitSchedule({kind:'daily',hour:24,minute:0}),/Habit hour/);
 assert.throws(()=>normalizeHabitSchedule({kind:'interval',minutes:0}),/interval minutes/);
 assert.throws(()=>normalizeHabitSchedule({kind:'weekly',weekday:7,hour:1,minute:0}),/weekday/);
}
const waitRun=(d,sessionId)=>new Promise(resolve=>{
 const started=Date.now();
 const poll=()=>{
  const run=d.db.db.prepare('SELECT status FROM runs WHERE session_id=? ORDER BY started_at DESC').get(sessionId);
  if(run&&(run.status==='completed'||run.status==='failed'||run.status==='aborted'))resolve(run.status);
  else if(Date.now()-started>10000)resolve('timeout');
  else setTimeout(poll,25);
 };
 poll();
});

// Due habits fire once per slot as durable queued inbox messages and run like
// any queued user message.
{
 let runs=0;
 const d=await harnessFixture({stream:async({onChunk})=>{runs++;onChunk('Habit work done');return {completed:true,usage:{inputTokens:1,outputTokens:1}};}});
 try{
  d.db.createSession('habit-session','fixture','Habit session');
  const scheduler=new HabitScheduler({db:d.db,inbox:d.harness.inbox,pump:null});
  const created=scheduler.createHabit({sessionId:'habit-session',prompt:'Report the daily status',schedule:{kind:'interval',minutes:30}});
  assert.ok(created.nextRunAt>Date.now());
  assert.equal(scheduler.tick().length,0);
  d.db.recordHabitRun(created.id,{lastRunAt:null,lastStatus:null,nextRunAt:Date.now()-1000});
  const fired=scheduler.tick();
  assert.equal(fired.length,1);
  const queued=d.harness.inbox.list('habit-session');
  assert.equal(queued.length,1);
  assert.equal(queued[0].content,'Report the daily status');
  assert.equal(scheduler.tick().length,0);
  assert.equal(d.harness.inbox.list('habit-session').length,1);
  d.agentLoop.pumpInbox('habit-session');
  assert.equal(await waitRun(d,'habit-session'),'completed');
  assert.ok(runs>=1);
  const habit=d.db.getHabit(created.id);
  assert.equal(habit.lastStatus,'queued');
  assert.ok(habit.nextRunAt>Date.now());
  assert.ok(habit.lastInboxId);
  // Disabling stops firing even when the slot is overdue.
  scheduler.updateHabit(created.id,{enabled:false});
  d.db.recordHabitRun(created.id,{lastRunAt:null,lastStatus:null,nextRunAt:Date.now()-1000});
  assert.equal(scheduler.tick().length,0);
 }finally{await d.closeFixture();}
}
// Habits and their single-fire catch-up survive a daemon restart on a real DB.
{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'habit-restart-'));
 let d;
 try{
  const makeDaemon=()=>createDaemon({dbPath:path.join(root,'app.db'),dataDir:root,port:0,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async({onChunk})=>{onChunk('habit run');return {completed:true,usage:{inputTokens:1,outputTokens:1}};}});}}}});
  d=makeDaemon();await d.harness.ready;
  d.db.createSession('habit-session','default-assistant','Habit restart');
  const scheduler=new HabitScheduler({db:d.db,inbox:d.harness.inbox,pump:id=>d.agentLoop.pumpInbox(id)});
  const created=scheduler.createHabit({sessionId:'habit-session',prompt:'Check feeds',schedule:{kind:'daily',hour:3,minute:15}});
  assert.ok(created.id.startsWith('habit_'));
  await d.stop();d=null;
  d=makeDaemon();await d.harness.ready;
  const persisted=d.db.listHabits();
  assert.equal(persisted.length,1);
  assert.deepEqual(persisted[0].schedule,{kind:'daily',hour:3,minute:15});
  d.db.recordHabitRun(created.id,{lastRunAt:null,lastStatus:null,nextRunAt:Date.now()-5000});
  const scheduler2=new HabitScheduler({db:d.db,inbox:d.harness.inbox,pump:id=>d.agentLoop.pumpInbox(id)});
  assert.equal(scheduler2.tick().length,1);
  assert.equal(scheduler2.tick().length,0);
  assert.equal(await waitRun(d,'habit-session'),'completed');
 }finally{if(d)await d.stop();fs.rmSync(root,{recursive:true,force:true});}
}
// HTTP management surface: create, validate, disable, run-now and delete.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('manual habit run');return {completed:true,usage:{inputTokens:1,outputTokens:1}};}});
 try{
  d.db.createSession('habit-api','fixture','Habit API');
  const address=await d.start();
  const base=`http://127.0.0.1:${address.port}/api/habits`;
  const post=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'habit-api',prompt:'Weekly review',schedule:{kind:'weekly',weekday:1,hour:8,minute:0}})});
  assert.equal(post.status,200);
  const habit=await post.json();
  assert.ok(habit.id.startsWith('habit_'));
  assert.deepEqual(habit.schedule,{kind:'weekly',weekday:1,hour:8,minute:0});
  assert.ok(habit.nextRunAt>Date.now());
  const bad=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'habit-api',prompt:'x',schedule:{kind:'cron',expr:'* * * * *'}})});
  assert.equal(bad.status,400);
  const noSession=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'missing',prompt:'x',schedule:{kind:'interval',minutes:5}})});
  assert.equal(noSession.status,400);
  const patched=await fetch(`${base}/${habit.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:false})});
  assert.equal((await patched.json()).enabled,false);
  const runNow=await fetch(`${base}/${habit.id}/run`,{method:'POST'});
  assert.equal(runNow.status,200);
  assert.equal(await waitRun(d,'habit-api'),'completed');
  const listed=await fetch(base);
  assert.equal((await listed.json()).habits.length,1);
  const deleted=await fetch(`${base}/${habit.id}`,{method:'DELETE'});
  assert.equal(deleted.status,200);
  assert.equal(d.db.listHabits().length,0);
 }finally{await d.closeFixture();}
}
console.log('✓ Habits: schedule validation, single-fire slots, durable queued runs, restart catch-up and HTTP management passed');
