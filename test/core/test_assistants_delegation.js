import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {harnessFixture} from '../harness_fixture.js';
import {createDaemon} from '../../server/index.js';

// Persistent assistant: identity and memory survive chat resets, and the
// workspace binding is validated.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  for(const id of ['assistant-a'])d.db.upsertAgent({id,name:'Worker A',avatar:'A',system_prompt:'Standing instructions for A',model_provider:'fixture',model_name:'fixture',temperature:.7});
  d.db.createSession('chat-1','assistant-a','First chat');
  await d.tools.get('memory_save').execute({content:'Assistant A manages the release calendar'},{agentId:'assistant-a',scopeId:'standalone:chat-1'});
  // A reset chat is a new session with the same assistant: identity and memory carry over.
  d.db.createSession('chat-2','assistant-a','Second chat after reset');
  const remembered=await d.tools.get('memory_search').execute({query:'release calendar'},{agentId:'assistant-a',scopeId:'standalone:chat-2'});
  assert.equal(remembered.memories.length,1);
  const bound=d.db.setAssistantWorkspace('assistant-a',{mainSessionId:'chat-1',defaultProjectId:null});
  assert.equal(bound.main_session_id,'chat-1');
  d.db.createSession('foreign','fixture','Other assistant chat');
  assert.throws(()=>d.db.setAssistantWorkspace('assistant-a',{mainSessionId:'foreign'}),/must belong to the assistant/);
  assert.throws(()=>d.db.setAssistantWorkspace('assistant-a',{defaultProjectId:'missing-project'}),/Project not found/);
  assert.throws(()=>d.db.setAssistantWorkspace('ghost',{}),/Assistant not found/);
 }finally{await d.closeFixture();}
}
// Assistant-owned habits fire into the assistant's durable main conversation.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('duty done');return {completed:true,usage:{inputTokens:1,outputTokens:1}};}});
 try{
  d.db.upsertAgent({id:'assistant-b',name:'Worker B',avatar:'B',system_prompt:'B',model_provider:'fixture',model_name:'fixture',temperature:.7});
  d.db.addProject('home-project','Home',d.fixtureRoot);
  d.db.setAssistantWorkspace('assistant-b',{defaultProjectId:'home-project'});
  const scheduler=d.habits;
  const habit=scheduler.createHabit({assistantId:'assistant-b',prompt:'Review the release board',schedule:{kind:'interval',minutes:30}});
  const duties=d.db.getSession(`duties_assistant-b`);
  assert.ok(duties,'assistant main conversation is created on first duty');
  assert.equal(duties.agent_id,'assistant-b');
  assert.equal(duties.project_id,'home-project');
  assert.equal(habit.sessionId,duties.id);
  assert.equal(d.db.getAgent('assistant-b').main_session_id,duties.id);
  d.db.recordHabitRun(habit.id,{lastRunAt:null,lastStatus:null,nextRunAt:Date.now()-1000});
  assert.equal(scheduler.tick().length,1);
  const started=Date.now();
  while(Date.now()-started<10000){
    const run=d.db.db.prepare('SELECT status FROM runs WHERE session_id=?').get(duties.id);
    if(run?.status==='completed'||run?.status==='failed')break;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(d.db.db.prepare('SELECT status FROM runs WHERE session_id=?').get(duties.id)?.status,'completed');
  assert.ok(d.db.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id=? AND sender='user' AND content='Review the release board'").get(duties.id).n>=1);
 }finally{await d.closeFixture();}
}
// Delegations are durable: spawn records, completion keeps a summary, failure
// keeps the error, and subagent_list exposes them per chat.
{
 const d=await harnessFixture({stream:async(options)=>{
  const {messages,onToolCall,onChunk,runId}=options;
  if(runId.startsWith('run_child_')){
    if(messages.some(m=>typeof m.content==='string'&&m.content.includes('FAIL_CHILD')))throw new Error('child exploded');
    onChunk('child finished the task');return {completed:true,usage:{inputTokens:1,outputTokens:1}};
  }
  const resultOf=id=>{const msg=messages.findLast(m=>m.role==='tool'&&m.tool_call_id===id);return msg?JSON.parse(msg.content):null;};
  if(!messages.some(m=>m.role==='tool'&&m.tool_call_id==='spawn'))onToolCall({id:'spawn',name:'subagent_spawn',arguments:{task:'Child task MARKER-DEL-1'}});
  else if(!messages.some(m=>m.role==='tool'&&m.tool_call_id==='wait'))onToolCall({id:'wait',name:'subagent_wait',arguments:{childId:resultOf('spawn').childId}});
  else if(!messages.some(m=>m.role==='tool'&&m.tool_call_id==='spawn2'))onToolCall({id:'spawn2',name:'subagent_spawn',arguments:{task:'FAIL_CHILD task'}});
  else if(!messages.some(m=>m.role==='tool'&&m.tool_call_id==='wait2'))onToolCall({id:'wait2',name:'subagent_wait',arguments:{childId:resultOf('spawn2').childId}});
  else onChunk('delegation round complete');
  return {completed:true,usage:{inputTokens:1,outputTokens:1}};
 }});
 try{
  d.db.createSession('parent','fixture','Delegation parent');
  await d.agentLoop.run({runId:'parent-run',sessionId:'parent',prompt:'Delegate work now'});
  const delegations=d.harness.subagents.listDelegations('parent');
  assert.equal(delegations.length,2);
  const completed=delegations.find(entry=>entry.task.includes('MARKER-DEL-1'));
  assert.equal(completed.status,'completed');
  assert.ok(completed.childSessionId?.startsWith('child_'));
  assert.ok(completed.summary.includes('child finished the task'));
  const failed=delegations.find(entry=>entry.task.includes('FAIL_CHILD'));
  // The delegation completes; its recorded outcome carries the real failed
  // task status instead of inventing success.
  assert.equal(failed.status,'completed');
  const outcome=JSON.parse(failed.summary);
  assert.equal(outcome.status,'failed');
  assert.equal(outcome.verificationStatus,'unverified');
  const listed=await d.tools.get('subagent_list').execute({},{sessionId:'parent',runId:'x'});
  assert.equal(listed.delegations.length,2);
  assert.equal(d.db.db.prepare("SELECT COUNT(*) AS n FROM harness_children WHERE parent_session_id='parent'").get().n,2);
 }finally{await d.closeFixture();}
}
// A daemon restart orphans in-flight delegations instead of silently resuming.
{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'delegation-restart-'));
 let d;
 try{
  const makeDaemon=()=>createDaemon({dbPath:path.join(root,'app.db'),dataDir:root,port:0,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async({onChunk})=>{onChunk('ok');return {completed:true,usage:{inputTokens:1,outputTokens:1}};}});}}}});
  d=makeDaemon();await d.harness.ready;
  d.db.createSession('parent','default-assistant','Delegation restart');
  d.harness.subagents.recordDelegation({id:'del-done',sessionId:'parent',parentRunId:'run_old',rootRunId:'run_old',task:'Finished before restart'});
  d.harness.subagents.updateDelegation('del-done',{status:'completed',summary:'{"ok":true}'});
  d.harness.subagents.recordDelegation({id:'del-hang',sessionId:'parent',parentRunId:'run_old2',rootRunId:'run_old2',task:'Was in flight at crash time'});
  await d.stop();d=null;
  // Simulate the crashed daemon's leftover: the in-flight delegation stays running.
  d=makeDaemon();await d.harness.ready;
  const rows=d.db.db.prepare('SELECT id,status FROM harness_delegations ORDER BY id').all();
  assert.equal(rows.find(row=>row.id==='del-hang')?.status,'orphaned');
  assert.equal(rows.find(row=>row.id==='del-done')?.status,'completed');
  const listed=await d.harness.subagents.listDelegations('parent');
  const orphan=listed.find(entry=>entry.id==='del-hang');
  assert.match(orphan.error,/Daemon restarted/);
 }finally{if(d)await d.stop();fs.rmSync(root,{recursive:true,force:true});}
}
console.log('✓ Assistants and delegation: identity/memory across resets, workspace binding, assistant-owned duties, durable delegation records with orphan recovery passed');
