import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {createRunScope} from '../../server/project_scope.js';

const ctx=(agentId,scopeId)=>({agentId,scopeId});

// Save, supersede, expiry and forget form one lifecycle over the same store.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  for(const id of ['assistant-a','assistant-b'])d.db.upsertAgent({id,name:id,avatar:'A',system_prompt:'Memory agent',model_provider:'fixture',model_name:'fixture',temperature:.7});
  d.db.createSession('mem','fixture','Memory lifecycle');
  const tools=d.tools;
  const first=await tools.get('memory_save').execute({category:'profile',content:'User deploys ohmyt on a homelab server with Ubuntu'},{...ctx('assistant-a','project:p1')});
  assert.equal(first.success,true);
  assert.equal(first.savedMemory.version,1);
  const found=(await tools.get('memory_search').execute({query:'homelab'},{...ctx('assistant-a','project:p1')})).memories;
  assert.equal(found.length,1);
  assert.equal(found[0].id,first.savedMemory.id);
  assert.equal(found[0].source,'agent');
  assert.equal(found[0].version,1);

  // Superseding hides the old row from search but keeps it as provenance.
  const second=await tools.get('memory_save').execute({category:'profile',content:'User deploys ohmyt on a homelab server with Debian 12 now',supersedes:first.savedMemory.id},{...ctx('assistant-a','project:p1')});
  assert.equal(second.savedMemory.version,2);
  assert.equal(second.superseded,first.savedMemory.id);
  const after=(await tools.get('memory_search').execute({query:'homelab'},{...ctx('assistant-a','project:p1')})).memories;
  assert.equal(after.length,1);
  assert.equal(after[0].id,second.savedMemory.id);
  const oldRow=d.db.getMemory(first.savedMemory.id);
  assert.equal(oldRow.supersededBy,second.savedMemory.id);
  assert.ok(oldRow.supersededAt>0);
  await assert.rejects(tools.get('memory_save').execute({content:'again',supersedes:first.savedMemory.id},{...ctx('assistant-a','project:p1')}),/already superseded/);
  await assert.rejects(tools.get('memory_save').execute({content:'again',supersedes:'mem_missing'},{...ctx('assistant-a','project:p1')}),/not found/);

  // Expiry removes entries from search without deleting them.
  const temporary=await tools.get('memory_save').execute({content:'User is trialing a beta router firmware this week',ttlDays:7},{...ctx('assistant-a','project:p1')});
  assert.ok(temporary.savedMemory.expires_at>Date.now());
  assert.ok((await tools.get('memory_search').execute({query:'router firmware'},{...ctx('assistant-a','project:p1')})).memories.length===1);
  d.db.db.prepare('UPDATE memories SET expires_at = ? WHERE id = ?').run(Date.now()-1,temporary.savedMemory.id);
  assert.equal((await tools.get('memory_search').execute({query:'router firmware'},{...ctx('assistant-a','project:p1')})).memories.length,0);
  assert.ok(d.db.getMemory(temporary.savedMemory.id));

  // Forgetting hides a memory and marks it, while the row remains auditable.
  const forgotten=await tools.get('memory_forget').execute({memoryId:second.savedMemory.id},{...ctx('assistant-a','project:p1')});
  assert.equal(forgotten.success,true);
  assert.ok(forgotten.forgottenMemory.forgottenAt>0);
  assert.equal((await tools.get('memory_search').execute({query:'homelab'},{...ctx('assistant-a','project:p1')})).memories.length,0);
  assert.ok(d.db.getMemory(second.savedMemory.id));
  await assert.rejects(tools.get('memory_forget').execute({memoryId:'mem_missing'},{...ctx('assistant-a','project:p1')}),/not found/);
  await assert.rejects(tools.get('memory_save').execute({content:'x',ttlDays:0},{...ctx('assistant-a','project:p1')}),/ttlDays/);
 }finally{await d.closeFixture();}
}
// Scope and assistant boundaries: project memory is isolated and personal
// memory is shared across standalone chats of the same assistant.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  for(const id of ['assistant-a','assistant-b'])d.db.upsertAgent({id,name:id,avatar:'A',system_prompt:'Memory agent',model_provider:'fixture',model_name:'fixture',temperature:.7});
  d.db.createSession('mem-iso','fixture','Memory isolation');
  await d.tools.get('memory_save').execute({content:'Project alpha uses the staging database at 10.0.0.5'},{...ctx('assistant-a','project:alpha')});
  assert.equal((await d.tools.get('memory_search').execute({query:'staging database'},{...ctx('assistant-a','project:beta')})).memories.length,0);
  await assert.rejects(d.tools.get('memory_forget').execute({memoryId:(d.db.searchMemories('staging',5,'assistant-a','project:alpha'))[0].id},{...ctx('assistant-a','project:beta')}),/different scope/);
  await d.tools.get('memory_save').execute({content:'The assistant owner prefers concise answers'},{...ctx('assistant-b','standalone:chat-1')});
  const shared=await d.tools.get('memory_search').execute({query:'concise answers'},{...ctx('assistant-b','standalone:chat-2')});
  assert.equal(shared.memories.length,1);
  const otherAssistant=await d.tools.get('memory_search').execute({query:'concise answers'},{...ctx('assistant-a','standalone:chat-3')});
  assert.equal(otherAssistant.memories.length,0);
  await assert.rejects(d.tools.get('memory_forget').execute({memoryId:shared.memories[0].id},{...ctx('assistant-a','standalone:chat-3')}),/different assistant/);
 }finally{await d.closeFixture();}
}
// Project scope gates the new tool like the other memory tools.
{
 const d=await harnessFixture({stream:async({onChunk})=>{onChunk('ok');return {completed:true};}});
 try{
  const root=d.fixtureRoot;
  d.db.addProject('proj','Proj',root);
  d.db.createSession('proj-session','fixture','Proj session','proj');
  const scope=createRunScope(d.db,d.db.getSession('proj-session'),'project-memory-lifecycle');
  assert.equal(d.permissions.evaluate('memory_forget','mem_1',scope).action,'ALLOW');
 }finally{await d.closeFixture();}
}
// Every recall path, including the keyword-independent personal profile, must
// honor lifecycle state before content reaches an actual provider request.
{
 let observed=[];
 const d=await harnessFixture({stream:async({messages,onChunk})=>{observed=messages;onChunk('ok');return {completed:true};}});
 try{
  d.db.createSession('personal-target','fixture','Personal memory recall');
  const save=(id,content,options)=>d.db.saveMemory(id,'fixture','profile',content,'standalone:personal-origin',options);
  save('profile-forgotten','FORGOTTEN-PROFILE-91');
  d.db.forgetMemory('profile-forgotten','fixture','standalone:personal-origin');
  save('profile-expired','EXPIRED-PROFILE-92',{expiresAt:Date.now()-1000});
  save('profile-old','SUPERSEDED-PROFILE-93');
  save('profile-current','CURRENT-PROFILE-94',{supersedes:'profile-old'});
  d.db.saveMemory('profile-project','fixture','profile','PROJECT-PRIVATE-95','project:other');
  d.db.upsertAgent({id:'another-assistant',name:'Other',avatar:'O',system_prompt:'Other assistant',model_provider:'fixture',model_name:'fixture',temperature:.7});
  d.db.saveMemory('profile-assistant','another-assistant','profile','ASSISTANT-PRIVATE-96','standalone:other');
  await d.agentLoop.run({runId:'personal-recall',sessionId:'personal-target',prompt:'Hello'});
  const system=observed.filter(m=>m.role==='system').map(m=>m.content).join('\n');
  assert(system.includes('CURRENT-PROFILE-94'),'current personal profile is recalled across standalone chats');
  for(const marker of ['FORGOTTEN-PROFILE-91','EXPIRED-PROFILE-92','SUPERSEDED-PROFILE-93','PROJECT-PRIVATE-95','ASSISTANT-PRIVATE-96']){
   assert(!system.includes(marker),`${marker} must never reach the provider`);
  }
 }finally{await d.closeFixture();}
}
console.log('✓ Memory lifecycle: supersede, expiry, forget, actual profile recall and scope isolation passed');
