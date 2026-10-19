import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createDaemon} from '../../server/index.js';
for(const cut of ['reservation','effect','terminal','settled']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'goal-crash-'));let d;
 try{
  const child=spawnSync(process.execPath,['test/fixtures/harness/goal-crash.js',root,cut],{encoding:'utf8',timeout:15000});assert.equal(child.signal,'SIGKILL',child.stderr);
  const before=fs.existsSync(path.join(root,'effects'))?fs.readFileSync(path.join(root,'effects'),'utf8'):'';
  d=createDaemon({dbPath:path.join(root,'fixture.db'),dataDir:root,port:0,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:()=>{throw new Error('Recovery dispatched a request');}});}}}});await d.harness.ready;
  const goals=d.harness.goals,goal=goals.get('goal');assert.equal(goal.phase,'paused');assert.equal(goal.autoContinue,false);assert.equal(goal.roundsStarted,cut==='reservation'?0:1);assert.equal(goal.currentRound.status,cut==='reservation'?'not_admitted':cut==='effect'?'failed':'completed');
  assert.equal(goal.usage.used.requests,cut==='reservation'?0:cut==='effect'?1:2);assert.equal(goal.usage.used.tools,cut==='reservation'?0:1);
  await new Promise(r=>setTimeout(r,20));assert.equal(d.agentLoop.pendingRuns.size,0);assert.equal(fs.existsSync(path.join(root,'effects'))?fs.readFileSync(path.join(root,'effects'),'utf8'):'',before);assert.equal(before,cut==='reservation'?'':'one\n');
  if(cut==='effect')assert.equal(d.harness.sessions.outcome(goal.currentRound.runId).taskStatus,'unknown');
  assert.equal(d.db.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{if(d)await d.stop();fs.rmSync(root,{recursive:true,force:true});}
}
console.log('Four goal SIGKILL cuts: reserved/admitted effects/terminal/settled, durable root counters, no automatic replay');
