import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {AppDatabase} from '../../server/db.js';
import {Inbox} from '../../server/harness/inbox.js';
import test from 'node:test';

for(const timing of ['stream','approval','middleware','sibling'])test(`pending steering fences stale tool bodies during ${timing}`,async()=>{
  let d,requests=0,writes=0,consumed=0,toolUsage=0;
  const correction='Use the revised value instead of the original value';
  const enqueue=()=>d.harness.inbox.enqueue({sessionId:`steer-${timing}`,clientMessageId:'correction',kind:'steering',targetRunId:`steer-${timing}`,content:correction});
  d=await harnessFixture({tools:[
    {name:'old_write',parameters:{type:'object'},execute:()=>{writes++;return {saved:true};}},
    {name:'first_read',readOnly:true,exclusive:true,parameters:{type:'object'},execute:()=>{enqueue();return {observed:true};}},
    {name:'revised_write',parameters:{type:'object'},execute:()=>{consumed++;return {saved:true};}}
  ],stream:async o=>{
    if(++requests===1){
      if(timing==='sibling')o.onToolCall({id:'first',name:'first_read',arguments:{}});
      o.onToolCall({id:'stale',name:'old_write',arguments:{}});
      if(timing==='stream')enqueue();
    }else if(requests===2){
      assert(o.messages.some(m=>m.role==='user'&&m.content===correction));
      const receipt=o.messages.find(m=>m.role==='tool'&&m.tool_call_id==='stale');
      assert.equal(JSON.parse(receipt.content).code,'STEERING_PENDING');
      o.onToolCall({id:'revised',name:'revised_write',arguments:{}});
    }else {toolUsage=d.harness.runContexts.get(`steer-${timing}`).budget.used.tools;o.onChunk('Applied the revised request.');}
    return {completed:true};
  }});
  if(timing==='approval'){
    const authorize=d.harness.invocation.authorize;
    d.harness.invocation.authorize=async request=>{
      const decision=await authorize(request);
      if(request.call.id==='stale'){await Promise.resolve();enqueue();}
      return decision;
    };
  }
  if(timing==='middleware'){
    const pipeline=d.harness.invocation.pipeline;
    d.harness.invocation.pipeline=async(call,context,execute)=>{
      if(call.id==='stale')enqueue();
      return pipeline(call,context,execute);
    };
  }
  try{
    const result=await d.runFixture(`steer-${timing}`);
    assert.equal(writes,0,'No action based on superseded input may start');
    assert.equal(consumed,1);assert.equal(requests,3);
    assert.equal(toolUsage,timing==='sibling'?2:1,'Superseded tools consume no execution budget');
    assert.equal(result.run.status,'completed');
    assert(!d.harness.sessions.outcome(`steer-${timing}`).unresolvedCallIds.includes('stale'));
    const receipt=result.log.find(e=>e.type==='tool/result'&&e.payload.callId==='stale').payload;
    assert.equal(receipt.executionReceipt.bodyStarted,false);
    assert(!result.log.some(e=>e.type==='tool/start'&&e.payload.callId==='stale'));
    assert.equal(result.log.filter(e=>e.type==='control/consumed'&&e.payload.kind==='steering').length,1);
    assert.equal(result.history.filter(m=>m.role==='user'&&m.content===correction).length,1);
  }finally{await d.closeFixture();}
});

test('steering between nested PTC subcalls fences new effects without erasing started work',async()=>{
  let d,requests=0,writes=0,reads=0;
  const correction='Reconsider the remaining action';
  d=await harnessFixture({tools:[
    {name:'read_then_steer',readOnly:true,parameters:{type:'object'},execute:()=>{
      reads++;
      d.harness.inbox.enqueue({sessionId:'ptc-steering',clientMessageId:'nested-correction',kind:'steering',targetRunId:'ptc-steering',content:correction});
      return {observed:true};
    }},
    {name:'stale_nested_write',parameters:{type:'object'},execute:()=>{writes++;return {saved:true};}}
  ],stream:async o=>{
    if(++requests===1)o.onToolCall({id:'program',name:'ptc_execute',arguments:{code:"output(await tools.call('read_then_steer',{})); try {output(await tools.call('stale_nested_write',{}));} catch(error) {output(error.message);}"}});
    else {assert(o.messages.some(m=>m.role==='user'&&m.content===correction));o.onChunk('The read completed; the superseded write did not run.');}
    return {completed:true};
  }});
  try{
    assert.equal(d.harness.ptcStatus.available,true);
    const result=await d.runFixture('ptc-steering');
    assert.equal(reads,1);assert.equal(writes,0);assert.equal(requests,2);
    const receipts=result.log.filter(e=>e.type==='tool/result').map(e=>e.payload);
    assert.equal(receipts.find(r=>r.name==='read_then_steer').executionReceipt.bodyStarted,true);
    const stale=receipts.find(r=>r.name==='stale_nested_write');
    assert.equal(stale.executionReceipt.bodyStarted,false);
    assert.equal(JSON.parse(stale.modelContent).code,'STEERING_PENDING');
    assert.equal(receipts.find(r=>r.callId==='program').executionReceipt.bodyStarted,true);
    assert.equal(result.run.status,'completed');
  }finally{await d.closeFixture();}
});

for(const input of ['queued','other-run','other-session'])test(`${input} input does not fence the current tool body`,async()=>{
  let d,requests=0,writes=0,item;
  d=await harnessFixture({tools:[{name:'current_write',parameters:{type:'object'},execute:()=>{writes++;return {saved:true};}}],stream:async o=>{
    if(++requests===1){
      if(input==='other-session')d.db.createSession('elsewhere','fixture','Other chat');
      item=d.harness.inbox.enqueue({sessionId:input==='other-session'?'elsewhere':'scoped-steering',clientMessageId:'different-input',kind:input==='queued'?'queued':'steering',targetRunId:input==='other-run'?'another-run':'scoped-steering',content:'A different pending input'});
      o.onToolCall({id:'current',name:'current_write',arguments:{}});
    }else{
      assert.equal(writes,1);d.harness.inbox.cancelPending(item.id);o.onChunk('Current action completed.');
    }
    return {completed:true};
  }});
  try{
    const result=await d.runFixture('scoped-steering');
    assert.equal(writes,1);assert.equal(requests,2);assert.equal(result.run.status,'completed');
  }finally{await d.closeFixture();}
});

test('steering accepted inside an already-started mutation preserves its actual success',async()=>{
  let d,requests=0,writes=0;
  d=await harnessFixture({tools:[{name:'started_write',parameters:{type:'object'},execute:()=>{
    writes++;
    d.harness.inbox.enqueue({sessionId:'started-steering',clientMessageId:'after-start',kind:'steering',targetRunId:'started-steering',content:'Report what actually happened before doing more work'});
    return {saved:true};
  }}],stream:async o=>{
    if(++requests===1)o.onToolCall({id:'started',name:'started_write',arguments:{}});
    else {assert(o.messages.some(m=>m.role==='user'&&m.content==='Report what actually happened before doing more work'));o.onChunk('The already-started write succeeded.');}
    return {completed:true};
  }});
  try{
    const result=await d.runFixture('started-steering');
    assert.equal(writes,1);assert.equal(requests,2);
    const receipt=result.log.find(e=>e.type==='tool/result'&&e.payload.callId==='started').payload;
    assert.equal(receipt.status,'success');assert.equal(receipt.executionReceipt.bodyStarted,true);
  }finally{await d.closeFixture();}
});

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
