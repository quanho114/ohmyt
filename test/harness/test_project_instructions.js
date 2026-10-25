import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harnessFixture} from '../harness_fixture.js';
import {PermissionEngine} from '../../server/permissions.js';

let requests=[];
const d=await harnessFixture({stream:async({messages,onChunk})=>{
 requests.push(structuredClone(messages));onChunk('Ready');return {completed:true};
}});
try{
 d.permissions.evaluate=PermissionEngine.prototype.evaluate.bind(d.permissions);
 const root=path.join(d.fixtureRoot,'project');fs.mkdirSync(root);
 const instructions=path.join(root,'AGENTS.md');
 fs.writeFileSync(instructions,'Use npm. Preserve CURRENT-REPO-RULE-71.');
 d.db.addProject('guided','Guided project',root);
 const run=async(id,projectId='guided')=>{
  d.db.createSession(id,'fixture','Explicit instruction test',projectId);
  const start=requests.length;
  await d.agentLoop.run({runId:id,sessionId:id,prompt:'Explain this project convention'});
  return requests.slice(start).at(-1);
 };

 const first=await run('guidance-first');
 assert(JSON.stringify(first).includes('CURRENT-REPO-RULE-71'),'root AGENTS content reaches the actual model request automatically');
 assert(first.some(m=>m.role==='user'&&m.content==='Explain this project convention'));
 const events=d.harness.sessions.log.readAll('guidance-first');
 const intent=events.find(e=>e.type==='tool/call'&&e.payload.name==='fs_read');
 const receipt=events.find(e=>e.type==='tool/result'&&e.payload.callId===intent?.payload.callId);
 assert(intent&&receipt&&intent.seq<receipt.seq,'automatic reads retain canonical intent and receipt');
 assert.equal(receipt.payload.status,'success');
 assert.equal(receipt.payload.purpose,'project-instructions');
 assert.equal(d.harness.sessions.outcome('guidance-first').verificationStatus,'not_applicable','loading guidance does not claim task execution or verification');
 const callMessage=first.find(m=>m.tool_calls?.some(c=>c.id===intent.payload.callId));
 assert(callMessage&&first.some(m=>m.role==='tool'&&m.tool_call_id===intent.payload.callId),'provider tool groups remain complete');

 fs.writeFileSync(instructions,'Use npm. Preserve UPDATED-REPO-RULE-72.');
 const refreshed=await run('guidance-refreshed');
 assert(JSON.stringify(refreshed).includes('UPDATED-REPO-RULE-72'));
 assert(!JSON.stringify(refreshed).includes('CURRENT-REPO-RULE-71'),'fresh turns load the current file');

 d.db.setPolicy('fs_read:*','DENY');
 const denied=await run('guidance-denied');
 assert(!JSON.stringify(denied).includes('UPDATED-REPO-RULE-72'));
 assert(!d.harness.sessions.log.readAll('guidance-denied').some(e=>e.type==='tool/start'&&e.payload.name==='fs_read'));
 d.db.db.prepare('DELETE FROM tool_policies WHERE pattern=?').run('fs_read:*');

 d.db.setScopedPolicy('project:guided','fs_read:AGENTS.md','ASK');
 const needsApproval=await run('guidance-ask');
 assert(!JSON.stringify(needsApproval).includes('UPDATED-REPO-RULE-72'));
 assert.equal(d.permissions.getPendingRequests('guidance-ask').length,0,'automatic context never opens an unsolicited approval');
 d.db.db.prepare('DELETE FROM scoped_policies WHERE scope_id=? AND pattern=?').run('project:guided','fs_read:AGENTS.md');

 d.db.createSession('guidance-no-tools','fixture','Narrowed capabilities','guided');
 d.harness.profiles.save({id:'no-workspace-tools',version:1,plugins:[]},0);
 d.harness.profiles.select('no-workspace-tools',{sessionId:'guidance-no-tools'});
 await d.agentLoop.run({runId:'guidance-no-tools',sessionId:'guidance-no-tools',prompt:'Explain this project convention'});
 assert(!JSON.stringify(requests.at(-1)).includes('UPDATED-REPO-RULE-72'));
 assert(!d.harness.sessions.log.readAll('guidance-no-tools').some(e=>e.type==='tool/start'),'context loading cannot restore removed capabilities');

 const standalone=await run('guidance-standalone',null);
 assert(!JSON.stringify(standalone).includes('UPDATED-REPO-RULE-72'));

 const outside=path.join(d.fixtureRoot,'outside.md');fs.writeFileSync(outside,'OUTSIDE-PRIVATE-RULE-73');
 fs.unlinkSync(instructions);fs.symlinkSync(outside,instructions);
 const symlink=await run('guidance-symlink');
 assert(!JSON.stringify(symlink).includes('OUTSIDE-PRIVATE-RULE-73'));
 fs.unlinkSync(instructions);

 fs.writeFileSync(instructions,'OVERSIZED-RULE-74\n'+'x'.repeat(32769));
 const oversized=await run('guidance-oversized');
 assert(!JSON.stringify(oversized).includes('OVERSIZED-RULE-74'));
 assert(!d.harness.sessions.log.readAll('guidance-oversized').some(e=>e.type==='tool/start'&&e.payload.name==='fs_read'));

 fs.writeFileSync(instructions,'SANDBOX-ONLY-RULE-75');
 d.tools.sandbox.provider.status=()=>({available:false,reason:'Audit unavailable sandbox'});
 const unavailable=await run('guidance-unavailable');
 assert(!JSON.stringify(unavailable).includes('SANDBOX-ONLY-RULE-75'),'unavailable sandbox never falls back to host reads');
}finally{await d.closeFixture();}
console.log('Project AGENTS loading: provider context, canonical receipts, refresh, DENY, scope, symlinks, limits and unavailable sandbox passed');
