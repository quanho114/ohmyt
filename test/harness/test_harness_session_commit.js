import assert from 'node:assert/strict';
import {AppDatabase} from '../../server/db.js';
import {taskOutcome} from '../../server/harness/outcomes.js';
import {SessionStore} from '../../server/harness/sessions.js';
const db=new AppDatabase(':memory:'),store=new SessionStore(db);db.createSession('s',db.getAgents()[0].id,'Fixture');store.migrateHistory('s');db.createRun('r','s');db.addMessage('u','s','user','prompt');store.begin('r','s','u');
assert.equal(typeof store.completeTurn,'function','final events and UI require atomic completion');
assert.deepEqual(store.modelHistory('s').map(m=>m.content),['prompt'],'input must be durable at admission');
const input={runId:'r',messages:[{role:'user',content:'prompt'},{role:'assistant',content:'done'}],finalMessage:{role:'assistant',content:'done'},step:1,status:'completed',outcome:taskOutcome(),uiMessage:{id:'final',content:'done',metadata:{activity:{runId:'r'}}}};
const before=store.log.sequence('s'),original=db.addMessage.bind(db);db.addMessage=()=>{throw new Error('UI insert failed');};
assert.throws(()=>store.completeTurn(input),/UI insert/);assert.equal(store.log.sequence('s'),before);assert.equal(store.get('r').status,'running');assert.equal(db.db.prepare('SELECT status FROM runs WHERE id=?').get('r').status,'running');
assert.equal(store.outcome('r'),null);
db.addMessage=original;let emitted=0;store.log.on('event',()=>{assert.equal(db.db.isTransaction,false);emitted++;});store.completeTurn(input);assert(emitted>0);assert.deepEqual(store.outcome('r'),input.outcome);
assert.deepEqual(store.history('s').map(m=>m.content),['prompt','done']);const seq=store.log.sequence('s');store.completeTurn(input);assert.equal(store.log.sequence('s'),seq);assert.equal(db.getMessages('s').length,2);
// Durable canonical history is independent of the compatibility cache.
db.db.prepare("UPDATE harness_turns SET messages_json='[]' WHERE run_id='r'").run();assert.deepEqual(store.history('s').map(m=>m.content),['prompt','done']);
store.log.removeAllListeners('event');db.createRun('interrupted','s');db.addMessage('u2','s','user','mutation');store.begin('interrupted','s','u2');
const call={role:'assistant',content:'',tool_calls:[{id:'c',function:{name:'write',arguments:'{}'}}]};store.settle('interrupted',[{role:'user',content:'mutation'},call],1);
store.record('interrupted',{eventId:'receipt',type:'tool/result',payload:{turnId:'interrupted',callId:'c',name:'write',status:'success',modelContent:'{"written":true}'}});
assert.deepEqual(store.recoverInterrupted(),['interrupted']);assert.deepEqual(store.recoverInterrupted(),[]);assert.match(store.history('s').find(m=>m.tool_call_id==='c').content,/written/);
// Legacy snapshots never gain the new body-entry guarantee during migration.
db.createRun('legacy-crash','s');db.addMessage('legacy-input','s','user','Legacy write');
db.db.prepare('INSERT INTO harness_turns(run_id,session_id,user_message_id,messages_json,step,status,updated_at) VALUES(?,?,?,?,?,?,?)').run('legacy-crash','s','legacy-input',JSON.stringify([{role:'user',content:'Legacy write'},call]),1,'running',Date.now());
const legacyStore=new SessionStore(db);assert.equal(legacyStore.log.readAll('s').find(e=>e.type==='turn/start'&&e.payload.turnId==='legacy-crash').payload.executionProtocolVersion,1);
legacyStore.recoverInterrupted();assert.equal(legacyStore.log.readAll('s').find(e=>e.payload.turnId==='legacy-crash'&&e.payload.executionReceipt)?.payload.status,'unknown');
// The UI compatibility events do not carry canonical step identities. Repair
// two interrupted turns in one chat without inventing a shared undefined:end.
for(const runId of ['recovery-same-chat-1','recovery-same-chat-2']){
 db.createRun(runId,'s');db.addMessage('input-'+runId,'s','user','Interrupted work');store.begin(runId,'s','input-'+runId);
 store.record(runId,{eventId:runId+':compat-step',type:'step/start',payload:{turnId:runId,step:1}});
 store.record(runId,{eventId:runId+':canonical-step',type:'step/start',payload:{turnId:runId,stepId:runId+':step:1'}});
}
assert.deepEqual(store.recoverInterrupted().sort(),['recovery-same-chat-1','recovery-same-chat-2']);
assert(!store.log.readAll('s').some(e=>e.eventId==='undefined:end'));
for(const runId of ['recovery-same-chat-1','recovery-same-chat-2'])assert(store.log.readAll('s').some(e=>e.type==='step/end'&&e.payload.stepId===runId+':step:1'));
db.close();console.log('Atomic turn rollback, publication, admission, recovery and semantic cutover passed');
