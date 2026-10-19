import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {taskOutcome} from '../../server/harness/outcomes.js';

let step=0,sourceId;
const d=await harnessFixture({stream:async o=>{
  if(o.runId==='parallel-sources'){
    if(!o.messages.some(m=>m.role==='tool'))for(const suffix of ['a','b'])o.onToolCall({id:suffix,name:'web_fetch',arguments:{url:'https://example.org/'+suffix}});
    else o.onChunk('Both sources were read. [A](https://example.org/a) [B](https://example.org/b)');
    return {completed:true};
  }
  if(o.runId==='long-source'){
    if(!o.messages.some(m=>m.role==='tool'))o.onToolCall({id:'long',name:'web_fetch',arguments:{url:'https://example.org/long'}});
    else o.onChunk('The saved snapshot contains the requested marker. [Source](https://example.org/long)');
    return {completed:true};
  }
  step++;
  if(step===1)o.onToolCall({id:'source',name:'web_fetch',arguments:{url:'https://example.org/code.js'}});
  else if(step===2){
    const result=JSON.parse(o.messages.find(m=>m.tool_call_id==='source').content);
    assert.equal(result.source.url,'https://example.org/code.js');assert.equal(result.source.coverage,'http_response');
    assert.match(result.source.contentSha256,/^[0-9a-f]{64}$/);sourceId=result.source.id;
    o.onToolCall({id:'sources',name:'source_list',arguments:{}});
  }else if(step===3){
    const result=JSON.parse(o.messages.find(m=>m.tool_call_id==='sources').content);
    assert.equal(result.sources.length,1);assert.equal(result.sources[0].id,sourceId);
    o.onToolCall({id:'lookup',name:'source_read',arguments:{sourceId,query:'return a + b',limit:150}});
  }else{
    const result=JSON.parse(o.messages.find(m=>m.tool_call_id==='lookup').content);
    assert(result.found);assert.match(result.content,/return a \+ b/);assert.equal(result.source.id,sourceId);
    o.onChunk('The implementation returns a + b. [Source](https://example.org/code.js)');
  }
  return {completed:true};
}});
try{
  assert(d.tools.get('web_fetch'),'a direct source reader must be available');
  let fetches=0;
  d.tools.webReader={read:async(url)=>{fetches++;return {url,requestedUrl:url,title:'code.js',content:'export function sum(a, b) {\n  return a + b;\n}',contentType:'text/plain',httpStatus:200,totalCharacters:44,truncated:false};}};
  const run=await d.runFixture('research');assert.equal(run.run.status,'completed');assert.equal(fetches,1);
  const receipt=run.log.find(e=>e.type==='tool/result'&&e.payload.callId==='source').payload;
  assert.equal(receipt.executionReceipt.source.id,sourceId);
  const sourceRead=d.tools.get('source_read'),sourceList=d.tools.get('source_list');
  // Retrieval uses persisted canonical receipts, so releasing an invocation or
  // forgetting its model context does not require fetching again.
  const context={sessionId:'research',scopeId:'standalone:research'};
  assert.match((await sourceRead.execute({sourceId,query:'sum'},context)).content,/sum/);
  assert.equal(fetches,1);
  d.db.createSession('foreign','fixture','Foreign');
  assert.equal((await sourceList.execute({}, {sessionId:'foreign',scopeId:'standalone:foreign'})).sources.length,0);
  await assert.rejects(sourceRead.execute({sourceId},{sessionId:'foreign',scopeId:'standalone:foreign'}),/unavailable/i);
  assert.equal((await sourceList.execute({}, {...context,scopeId:'project:foreign'})).sources.length,0);
  const failed={callId:'missing',name:'browser_use_navigate',status:'error',output:{code:'NO_ALLOWED_TAB',recovery:{mutationOutcomeUnknown:false,requestedUrl:'https://example.org/code.js'}}};
  const observed={callId:'read',name:'browser_read',status:'success',executionReceipt:{source:receipt.executionReceipt.source}};
  assert.deepEqual(taskOutcome({results:[failed,observed]}).unresolvedCallIds,[],'a later read of the exact intended URL resolves missing-tab navigation across browser backends');
  assert.deepEqual(taskOutcome({results:[failed,{...observed,executionReceipt:{source:{...receipt.executionReceipt.source,url:'https://example.org/other'}}}]}).unresolvedCallIds,['missing']);
  assert.deepEqual(taskOutcome({results:[{...failed,status:'unknown'},observed]}).unresolvedCallIds,['missing']);
  assert.deepEqual(taskOutcome({results:[observed,failed]}).unresolvedCallIds,['missing'],'prior observation cannot resolve a later missing tab');
  const longText='Evidence line\n'.repeat(2500)+'\nEXACT-MARKER-93: verified fixture value\n';
  d.tools.webReader={read:async url=>({url,content:longText,contentType:'text/plain',truncated:false})};
  const longRun=await d.runFixture('long-source');
  const longReceipt=longRun.log.find(e=>e.type==='tool/result'&&e.payload.callId==='long').payload;
  assert(longReceipt.artifactRefs.length,'full output must be persisted when model content is pruned');
  const longSource=await sourceRead.execute({sourceId:longReceipt.executionReceipt.source.id,query:'EXACT-MARKER-93',limit:200},{sessionId:'long-source',scopeId:'standalone:long-source'});
  assert(longSource.found);assert.match(longSource.content,/verified fixture value/);
  let active=0,maxActive=0;
  d.tools.webReader={read:async url=>{
    active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,20));active--;
    return {url,content:'Independent source '+url,contentType:'text/plain',truncated:false};
  }};
  assert.equal((await d.runFixture('parallel-sources')).run.status,'completed');
  assert.equal(maxActive,2,'independent public source reads should use the existing bounded parallel scheduler');
  d.db.deleteMessage(run.messages.find(message=>message.sender==='user').id);
  assert.equal((await sourceList.execute({},context)).sources.length,0,'deleting the source turn removes its observed-source index');
  await assert.rejects(sourceRead.execute({sourceId},context),/unavailable/i);
  console.log('PASS source provenance: canonical persistence, bounded lookup, no refetch, scope isolation and exact browser recovery');
}finally{await d.closeFixture();}
