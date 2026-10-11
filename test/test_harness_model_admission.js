import assert from 'node:assert/strict';
import {harnessFixture} from './harness_fixture.js';
import {RunBudget} from '../server/harness/budgets.js';
import {extractBrowserData} from '../server/browser_extract.js';
import {BrowserIntegration} from '../server/browser_integration.js';
let physical=0,mode='usage';
const fixture=await harnessFixture({stream:async o=>{
 physical++;
 if(mode==='retry'&&physical===1)throw Object.assign(new Error('offline'),{code:'UNREACHABLE'});
 if(mode==='extraction'){o.onChunk('{"value":"observed"}');return {completed:true,usage:{inputTokens:10,outputTokens:3}};}
 if(mode==='bad-planner'){o.onChunk('{"done":true}');return {completed:false};}
 o.onChunk(mode==='planner'?'{"done":true}':'Observed answer');return {completed:true,usage:{inputTokens:10,outputTokens:3}};
}});
try{
 fixture.db.createSession('requests','fixture','Explicit title');fixture.db.createRun('r','requests');fixture.db.addMessage('u','requests','user','task');fixture.harness.sessions.begin('r','requests','u');
 const budget=new RunBudget({requests:9,tools:2}),scope={scopeId:'standalone:requests',sessionId:'requests',approvalMode:'full'};
 const controller=new AbortController();
 fixture.harness.runContexts.set('r',{runId:'r',sessionId:'requests',scope,signal:controller.signal,budget,config:fixture.harness.config,model:{providerId:'fixture',modelId:'fixture'}});
 const request={runId:'r',sessionId:'requests',providerId:'fixture',modelId:'fixture',messages:[{role:'user',content:'task'}],tools:[],signal:controller.signal,onChunk:()=>{}};
 for(const purpose of ['main','title','summary','approval','child'])await fixture.harness.requestModel({...request,purpose});
 assert.equal(physical,5);assert.equal(budget.used.requests,5);
 const usage=budget.snapshot();assert.equal(usage.inputTokens,50);assert.equal(usage.outputTokens,15);assert.equal(usage.estimatedCost,null);
 assert.equal(usage.byPurpose.summary.requests,1);
 fixture.agentLoop.activeRuns.set('r',{sessionId:'requests',abortController:controller});
 const integration=new BrowserIntegration({runtime:fixture.browserUse,tools:fixture.tools,db:fixture.db,permissions:fixture.permissions,agentLoop:fixture.agentLoop,gateway:fixture.gateway,llm:fixture.llm});
 mode='planner';assert.equal(await integration.planStep({task:'Read',history:[],remainingSteps:1,runId:'r',sessionId:'requests',signal:controller.signal}),null);
 assert.equal(budget.used.requests,6);assert.equal(budget.snapshot().byPurpose.browser_planner.requests,1);
 mode='bad-planner';await assert.rejects(integration.planStep({task:'Read',history:[],remainingSteps:1,runId:'r',sessionId:'requests',signal:controller.signal}),/completion/i);
 assert.equal(budget.used.requests,7);assert.equal(budget.snapshot().inputTokens,null,'Missing failed usage stays unknown');
 mode='extraction';await extractBrowserData({observation:{url:'https://fixture.test',title:'Fixture',dom:'observed',truncated:false},query:'Extract value',schema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},model:request,signal:controller.signal,request:options=>fixture.harness.requestModel({...options,runId:'r',sessionId:'requests',purpose:'browser_extraction'},{allowRetry:false})});
 assert.equal(budget.used.requests,8);assert.equal(budget.snapshot().byPurpose.browser_extraction.requests,1);
 budget.limits.requests=8;const before=physical;await assert.rejects(fixture.harness.requestModel(request),/budget exhausted/);assert.equal(physical,before);
 fixture.agentLoop.activeRuns.delete('r');
 mode='retry';physical=0;const retryBudget=new RunBudget({requests:3});
 await fixture.harness.requestModel({...request,purpose:'main'},{budget:retryBudget});assert.equal(physical,2);assert.equal(retryBudget.used.requests,2);
 const events=fixture.harness.sessions.log.readAll('requests').filter(e=>e.type==='attempt/end');assert(events.every(e=>e.payload.purpose));
}finally{fixture.agentLoop.activeRuns.clear();fixture.harness.runContexts.clear();await fixture.closeFixture();}
console.log('All request purposes share physical-attempt admission, terminal validation and truthful usage');
