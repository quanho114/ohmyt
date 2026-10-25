import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harnessFixture} from '../harness_fixture.js';
import {PermissionEngine} from '../../server/permissions.js';

for(const scenario of ['success','denied','changed','guided','approval-race','cancelled']){
 let file,submitted=false,approvals=0;
 const d=await harnessFixture({stream:async({messages,onToolCall,onChunk})=>{
  const read=messages.findLast(m=>m.role==='tool'&&m.name==='fs_read');
  if(!read)onToolCall({id:'read-code',name:'fs_read',arguments:{path:'module.js'}});
  else if(!submitted){
   submitted=true;
   if(scenario==='changed')fs.writeFileSync(file,'user change\n');
   onToolCall({id:'edit-code',name:'fs_edit',arguments:{path:'module.js',expectedHash:JSON.parse(read.content).sha256,oldText:'return 1;',newText:'return 2;'}});
  }else onChunk('Report actual tool results.');
  return {completed:true};
 }});
 try{
  d.permissions.evaluate=PermissionEngine.prototype.evaluate.bind(d.permissions);
  const root=path.join(d.fixtureRoot,'project');fs.mkdirSync(root);
  file=path.join(root,'module.js');const original='export function value() { return 1; }\n';fs.writeFileSync(file,original);
  d.db.addProject('edits','Edits',root);d.db.createSession('edit-session','fixture','Explicit edit test','edits');
  if(scenario==='denied')d.db.setPolicy('fs_write:*','DENY');
  if(['guided','approval-race','cancelled'].includes(scenario)){
   d.db.db.prepare('UPDATE sessions SET workflow_id=?,approval_mode=? WHERE id=?').run('code-review','full','edit-session');
  }
  d.agentLoop.on('event',event=>{
   if(event.type!=='PermissionRequired')return;
   approvals++;assert.equal(event.payload.toolName,'fs_edit');
   assert.equal(fs.readFileSync(file,'utf8'),original,'no change before human approval');
   if(scenario==='approval-race')fs.writeFileSync(file,'changed during approval\n');
   if(scenario==='cancelled')d.agentLoop.abortRun('edit-run');
   else d.permissions.resolveApproval(event.payload.requestId,'ALLOW_ONCE');
  });
  await d.agentLoop.run({runId:'edit-run',sessionId:'edit-session',prompt:'Update value to return 2'});
  const events=d.harness.sessions.log.readAll('edit-session');
  const intent=events.find(e=>e.type==='tool/call'&&e.payload.callId==='edit-code');
  const receipt=events.find(e=>e.type==='tool/result'&&e.payload.callId==='edit-code');
  assert(receipt,'every attempted edit has a durable canonical result');
  const expected=scenario==='changed'?'user change\n':scenario==='approval-race'?'changed during approval\n':['success','guided'].includes(scenario)?'export function value() { return 2; }\n':original;
  assert.equal(fs.readFileSync(file,'utf8'),expected);
  if(['success','guided'].includes(scenario)){
   assert(intent&&intent.seq<receipt.seq);assert.equal(receipt.payload.status,'success');
   assert.equal(receipt.payload.executionReceipt.bodyStarted,true);
   const output=JSON.parse(receipt.payload.modelContent);assert(output.diff.includes('+export function value() { return 2; }'));assert(output.applied);
   assert.notEqual(d.harness.sessions.outcome('edit-run').verificationStatus,'verified','successful mutation is not task verification');
  }else if(['changed','approval-race'].includes(scenario)){
   assert.equal(receipt.payload.status,'error','known conflict is not an unknown mutation outcome');
   assert.equal(JSON.parse(receipt.payload.modelContent).code,'FILE_CHANGED');
  }else{
   assert(!receipt.payload.executionReceipt.bodyStarted);
  }
  assert.equal(approvals,['guided','approval-race','cancelled'].includes(scenario)?1:0);
  assert.equal(d.permissions.getPendingRequests('edit-run').length,0);
 }finally{await d.closeFixture();}
}
console.log('File edit pipeline: durable receipts, write DENY, human-review race, cancellation and no false verification passed');
