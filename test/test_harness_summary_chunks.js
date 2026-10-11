import assert from 'node:assert/strict';
import {harnessFixture} from './harness_fixture.js';
import {RunBudget} from '../server/harness/budgets.js';
let seen=[],main=[],cancelAfter=Infinity;const controller=new AbortController();
const d=await harnessFixture({config:{contextTokens:2200,reserveTokens:200},stream:async options=>{
 assert(options.accounting.tokens<=2000,'every dispatch fits the configured window');
 if(options.purpose==='summary'){
  const chunk=options.messages.find(m=>m.role==='user').content;seen.push(chunk);
  if(seen.length===cancelAfter){controller.abort();return {completed:true};}
  const facts=chunk.includes('TRACK-903-Z')?'Identifier TRACK-903-Z, limit 37.':chunk.includes('END-REF-71')?'Artifact END-REF-71.':'Routine work.';
  options.onChunk(JSON.stringify({facts,decisions:[],openTasks:chunk.includes('Validate totals')?['Validate totals']:[],permissionBoundaries:['No extra permissions'],artifactRefs:chunk.includes('END-REF-71')?['END-REF-71']:[]}));
 }else{main.push(options.messages);options.onChunk('Final');}
 return {completed:true,usage:{inputTokens:1,outputTokens:1}};
}});
try{
 const host=d.harness;host.tokenCounters.register('fixture/fixture',request=>({tokens:JSON.stringify(request).length,accuracy:'exact',source:'fixture-characters'}));
 d.db.createSession('long','fixture','Long history');d.db.addMessage('anchor','long','user','Tracking identifier TRACK-903-Z, numeric limit 37. Validate totals.');
 d.db.addMessage('big','long','agent','Routine work. '.repeat(700));d.db.addMessage('end','long','user','Artifact END-REF-71');d.db.addMessage('ack','long','agent','Acknowledged');host.sessions.migrateHistory('long');
 d.db.createRun('r','long');d.db.addMessage('current','long','user','Current objective');host.sessions.begin('r','long','current');
 const budget=new RunBudget({requests:30});host.runContexts.set('r',{runId:'r',sessionId:'long',scope:{scopeId:'standalone'},budget,config:host.config});
 const source=[{role:'system',content:'Trusted instruction'},...host.sessions.history('long')];
 const request=(messages=source,step=1)=>host.request({runId:'r',sessionId:'long',providerId:'fixture',modelId:'fixture',messages,tools:[],currentTurnStart:source.length-1,step,signal:controller.signal,onChunk:()=>{}});
 await request();assert(seen.length>1);assert.equal(seen.join(''),JSON.stringify(source.slice(1,-1)),'all old source bytes covered exactly once');
 const checkpoint=host.sessions.log.readAll('long').find(e=>e.type==='context/summary'&&e.payload.version===2).payload;
 assert.equal(checkpoint.summaryChunks,seen.length);assert.match(checkpoint.facts,/TRACK-903-Z/);assert.deepEqual(checkpoint.openTasks,['Validate totals']);assert.deepEqual(checkpoint.artifactRefs,['END-REF-71']);
 assert.match(main[0].find(m=>m.role==='user').content,/TRACK-903-Z/);assert(main[0].some(m=>m.content==='Current objective'));
 const count=seen.length;await request(source,2);assert.equal(seen.length,count,'chunk summaries reused as one committed checkpoint');assert.equal(budget.used.requests,count+2);
 cancelAfter=seen.length+2;const changed=source.map((m,i)=>i===2?{...m,content:m.content+' changed'}:m);await assert.rejects(request(changed,3));assert.equal(host.sessions.log.readAll('long').filter(e=>e.type==='context/summary'&&e.payload.version===2).length,1,'no partial checkpoint after cancellation of a later chunk');
}finally{d.harness.runContexts.delete('r');await d.closeFixture();}
console.log('Oversized history chunks: complete source coverage, bounded admission, identifiers/tasks/artifacts retained, reuse and atomic cancellation passed');
