import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const full='HEAD '+ 'evidence '.repeat(4000)+'TAIL-EVIDENCE-927';let bodies=0,range;
const daemon=await harnessFixture({tools:[{name:'long_observation',parameters:{type:'object',properties:{},additionalProperties:false},execute:()=>{bodies++;return full;}}],stream:async options=>{
 const results=options.messages.filter(message=>message.role==='tool');
 if(!results.length)options.onToolCall({id:'source',name:'long_observation',arguments:{}});
 else if(results.length===1){
  assert(options.tools.some(tool=>tool.name==='artifact_read'),'A truncated observation must be inspectable without repeating its source tool');
  const artifactId=results[0].content.match(/Full output artifact: ([a-f0-9-]+)/)?.[1];assert(artifactId);
  options.onToolCall({id:'range-head',name:'artifact_read',arguments:{artifactId,offset:0,limit:80}});
 }else if(results.length===2){
  const head=JSON.parse(results.at(-1).content);
  options.onToolCall({id:'range-tail',name:'artifact_read',arguments:{artifactId:head.artifactId,offset:head.totalCharacters-80,limit:80}});
 }else{range=JSON.parse(results.at(-1).content);options.onChunk(range.content);}
 return {completed:true};
}});
try{
 const result=await daemon.runFixture('read-artifact');assert.equal(result.run.status,'completed',result.messages.at(-1)?.content);assert.equal(bodies,1);assert(range.content.endsWith('TAIL-EVIDENCE-927'));assert.equal(range.nextOffset,null);assert.equal(range.totalCharacters,full.length);
 assert.equal(result.messages.at(-1).content,full.slice(-80));
 const artifactId=result.log.find(event=>event.type==='artifact/update').payload.artifactId;
 daemon.db.createSession('foreign','fixture','Foreign chat');daemon.db.createRun('foreign-run','foreign');daemon.db.addMessage('foreign-user','foreign','user','Read another chat');daemon.harness.sessions.begin('foreign-run','foreign','foreign-user');
 const scope={scopeId:'standalone:foreign',sessionId:'foreign'},runTools=daemon.tools.forStandalone(scope);
 daemon.harness.runContexts.set('foreign-run',{runId:'foreign-run',sessionId:'foreign',agentId:'fixture',scope,runTools,capabilities:[...runTools.tools.keys()],signal:new AbortController().signal});
 const denied=await daemon.harness.invokeTool({id:'foreign',name:'artifact_read',arguments:{artifactId}},runTools,{runId:'foreign-run'});
 assert.equal(denied.status,'error');assert(!denied.modelContent.includes('TAIL-EVIDENCE-927'));
 const invalid=await daemon.harness.invokeTool({id:'negative',name:'artifact_read',arguments:{artifactId,offset:-1}},runTools,{runId:'foreign-run'});assert.equal(invalid.output.code,'INVALID_ARGS');assert.equal(invalid.executionReceipt.bodyStarted,false);
 daemon.db.createRun('own-range','read-artifact');daemon.db.addMessage('own-user','read-artifact','user','Read ranges');daemon.harness.sessions.begin('own-range','read-artifact','own-user');
 const ownScope={scopeId:'standalone:read-artifact',sessionId:'read-artifact'},ownTools=daemon.tools.forStandalone(ownScope);
 daemon.harness.runContexts.set('own-range',{runId:'own-range',sessionId:'read-artifact',agentId:'fixture',scope:ownScope,runTools:ownTools,capabilities:[...ownTools.tools.keys()],signal:new AbortController().signal});
 const unicode=daemon.harness.artifacts.save({sessionId:'read-artifact',scopeId:ownScope.scopeId,title:'Unicode.txt',mime:'text/plain',content:'A😀B漢字'});
 const read=async(id,offset,limit=2)=>(await daemon.harness.invokeTool({id,name:'artifact_read',arguments:{artifactId:unicode.artifactId,offset,limit}},ownTools,{runId:'own-range'})).output;
 assert.equal((await read('first-page',0)).content,'A');const second=await read('second-page',1);assert.equal(second.content,'😀');assert.equal(second.nextOffset,3);
 assert.equal((await read('middle-pair',2)).content,'😀','Offsets inside a Unicode pair return the intact character');
 assert.equal((await read('past-end',100)).content,'');assert.equal((await read('past-end-next',100)).nextOffset,null);
 const search=await daemon.harness.invokeTool({id:'query-tail',name:'artifact_read',arguments:{artifactId,query:'TAIL-EVIDENCE-927',limit:300}},ownTools,{runId:'own-range'});
 assert.equal(search.status,'success');assert(search.output.found);assert(search.output.content.includes('TAIL-EVIDENCE-927'));assert(search.output.content.length<=300);
 const foreignSearch=await daemon.harness.invokeTool({id:'foreign-query',name:'artifact_read',arguments:{artifactId,query:'TAIL-EVIDENCE-927'}},runTools,{runId:'foreign-run'});
 assert.equal(foreignSearch.status,'error');assert(!foreignSearch.modelContent.includes('TAIL-EVIDENCE-927'));
 daemon.harness.runContexts.clear();
 console.log('PASS artifact ranges recover omitted evidence once, remain bounded and enforce chat scope');
}finally{daemon.harness.runContexts.clear();await daemon.closeFixture();}
