import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {AppDatabase} from '../../server/db.js';
import {Inbox} from '../../server/harness/inbox.js';

for(const cancelled of [false,true]){
  const entered=Promise.withResolvers(),release=Promise.withResolvers();let requests=0;
  const correction='Trả lời lại bằng tiếng Việt';
  const d=await harnessFixture({stream:async o=>{
    if(++requests===1){entered.resolve();await release.promise;o.onChunk('Original answer');}
    else {assert(o.messages.some(m=>m.role==='user'&&m.content===correction));o.onChunk('Câu trả lời đã điều chỉnh.');}
    return {completed:true};
  }});
  let task;
  try {
    const address=await d.start(),base=`http://127.0.0.1:${address.port}/api`;
    task=d.runFixture('late','Original question');await entered.promise;
    const response=await fetch(base+'/sessions/late/inbox',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({clientMessageId:'late-correction',kind:'steering',content:correction})});
    assert.equal(response.status,202);const item=await response.json();
    if(cancelled)d.agentLoop.abortRun('late');release.resolve();await task;
    // The production queue dispatches the retained item after ownership drains.
    while(d.agentLoop.pendingRuns.size)await Promise.allSettled([...d.agentLoop.pendingRuns]);
    const saved=d.harness.inbox.get(item.id);
    if(cancelled){assert.equal(saved.status,'cancelled');assert.equal(requests,1);}
    else {
      assert.equal(saved.status,'consumed');assert.equal(requests,2);
      const history=d.harness.sessions.history('late');
      assert.equal(history.filter(m=>m.role==='user'&&m.content===correction).length,1);
      assert.equal(history.at(-1).content,'Câu trả lời đã điều chỉnh.');
      const updates=d.harness.sessions.log.readAll('late').filter(e=>e.type==='control/updated'&&e.payload.inboxId===item.id);
      assert(updates.some(e=>e.payload.kind==='queued'&&e.payload.targetRunId===null));
      const retry=await fetch(base+'/sessions/late/inbox',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({clientMessageId:'late-correction',kind:'steering',content:correction})});
      assert.equal(retry.status,202,'Retrying an accepted steering request must return its receipt even after conversion/settlement');
      assert.equal((await retry.json()).id,item.id);assert.equal(requests,2,'A submission retry cannot restart work');
    }
  } finally {release.resolve();await task;await d.closeFixture();}
}
// Upgrade the pre-fingerprint schema without losing a pending submission or
// making its first mode transition change the original idempotency contract.
const db=new AppDatabase(':memory:');
try {
  db.createSession('legacy','default-assistant','Legacy inbox');
  db.db.exec("CREATE TABLE harness_inbox(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,client_message_id TEXT NOT NULL,kind TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',created_at INTEGER NOT NULL,UNIQUE(session_id,client_message_id)); INSERT INTO harness_inbox VALUES('old','legacy','client-old','queued','Original request','queued',1)");
  const inbox=new Inbox(db);
  inbox.setPendingKind('old','steering','active');
  const replay={sessionId:'legacy',clientMessageId:'client-old',kind:'queued',content:'Original request'};
  assert.equal(inbox.enqueue(replay).id,'old');
  assert.throws(()=>inbox.enqueue({...replay,kind:'steering'}),/collision/);
  assert.throws(()=>inbox.enqueue({...replay,content:'Different request'}),/collision/);
  inbox.settleSteering('active');
  assert.equal(inbox.enqueue(replay).id,'old');
  assert.equal(inbox.list('legacy').length,1);
  db.db.prepare("INSERT INTO harness_inbox(id,session_id,client_message_id,kind,content,created_at) VALUES('old-edit','legacy','client-edit','queued','Before edit',2)").run();
  inbox.editPending('old-edit','After edit');
  assert.equal(inbox.enqueue({sessionId:'legacy',clientMessageId:'client-edit',kind:'queued',content:'Before edit'}).content,'After edit');
} finally {db.close();}
console.log('Accepted late steering continues exactly once; explicit stop cancels it without restarting work');
