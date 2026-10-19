import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {RunBudget} from '../../server/harness/budgets.js';
let summaries=0,main=0;
const d=await harnessFixture({config:{contextTokens:6000,reserveTokens:500},stream:async options=>{
 if(options.purpose==='summary'){summaries++;options.onChunk('Old observations.');}
 else {main++;assert(options.messages.some(m=>m.content==='Look up the next row'));options.onChunk('Ready to inspect the relevant result range.');}
 return {completed:true};
}});
try{
 const host=d.harness;
 host.tokenCounters.register('fixture/fixture',request=>({tokens:JSON.stringify(request).length,accuracy:'exact',source:'fixture-wire'}));
 d.db.createSession('followup','fixture','Fixture');d.db.createRun('followup-run','followup');d.db.addMessage('user','followup','user','Look up the next row');host.sessions.begin('followup-run','followup','user');
 const messages=[{role:'system',content:'Use only observed evidence.'},{role:'user',content:'Read the sheet'},{role:'assistant',content:'',tool_calls:[{id:'csv',type:'function',function:{name:'read',arguments:'{}'}}]},{role:'tool',tool_call_id:'csv',content:'HEAD\n'+'CSV rows\n'.repeat(3000)+'\nTAIL'},{role:'assistant',content:'Sheet read; ask for a row.'},{role:'user',content:'Look up the next row'}];
 const original=JSON.stringify(messages);
 host.runContexts.set('followup-run',{runId:'followup-run',sessionId:'followup',scope:{scopeId:'standalone'},config:host.config,budget:new RunBudget({requests:20})});
 await host.request({runId:'followup-run',sessionId:'followup',providerId:'fixture',modelId:'fixture',messages,tools:[],currentTurnStart:5,step:1,onChunk:()=>{}});
 assert.equal(summaries,0,'A follow-up fitting after deterministic pruning must not wait for an auxiliary model summary');
 assert.equal(main,1);assert.equal(JSON.stringify(messages),original);
}finally{d.harness.runContexts.clear();await d.closeFixture();}
console.log('Follow-up admission: model-free fitting avoids unnecessary summary requests, preserves source and current question');
