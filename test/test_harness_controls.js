import assert from 'node:assert/strict';
import {AppDatabase} from '../server/db.js';
import {Inbox} from '../server/harness/inbox.js';
const db=new AppDatabase(':memory:');db.createSession('s',db.getAgents()[0].id,'Inbox');
const inbox=new Inbox(db);const item=inbox.enqueue({sessionId:'s',clientMessageId:'m',kind:'steering',content:'Check tests first'});
assert.equal(inbox.enqueue({sessionId:'s',clientMessageId:'m',kind:'steering',content:'Check tests first'}).id,item.id);
assert.throws(()=>inbox.enqueue({sessionId:'s',clientMessageId:'m',kind:'queued',content:'different'}),/collision/);
inbox.editPending(item.id,'Run tests');assert.equal(inbox.consume('s','steering')[0].content,'Run tests');assert.equal(inbox.consume('s','steering').length,0);assert.throws(()=>inbox.editPending(item.id,'late'),/pending/);
const queued=inbox.enqueue({sessionId:'s',clientMessageId:'q',kind:'queued',content:'Next task'});inbox.setPendingKind(queued.id,'steering','run-active');assert.equal(inbox.get(queued.id).targetRunId,'run-active');inbox.setPendingKind(queued.id,'queued');assert.equal(inbox.get(queued.id).targetRunId,null);inbox.cancelPending(queued.id);assert.throws(()=>inbox.setPendingKind(queued.id,'steering','run-active'),/pending/);assert.equal(inbox.list('s').length,0);db.close();console.log('Durable inbox dedupe and consume races passed');
