import assert from 'node:assert/strict';
import {createDaemon} from '../../server/index.js';
import {PtcService} from '../../server/ptc/index.js';
import {NodePtcRuntime} from '../../server/ptc/node.js';
import {RunBudget} from '../../server/harness/budgets.js';

let executions=0,disposed=0;
const fixture={probe:async()=>({available:false,reason:'fixture disabled'}),execute:async()=>{executions++;},cancel:()=>false,dispose:async()=>{disposed++;}};
assert.throws(()=>new PtcService({}),/requires probe/);
const service=new PtcService(fixture);
await assert.rejects(()=>service.execute({code:'output(1)'}),/unavailable/);
await assert.rejects(()=>service.execute({code:'output(1)',maxSubcalls:21}),/limits/);
const aborted=new AbortController();aborted.abort();
await assert.rejects(()=>service.execute({code:'output(1)',signal:aborted.signal}),/abort/i);
assert.equal(executions,0);
await service.dispose();await service.dispose();assert.equal(disposed,1);
assert.equal((await service.probe()).available,false);
await assert.rejects(()=>service.execute({code:'output(1)'}),/disposed/);
const unavailable=createDaemon({dbPath:':memory:',port:0,ptcProviderFactory:()=>fixture});
try {
  await unavailable.harness.ready;
  assert.equal(unavailable.tools.get('ptc_execute'),undefined,'Unavailable providers must not expose the execution tool');
  assert.equal(unavailable.harness.ptcStatus.available,false);
} finally {await unavailable.stop();}
assert.equal(disposed,2);

let bodies=0,rpcStarted,rpcAborted=false;
const daemon=createDaemon({dbPath:':memory:',port:0,plugins:[{name:'test/ptc',inject:['tools'],apply(ctx){
  ctx.effect(()=>ctx.tools.register({name:'ptc_fixture_echo',scopes:['standalone','project'],parameters:{type:'object',properties:{value:{type:'number'}},required:['value'],additionalProperties:false},execute:async args=>{bodies++;return {value:args.value};}}));
  ctx.effect(()=>ctx.tools.register({name:'ptc_fixture_wait',scopes:['standalone'],parameters:{type:'object',properties:{}},execute:async(args,{signal})=>{
    rpcStarted();
    await new Promise((resolve,reject)=>{const abort=()=>{rpcAborted=true;reject(new Error('RPC cancelled'));};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  }}));
}}]});
try {
  await daemon.harness.ready;
  assert.equal(daemon.harness.ctx.ptcRuntime,daemon.harness.ptc);
  assert.equal((await daemon.harness.ctx.ptcRuntime.probe()).available,true);
  daemon.db.createSession('s','default-assistant','PTC fixture');
  const runId='r',scope={scopeId:'standalone:s',approvalMode:'full-access'};
  daemon.db.createRun(runId,'s');daemon.db.addMessage('u','s','user','PTC');daemon.harness.sessions.begin(runId,'s','u');
  const runTools=daemon.tools.forStandalone(scope),controller=new AbortController(),budget=new RunBudget({tools:5});
  const run={runId,sessionId:'s',agentId:'default-assistant',scope,runTools,capabilities:[...runTools.tools.keys()],signal:controller.signal,
    agent:daemon.db.getAgent('default-assistant'),session:daemon.db.getSession('s'),messages:[],prompt:'fixture',budget};
  daemon.harness.runContexts.set(runId,run);
  daemon.permissions.evaluate=()=>({action:'ALLOW'});
  const result=await daemon.harness.executeTool({id:'program',name:'ptc_execute',arguments:{code:"output(await tools.call('ptc_fixture_echo',{value:42}));"}},runTools,{runId});
  assert.equal(result.output[0].value,42);assert.equal(bodies,1);assert.equal(budget.used.tools,2,'Program and RPC share the run tool budget');
  let receipts=daemon.harness.sessions.log.readAll('s').filter(e=>e.type==='tool/result');
  assert(receipts.some(e=>e.payload.name==='ptc_fixture_echo'&&e.payload.executionReceipt.bodyStarted===true));
  daemon.permissions.evaluate=(name)=>({action:name==='ptc_fixture_echo'?'DENY':'ALLOW'});
  await assert.rejects(()=>daemon.harness.ctx.ptcRuntime.execute({code:"await tools.call('ptc_fixture_echo',{value:7});",context:{runId},signal:controller.signal}));
  assert.equal(bodies,1,'RPC DENY must precede tool body');
  receipts=daemon.harness.sessions.log.readAll('s').filter(e=>e.type==='tool/result');
  assert(receipts.some(e=>e.payload.name==='ptc_fixture_echo'&&e.payload.status==='denied'));
  daemon.permissions.evaluate=()=>({action:'ALLOW'});
  run.budget=new RunBudget({tools:0});
  await assert.rejects(()=>daemon.harness.ctx.ptcRuntime.execute({code:"await tools.call('ptc_fixture_echo',{value:8});",context:{runId}}),/budget/i);
  assert.equal(bodies,1);
  run.budget=new RunBudget({tools:5});
  await assert.rejects(()=>daemon.harness.ctx.ptcRuntime.execute({code:"await tools.call('ptc_execute',{code:'output(1)'});",context:{runId}}),/scope/i);
  const started=new Promise(resolve=>{rpcStarted=resolve;});
  const pending=daemon.harness.ctx.ptcRuntime.execute({code:"await tools.call('ptc_fixture_wait',{});",context:{runId}});
  const rejected=assert.rejects(pending,/cancelled/i);
  await started;assert.equal(daemon.harness.ctx.ptcRuntime.cancel(runId),true);await rejected;
  assert.equal(rpcAborted,true,'PTC cancellation must reach in-flight canonical RPC');
  assert.equal(controller.signal.aborted,false,'Cancelling a nested runtime does not abort its parent');
  daemon.harness.runContexts.clear();
} finally {await daemon.stop();}

const provider=new NodePtcRuntime({call:async()=>{throw Error('No tools expected');}});
try {
  await assert.rejects(()=>provider.execute({code:"output('x'.repeat(1100000));"}),/output limit/i);
  const controller=new AbortController();
  const pending=provider.execute({code:'while(true){}',signal:controller.signal});
  const rejected=assert.rejects(pending,/cancelled/);controller.abort();await rejected;
  assert.equal(provider.active.size,0);
  const closing=provider.execute({code:'while(true){}'});
  const disposedResult=assert.rejects(closing,/disposed/);
  await provider.dispose();await disposedResult;assert.equal(provider.active.size,0);
  await assert.rejects(()=>provider.execute({code:'output(1)'}),/disposed/);
} finally {await provider.dispose();}
console.log('PTC seam: unavailable, shared budgets, RPC DENY/receipts, recursion guard, cancellation and disposal passed');
