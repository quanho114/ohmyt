import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harnessFixture} from '../harness_fixture.js';
import {cases} from '../evals/conversation/cases.js';

// Scripted model tests context transport and protocol only. Live cases use the
// same conversations to evaluate actual inference; no input-word classifier here.
let scenario,step;
const observed=new Map();
const daemon=await harnessFixture({tools:[{name:'intent_fixture_read',scopes:['project'],readOnly:true,parameters:{type:'object',properties:{}},execute:async()=>({purpose:'Reading list'})}],stream:async({messages,onChunk,onToolCall})=>{
  observed.set(scenario.id,messages);
  const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
  assert(system.includes('## CURRENT REQUEST AND CONVERSATION CONTEXT'));
   assert(system.includes('## PAST WORKFLOW (HISTORY ONLY, NOT A CURRENT TASK)'));
  assert(system.includes('Do not start, resume, or continue it on a greeting'));
  assert(system.includes('A short reply only continues work when it answers a concrete pending proposal'));
  assert(system.includes('Interpret meaning, references and relationships, not keyword matches'));
  assert(system.includes('human review persists across follow-ups'));
  assert(system.includes('When the missing information is a user-owned decision'));
  assert(system.includes('call it rather than only listing questions in prose'));
  assert(system.includes('delegates the choice to you'));
  assert(system.includes('Never ask the user to invoke or name a tool'));

  if(scenario.expect==='read'&&step++===0)onToolCall({id:`${scenario.id}-read`,name:'intent_fixture_read',arguments:{}});
  else onChunk(scenario.expect==='clarify'?'Bạn muốn thay đổi parser hay theme?':scenario.id==='translation-not-action'?'Tôi sẽ kiểm tra tác giả.':`Fixture response for ${scenario.id}`);
  return {completed:true};
}});
try {
  // A synthetic tool is not in the guided-workflow preview allowlist. Supply
  // the human decision in this fixture rather than bypassing production review.
  daemon.agentLoop.on('event',event=>{
    if(event.type==='PermissionRequired')daemon.permissions.resolveApproval(event.payload.requestId,'ALLOW_ONCE');
  });
  const root=path.join(daemon.fixtureRoot,'project');fs.mkdirSync(root);
  daemon.db.addProject('project','capstone',root);
  for(const item of cases){
    scenario=item;step=0;
    daemon.db.createSession(item.id,'fixture','Tìm hiểu thông tin dự án','project');
    daemon.db.db.prepare('UPDATE sessions SET workflow_id=? WHERE id=?').run('project-overview',item.id);
    for(const [index,[sender,content]] of item.history.entries())daemon.db.addMessage(`${item.id}-history-${index}`,item.id,sender,content);
    await daemon.agentLoop.run({runId:item.id,sessionId:item.id,prompt:item.prompt});
    const messages=observed.get(item.id);
    assert.equal(messages.findLast(m=>m.role==='user').content,item.prompt,'Current message stays verbatim');
    for(const [sender,content] of item.history)assert(messages.some(m=>m.role===(sender==='agent'?'assistant':'user')&&m.content===content),'Prior context reaches the model');
    const calls=daemon.harness.sessions.log.readAll(item.id).filter(e=>e.type==='tool/call');
    assert.equal(calls.length,item.expect==='read'?1:0,'Harness follows model tool choices without vocabulary routing');
    assert.equal(daemon.harness.goals.get(item.id),null);
    assert.equal(daemon.db.getSession(item.id).workflow_id,'project-overview');
    assert.equal(daemon.db.getSession(item.id).project_id,'project');
  }
  const completed=observed.get('acknowledge-completed');
  const pending=observed.get('accept-pending-read');
  assert.equal(completed.findLast(m=>m.role==='user').content,pending.findLast(m=>m.role==='user').content);
  assert.notDeepEqual(completed,pending,'The same short reply retains different conversational context');
  console.log('PASS conversational context: identical replies with different history, topic shifts, clarification, multilingual tasks and translated action phrases (scripted model)');
} finally {await daemon.closeFixture();}
