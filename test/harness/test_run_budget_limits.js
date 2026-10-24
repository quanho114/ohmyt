import assert from 'node:assert/strict';
import {RunBudget} from '../../server/harness/budgets.js';
import {harnessFixture, stringSchema} from '../harness_fixture.js';
import {createDaemon} from '../../server/index.js';

// Token cap enforcement and cost estimation.
{
 const budget=new RunBudget({requests:5,tools:5,outputTokens:100,runtimeMs:60000,rates:{inputPerMTok:1,outputPerMTok:2}});
 assert.deepEqual(Object.keys(budget.limits).sort(),['outputTokens','requests','runtimeMs','tools']);
 budget.consume('requests');
 assert.ok(budget.startedAt>0);
 budget.recordUsage({inputTokens:1000,outputTokens:60});
 assert.equal(budget.overBudget(),null);
 budget.recordUsage({inputTokens:500,outputTokens:60});
 assert.equal(budget.overBudget(),'tokens');
 assert.throws(()=>budget.consume('requests'),/output token budget exhausted/);
 budget.grantOnce();
 assert.equal(budget.consume('requests'),undefined);
 assert.throws(()=>budget.consume('requests'),/output token budget exhausted/);
 // Tool calls admitted by the current step still complete over the token cap.
 assert.equal(budget.consume('tools'),undefined);
 const snapshot=budget.snapshot();
 assert.equal(snapshot.outputTokensUsed,120);
 assert.equal(snapshot.estimatedCost,(1500*1+120*2)/1e6);
 assert.ok(snapshot.runtimeMs>=0);
}
// Time cap enforcement is measured from the first consumed request.
{
 const budget=new RunBudget({requests:5,runtimeMs:1});
 assert.equal(budget.overBudget(),null);
 budget.consume('requests');
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(budget.overBudget(),'time');
 assert.throws(()=>budget.consume('requests'),/time budget exhausted/);
 assert.equal(budget.consume('tools'),undefined);
}
// Library defaults stay off; unknown limit kinds are ignored.
{
 const budget=new RunBudget({requests:2,rounds:9});
 assert.equal(budget.limits.outputTokens,undefined);
 assert.equal(budget.limits.runtimeMs,undefined);
 assert.equal(budget.limits.rounds,undefined);
 assert.equal(budget.overBudget(),null);
 budget.recordUsage({outputTokens:999999});
 assert.equal(budget.overBudget(),null);
 assert.equal(budget.snapshot().estimatedCost,null);
}
// Providers without usage reporting degrade to no token enforcement.
{
 const budget=new RunBudget({requests:5,outputTokens:10});
 budget.consume('requests');
 budget.recordUsage(null);
 assert.equal(budget.overBudget(),null);
 assert.equal(budget.consume('requests'),undefined);
}
// Invalid harness config values are rejected.
assert.throws(()=>createDaemon({dbPath:':memory:',harnessConfig:{maxOutputTokens:0}}),/Invalid harness config: maxOutputTokens/);
assert.throws(()=>createDaemon({dbPath:':memory:',harnessConfig:{maxRuntimeMs:-1}}),/Invalid harness config: maxRuntimeMs/);

// A run over its token budget ends with a graceful final turn, not a failure.
{
 let finalTurnSeen=false;
 const d=await harnessFixture({config:{maxOutputTokens:1},stream:async({messages,onToolCall,onChunk})=>{
  if(!messages.some(m=>m.role==='tool')){onToolCall({id:'echo',name:'echo_tool',arguments:{value:'x'}});return {completed:true,usage:{inputTokens:10,outputTokens:50}};}
  if(messages.some(m=>typeof m.content==='string'&&m.content.includes('budget is nearly exhausted')))finalTurnSeen=true;
  onChunk('Concluding without tools.');return {completed:true,usage:{inputTokens:10,outputTokens:50}};
 },tools:[{name:'echo_tool',parameters:stringSchema,execute:async({value})=>({echo:value})}]});
 d.db.createSession('budget','fixture','Budget test');
 try{
  await d.agentLoop.run({runId:'budget-run',sessionId:'budget',prompt:'Do the thing'});
  assert.equal(d.db.db.prepare("SELECT status FROM runs WHERE id='budget-run'").get().status,'completed');
  assert.equal(finalTurnSeen,true);
  assert.equal(d.harness.config.maxOutputTokens,1);
 }finally{await d.closeFixture();}
}
// A goal over its shared token budget settles as limit_exhausted instead of
// burning another failed round.
{
 const d=await harnessFixture({config:{maxOutputTokens:1},stream:async({onChunk})=>{onChunk('Working');return {completed:true,usage:{outputTokens:60}};}});
 d.db.createSession('goal','fixture','Goal budget test');
 try{
  const goals=d.harness.goals;
  const created=goals.create('goal',{objective:'Budgeted objective MARKER-BUDGET-1',maxRounds:5});
  goals.control('goal',{action:'start',expectedRevision:created.revision,autoContinue:true});
  await goals.drain('goal');
  const goal=goals.get('goal');
  assert.equal(goal.phase,'blocked');
  assert.equal(goal.reason,'limit_exhausted');
  assert.equal(goals.budgets.get(goal.id).limits.outputTokens,1);
  assert.throws(()=>goals.control('goal',{action:'start',expectedRevision:goal.revision,autoContinue:true}),/Goal limit exhausted/);
 }finally{await d.closeFixture();}
}
console.log('✓ Run budgets: output-token and time caps, cost estimation, graceful driver conclusion, goal limit_exhausted settlement and config validation passed');
