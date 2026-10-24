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
console.log('✓ Memory lifecycle: supersede lineage, expiry, soft forget, provenance, scope/assistant isolation and project gating passed');
