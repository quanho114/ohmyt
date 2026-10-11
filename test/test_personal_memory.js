import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AppDatabase} from '../server/db.js';
import {ToolRegistry} from '../server/tools.js';
import {AgentLoop} from '../server/agent_loop.js';
import {PermissionEngine} from '../server/permissions.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-personal-memory-'));
let db=new AppDatabase(path.join(root,'app.db'));
try{
 const agent='default-assistant';
 db.createSession('first',agent,'First chat');db.createSession('second',agent,'Second chat');
 db.upsertAgent({id:'other-agent',name:'Other',avatar:'O',system_prompt:'Other',model_provider:'ollama',model_name:'fixture',temperature:.7});
 const tools=new ToolRegistry(db);
 const saved=await tools.get('memory_save').execute({category:'profile',content:'Cầu thủ bóng đá yêu thích của người dùng là Lionel Messi.'},{agentId:agent,scopeId:'standalone:first'});
 assert(saved.success);
 db.saveMemory('project',agent,'profile','Project secret marker','project:private');
 db.saveMemory('other','other-agent','profile','Other agent secret marker','standalone:other');
 db.saveMemory('legacy',agent,'profile','Legacy unassigned marker');
 const result=await tools.get('memory_search').execute({query:'cầu thủ'},{agentId:agent,scopeId:'standalone:second'});
 assert.equal(result.count,1);assert.match(result.memories[0].content,/Messi/);
 assert.deepEqual(db.searchMemories('Messi',5,agent,'project:private'),[]);
 assert.equal(db.getAllMemories(agent,'standalone:second').length,1);
 assert.equal(db.getAllMemories(agent,'project:private').length,1);
 db.close();db=new AppDatabase(path.join(root,'app.db'));
 assert.equal(db.searchMemories('thích',5,agent,'standalone:second').length,1,'saved memories survive restart and remain visible across chats');
 const registry=new ToolRegistry(db);
 const loop=new AgentLoop({db,tools:registry,permissions:new PermissionEngine(db),skills:{},llm:{streamChat:async({messages,onChunk})=>{
  assert.match(messages[0].content,/Lionel Messi/,'a generic recall question receives the saved profile even without matching keywords');
  assert.doesNotMatch(messages[0].content,/Project secret marker|Other agent secret marker|Legacy unassigned marker/);
  onChunk('Ông thích Lionel Messi.');return {completed:true};
 }}});
 await loop.run({runId:'recall',sessionId:'second',prompt:'Nhớ tui không?'});
 assert(db.getMessages('second').some(m=>m.sender==='agent'&&m.content.includes('Messi')));
 console.log('PASS personal memory: cross-chat search and prompt recall, persistence, project/agent/legacy boundaries');
}finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
