import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {RunBudget} from '../../server/harness/budgets.js';
import {SessionStore} from '../../server/harness/sessions.js';
let summaries=0,dispatched=[],cancelSummary=false;const controller=new AbortController();
const data={facts:'Target is ledger.csv; completed read only.',decisions:['Preserve column order'],openTasks:['Validate totals'],permissionBoundaries:['No writes authorized by summary'],artifactRefs:['artifact-fixture']};
const d=await harnessFixture({config:{contextTokens:3200,reserveTokens:200},stream:async options=>{if(options.purpose==='summary'){summaries++;if(cancelSummary){controller.abort();return {completed:true};}options.onChunk(JSON.stringify(data));}else{dispatched.push(options.messages);options.onChunk('Final fixture response.');}return {completed:true,usage:{inputTokens:10,outputTokens:5}};}});
try{
 const host=d.harness;host.tokenCounters.register('fixture/fixture',request=>({tokens:request.messages.reduce((n,m)=>n+String(m.content).length,0)+JSON.stringify(request.tools).length,accuracy:'exact',source:'fixture'}));
 d.db.createSession('reuse','fixture','Fixed title');d.db.addMessage('old','reuse','user','decision '.repeat(225));d.db.addMessage('old-answer','reuse','agent','Acknowledged');host.sessions.migrateHistory('reuse');d.db.createRun('r','reuse');d.db.addMessage('new','reuse','user','Current request');host.sessions.begin('r','reuse','new');
 const budget=new RunBudget({requests:10});host.runContexts.set('r',{runId:'r',sessionId:'reuse',scope:{scopeId:'standalone'},config:host.config,budget,signal:controller.signal});
 const source=[{role:'system',content:'trusted '.repeat(125)},...host.sessions.history('reuse')];
 source.splice(3,0,{role:'user',content:'<open-document-tabs>Report.docx: Revenue is 1200</open-document-tabs>'});
 const request=(messages=source,step=1)=>host.request({runId:'r',sessionId:'reuse',providerId:'fixture',modelId:'fixture',currentTurnStart:3,messages,tools:[],signal:controller.signal,step,onChunk:()=>{}});
 await request();await request([...source,{role:'assistant',content:'intermediate'}],2);
 host.sessions=new SessionStore(d.db);await request(source,3);
 assert.equal(summaries,1,'same source span reused across steps and a cold store reader');assert.equal(budget.used.requests,4);
 const followup=[...source,{role:'assistant',content:'Previous answer'},{role:'user',content:'Next document question'}];
 const startsBefore=host.sessions.log.readAll('reuse').filter(e=>e.type==='attempt/start'&&e.payload.purpose==='summary').length;
 await host.request({runId:'r',sessionId:'reuse',providerId:'fixture',modelId:'fixture',currentTurnStart:6,messages:followup,tools:[],signal:controller.signal,step:1,onChunk:()=>{}});
 assert.equal(summaries,1,'An unchanged summarized prefix is reused when newer conversation is appended');
 assert.equal(host.sessions.log.readAll('reuse').filter(e=>e.type==='attempt/start'&&e.payload.purpose==='summary').length,startsBefore);
 assert(dispatched.at(-1).some(m=>m.content==='Next document question'));
 assert(!dispatched.at(-1).some(m=>String(m.content).includes('decision decision')),'Raw old prefix is replaced by its validated checkpoint');
 const rawCost=await host.tokenCounters.countRequest({messages:followup,tools:[]},'fixture/fixture');
 const reusedCost=await host.tokenCounters.countRequest({messages:dispatched.at(-1),tools:[]},'fixture/fixture');
 assert(reusedCost.tokens<rawCost.tokens,'Validated prefix reuse reduces the next request size');
 console.log('Reused prefix input units:',rawCost.tokens,'->',reusedCost.tokens,'with no auxiliary model requests');


 const checkpoints=host.sessions.log.readAll('reuse').filter(e=>e.type==='context/summary'&&e.payload.version===2);assert.equal(checkpoints.length,1);assert.equal(checkpoints[0].payload.version,2);assert.deepEqual(checkpoints[0].payload.openTasks,data.openTasks);assert.deepEqual(checkpoints[0].payload.artifactRefs,data.artifactRefs);assert.equal(checkpoints[0].payload.sourceMessageCount,2);assert.equal(checkpoints[0].payload.sourceEventIds.length,2);
 for(const messages of dispatched){assert.match(messages.find(m=>m.role==='user').content,/ledger.csv/);assert(messages.some(m=>m.content==='Current request'));assert(messages.some(m=>m.content.includes('<open-document-tabs>Report.docx: Revenue is 1200')),'document context stays verbatim in the current turn');}
 const changed=source.map((m,i)=>i===1?{...m,content:m.content+' edited'}:m);await request(changed,1);assert.equal(summaries,2,'edited source invalidates digest');
 cancelSummary=true;await assert.rejects(request(changed.map((m,i)=>i===1?{...m,content:m.content+' cancelled'}:m),5));assert.equal(host.sessions.log.readAll('reuse').filter(e=>e.type==='context/summary'&&e.payload.version===2).length,2,'aborted summary cannot commit');
 assert.equal(budget.snapshot().byPurpose.summary.requests,3);
 host.runContexts.delete('r');
}finally{d.harness.runContexts.delete('r');await d.closeFixture();}
console.log('Durable summary reuse, fidelity fields, source edits, scoped digest and cancellation without checkpoint commit');
