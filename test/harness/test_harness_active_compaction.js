import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {RunBudget} from '../../server/harness/budgets.js';
let summaries=0,main=0,oversizedSummary=false;
const d=await harnessFixture({config:{contextTokens:3200,reserveTokens:200},stream:async options=>{
 if(options.purpose==='summary'){summaries++;assert.equal(options.tools.length,0);options.onChunk(oversizedSummary?'Long generated observation. '.repeat(1000):'Verified prior read-only observations; no write was performed. Finish the task.');}
 else {main++;assert(options.messages.some(m=>m.content==='Current task'));assert(options.messages.some(m=>m.content==='Steering: preserve original'));if(oversizedSummary){assert.equal(options.messages.filter(m=>m.role==='user').length,3,'Only two real inputs and the latest generated checkpoint are retained');assert(options.messages.some(m=>String(m.content).includes('Summary shortened')));assert(options.messages.some(m=>String(m.content).includes('Recorded tool observations')));}else assert(options.messages.some(m=>m.tool_call_id==='call5'));assert(!options.messages.some(m=>m.tool_call_id==='call0'));options.onChunk('Verified result');}
 return {completed:true};
}});
try {
 const host=d.harness;host.tokenCounters.register('fixture/fixture',r=>({tokens:r.messages.reduce((n,m)=>n+String(m.content).length+JSON.stringify(m.tool_calls||[]).length,0)+JSON.stringify(r.tools).length,accuracy:'exact',source:'fixture'}));
 d.db.createSession('active','fixture','Title');d.db.createRun('active-run','active');d.db.addMessage('task','active','user','Current task');host.sessions.begin('active-run','active','task');
 const budget=new RunBudget({requests:30});host.runContexts.set('active-run',{runId:'active-run',sessionId:'active',scope:{scopeId:'standalone'},config:host.config,budget});
 const messages=[{role:'user',content:'Current task'},...Array.from({length:6},(_,i)=>[
 {role:'assistant',content:'Inspect '+ 'x'.repeat(200),tool_calls:[{id:`call${i}`,type:'function',function:{name:'read',arguments:'{}'}}]},
 {role:'tool',name:'read',tool_call_id:`call${i}`,content:'evidence '.repeat(300)},
 ...(i===2?[{role:'user',content:'Steering: preserve original'}]:[]),
 ]).flat()];
 const before=JSON.stringify(messages);
 await host.request({runId:'active-run',sessionId:'active',providerId:'fixture',modelId:'fixture',currentTurnStart:0,messages,tools:[],step:7,onChunk:()=>{}});
 assert(summaries>0);assert.equal(main,1);assert.equal(budget.used.requests,summaries+1);assert.equal(JSON.stringify(messages),before);
 const previousSummaries=summaries;
 await host.request({runId:'active-run',sessionId:'active',providerId:'fixture',modelId:'fixture',currentTurnStart:0,messages:[...messages,{role:'assistant',content:'A new observation'}],tools:[],step:8,onChunk:()=>{}});
 assert.equal(summaries,previousSummaries,'next step reuses active summary without another summary request');
 assert.equal(main,2);
 assert.equal(host.sessions.log.readAll('active').filter(e=>e.type==='context/summary'&&e.payload.summaryMethod==='active-settled-prefix-v1').length,1);
 oversizedSummary=true;
 const context=host.runContexts.get('active-run');delete context.activeContextProjection;
 context.budget=new RunBudget({requests:100});
 await host.request({runId:'active-run',sessionId:'active',providerId:'fixture',modelId:'fixture',currentTurnStart:0,messages,tools:[],step:9,onChunk:()=>{}});
 assert.equal(main,3,'The main request resumes after an oversized generated summary');
 assert.equal(JSON.stringify(messages),before,'Durable source and tool receipts are not rewritten');
 const nextMessages=[...messages,{role:'assistant',content:'Next read',tool_calls:[{id:'call6',type:'function',function:{name:'read',arguments:'{}'}}]},{role:'tool',name:'read',tool_call_id:'call6',content:'next observation '.repeat(1000)}];
 await host.request({runId:'active-run',sessionId:'active',providerId:'fixture',modelId:'fixture',currentTurnStart:0,messages:nextMessages,tools:[],step:10,onChunk:()=>{}});
 assert.equal(main,4,'Repeated compaction must replace generated summaries rather than pinning them as human input');
 for(let i=7;i<10;i++){
  nextMessages.push({role:'assistant',content:'Read another range',tool_calls:[{id:`call${i}`,type:'function',function:{name:'read',arguments:JSON.stringify({offset:i*100})}}]},{role:'tool',name:'read',tool_call_id:`call${i}`,content:'Another observation '.repeat(1000)});
  await host.request({runId:'active-run',sessionId:'active',providerId:'fixture',modelId:'fixture',currentTurnStart:0,messages:nextMessages,tools:[],step:i+4,onChunk:()=>{}});
 }
 assert.equal(main,7,'Several successive summary replacements remain bounded');


 host.runContexts.delete('active-run');
}finally{d.harness.runContexts.delete('active-run');await d.closeFixture();}
console.log('Active turn overflow: bounded shared-budget summaries, exact user/steering, latest tool groups and immutable source passed');
