import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {AppDatabase} from '../../server/db.js';
import {SessionStore} from '../../server/harness/sessions.js';
for(const cut of ['intent','start','effect','abort-effect','receipt','before-final','after-final']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-crash-'));
 try{
  const child=spawnSync(process.execPath,['test/fixtures/harness/crash-cut.js',root,cut],{timeout:15000,encoding:'utf8'});assert.equal(child.signal,'SIGKILL',`${cut}: ${child.stderr}`);
  const db=new AppDatabase(path.join(root,'fixture.db')),store=new SessionStore(db);
  const effects=()=>fs.existsSync(path.join(root,'effects'))?fs.readFileSync(path.join(root,'effects'),'utf8'):'';
  const before=effects();const recovered=store.recoverInterrupted();assert.deepEqual(recovered,cut==='after-final'?[]:['r']);assert.deepEqual(store.recoverInterrupted(),[]);assert.equal(effects(),before,'recovery must never execute a mutation');
  const events=store.log.readAll('s'),receipt=events.find(e=>e.type==='tool/result'&&e.payload.executionReceipt)?.payload;
  assert(receipt);assert.equal(receipt.status,cut==='intent'?'cancelled':['start','effect','abort-effect'].includes(cut)?'unknown':'success');
  assert.equal(receipt.executionReceipt.bodyStarted,cut!=='intent');
  assert.equal(before, ['intent','start'].includes(cut)?'':'one\n');
  if(cut==='abort-effect')assert.equal(db.db.prepare('SELECT status FROM runs WHERE id=?').get('r').status,'aborted');
  assert.equal(events.filter(e=>e.type==='turn/end').length,1);assert(events.some(e=>e.type==='task/outcome'));
  const history=store.history('s');assert.equal(history.filter(m=>m.tool_call_id==='mutation').length,1);assert.equal(history.find(m=>m.tool_call_id==='mutation').content,receipt.modelContent);
  for(const start of events.filter(e=>e.type==='step/start'))assert(events.some(e=>e.type==='step/end'&&e.payload.stepId===start.payload.stepId));
  assert.equal(db.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
console.log('Seven real process-kill cuts: not-started/unknown/committed receipts, atomic final settlement and no duplicate effects');
