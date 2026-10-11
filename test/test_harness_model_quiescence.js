import assert from 'node:assert/strict';
import {harnessFixture} from './harness_fixture.js';
import {RunBudget} from '../server/harness/budgets.js';
import {reviewAction} from '../server/approval_modes.js';
const entered=Promise.withResolvers(),aborted=Promise.withResolvers(),gate=Promise.withResolvers();let lateChunks=0;
const d=await harnessFixture({stream:async options=>{entered.resolve();options.signal.addEventListener('abort',()=>aborted.resolve(),{once:true});await gate.promise;options.onChunk('{"decision":"allow","risk":"low","reason":"Late result"}');return {completed:true,usage:{inputTokens:4,outputTokens:2}};}});
try{
 const budget=new RunBudget({requests:2});d.db.createSession('s','fixture','Fixed title');d.db.createRun('r','s');d.db.addMessage('u','s','user','task');d.harness.sessions.begin('r','s','u');
 let settled=false,drained=false;
 const request=reviewAction({request:options=>d.harness.requestModel({...options,onChunk:delta=>{lateChunks++;options.onChunk(delta);},runId:'r',sessionId:'s',purpose:'approval'},{budget,allowRetry:false}),model:{providerId:'fixture',modelId:'fixture'},prompt:'task',history:[],toolName:'fixture',input:{},scope:{scopeId:'standalone'},signal:new AbortController().signal,timeoutMs:5}).then(value=>{settled=true;return value;});
 await entered.promise;await aborted.promise;const drain=d.harness.drainRequests('r').then(()=>drained=true);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(settled,false);assert.equal(drained,false);assert.equal(budget.used.requests,1);
 gate.resolve();assert.equal((await request).decision,'ask');await drain;assert.equal(drained,true);assert.equal(d.harness.modelRequests.size,0);assert.equal(budget.snapshot().inputTokens,4);assert.equal(budget.snapshot().outputTokens,2);assert.equal(lateChunks,0);
}finally{gate.resolve();await d.closeFixture();}
console.log('Reviewer timeout aborts admission but drains physical request before settlement; late allow cannot grant permission');
