import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harnessFixture} from '../harness_fixture.js';
import {PermissionEngine} from '../../server/permissions.js';
import {AppDatabase} from '../../server/db.js';
import {sessionTaskWorkflow} from '../../shared/task_workflow.js';

let writes=0;
const d=await harnessFixture({tools:[{name:'write_note',parameters:{type:'object',properties:{}},execute:()=>{
  fs.writeFileSync(path.join(d.fixtureRoot,'note.txt'),'human-approved');writes++;return {written:true};
}}],stream:async({messages,onToolCall,onChunk})=>{
  if(messages.some(m=>m.role==='user'&&m.content==='API safe'))onChunk('Ready');
  else if(!messages.slice(messages.findLastIndex(m=>m.role==='user')).some(m=>m.role==='tool'))onToolCall({id:'write',name:'write_note',arguments:{}});
  else onChunk('Finished');
  return {completed:true};
}});
// Use the production permission evaluator, including full mode and saved grants.
d.permissions.evaluate=PermissionEngine.prototype.evaluate.bind(d.permissions);
const file=path.join(d.fixtureRoot,'note.txt');
try{
  for(const mode of ['ask','auto','full']){
    const id=`guided-${mode}`;
    d.db.createSession(id,'fixture','Explicit title');
    d.db.db.prepare('UPDATE sessions SET workflow_id=?,approval_mode=? WHERE id=?').run('code-review',mode,id);
    d.db.setPolicy('write_note:*','ALLOW');
    for(const decision of ['DENY','ALLOW_ALWAYS','ALLOW_ONCE']){
      fs.rmSync(file,{force:true});const before=writes;
      const runId=`${id}-${decision}`;
      let release;
      const pending=new Promise(resolve=>{release=resolve;});
      let automaticReview=false;
      const listener=event=>{
        if(event.runId!==runId)return;
        if(event.type==='ApprovalReviewed')automaticReview=true;
        if(event.type==='PermissionRequired')release(event.payload.requestId);
      };
      d.agentLoop.on('event',listener);
      const running=d.agentLoop.run({runId,sessionId:id,prompt:'Make the proposed change'});
      const requestId=await Promise.race([pending,running.then(()=>{throw Error('Mutation completed without human review');})]);
      assert.equal(fs.existsSync(file),false,'No write before the human answers');
      assert.equal(writes,before);
      d.permissions.resolveApproval(requestId,decision);
      await running;d.agentLoop.off('event',listener);
      assert.equal(automaticReview,false,'An AI reviewer cannot approve guided mutations');
      assert.equal(fs.existsSync(file),decision!=='DENY');
      assert.equal(writes,before+(decision==='DENY'?0:1));
    }
  }
  d.db.createSession('parent','fixture','Parent');
  d.db.createSession('child','fixture','Child');
  d.db.db.prepare('UPDATE sessions SET workflow_id=? WHERE id=?').run('email-draft','parent');
  d.db.db.prepare('UPDATE sessions SET harness_parent_session_id=? WHERE id=?').run('parent','child');
  assert.equal(sessionTaskWorkflow(d.db,d.db.getSession('child')),'email-draft');
  // A child cannot evade the parent's human review by using its own session.
  d.db.db.prepare('UPDATE sessions SET approval_mode=? WHERE id=?').run('full','child');
  fs.rmSync(file,{force:true});
  const denyChild=event=>{if(event.runId==='child-write'&&event.type==='PermissionRequired')d.permissions.resolveApproval(event.payload.requestId,'DENY');};
  d.agentLoop.on('event',denyChild);
  await d.agentLoop.run({runId:'child-write',sessionId:'child',prompt:'Make the proposed change'});
  d.agentLoop.off('event',denyChild);assert.equal(fs.existsSync(file),false);
  // Explicit DENY wins; a guided task must not offer an approval bypass.
  d.db.setPolicy('write_note:*','DENY');let approvalCount=0;
  const count=event=>{if(event.runId==='policy-deny'&&event.type==='PermissionRequired')approvalCount++;};
  d.agentLoop.on('event',count);
  await d.agentLoop.run({runId:'policy-deny',sessionId:'parent',prompt:'Make the proposed change'});
  d.agentLoop.off('event',count);assert.equal(approvalCount,0);assert.equal(fs.existsSync(file),false);

  const {port}=await d.start();
  d.db.createSession('api-task','fixture','API title');
  const request=async workflowId=>fetch(`http://127.0.0.1:${port}/api/runs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'api-task',prompt:'API safe',workflowId})});
  for(const invalid of [null,'full-access',{},['email-draft']])assert.equal((await request(invalid)).status,400);
  assert.equal(d.db.getSession('api-task').workflow_id,null);
  assert.equal((await request('email-draft')).status,202);
  assert.equal(d.db.getSession('api-task').workflow_id,'email-draft');
  await d.agentLoop.drain('Test finished');

  const dbPath=path.join(d.fixtureRoot,'persistent.db');
  let db=new AppDatabase(dbPath);
  db.createSession('persist','default-assistant','Persist');
  db.db.prepare('UPDATE sessions SET workflow_id=? WHERE id=?').run('document-summary','persist');
  db.close();db=new AppDatabase(dbPath);
  assert.equal(db.getSession('persist').workflow_id,'document-summary');
  db.createSession('branch','default-assistant','Branch');db.branchSession('branch','persist',null);
  assert.equal(db.getSession('branch').workflow_id,'document-summary');db.close();
  console.log('PASS guided tasks: real file writes wait for humans in ask/auto/full; denial, saved grants, child inheritance, API validation, restart and branches');
}finally{await d.closeFixture();}
await import('./test_task_turn_intent.js');
