import assert from 'node:assert/strict';
import {createDaemon} from '../server/index.js';
const d=createDaemon({dbPath:':memory:',port:0});await d.harness.ready;
try{
 assert.equal(typeof d.agentLoop.sendInboxNow,'function');
 d.db.createSession('s',d.db.getAgents()[0].id,'Fixture');
 const first=d.harness.inbox.enqueue({sessionId:'s',clientMessageId:'first',kind:'queued',content:'first'});
 const chosen=d.harness.inbox.enqueue({sessionId:'s',clientMessageId:'chosen',kind:'queued',content:'chosen'});
 let aborted=false,pumped=false;
 d.harness.agents.handles.set('fixture',{sessionId:'s',runId:'active',state:'running',abort(){aborted=true;}});
 d.agentLoop.pumpInbox=()=>{pumped=true;};
 d.agentLoop.sendInboxNow('s',chosen.id);
 assert.equal(aborted,true);assert.equal(pumped,true);assert.equal(d.harness.inbox.list('s')[0].id,chosen.id);assert.equal(d.harness.inbox.get(first.id).status,'queued');
 d.harness.agents.handles.clear();
 let legacyAbort=false;
 d.agentLoop.activeRuns.set('legacy',{sessionId:'s',abortController:new AbortController()});
 d.agentLoop.abortRun=()=>{legacyAbort=true;return true;};
 d.agentLoop.sendInboxNow('s',first.id);assert.equal(legacyAbort,true,'active run must be cancelled even before its handle is discoverable');
 d.agentLoop.activeRuns.clear();
}finally{d.harness.agents.handles.clear();await d.stop();}
console.log('Send now aborts active task and prioritizes chosen queued message');
