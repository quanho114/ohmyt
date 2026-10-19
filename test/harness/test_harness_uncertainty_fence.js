import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {harnessFixture,stringSchema} from '../harness_fixture.js';
import {ToolInvocationService} from '../../server/harness/tool_invocation.js';
import {executeHostShell} from '../../server/local_runtime.js';

test('caught unknown PTC subcall cannot admit another body or erase its unresolved receipt',async()=>{
  let mutations=0,after=0,requests=0;
  const d=await harnessFixture({tools:[
    {name:'uncertain_write',parameters:stringSchema,execute:()=>{mutations++;throw Error('Lost connection after effect');}},
    {name:'next_write',parameters:stringSchema,execute:()=>{after++;return {saved:true};}}
  ],stream:async o=>{
    if(++requests===1)o.onToolCall({id:'program',name:'ptc_execute',arguments:{code:"try {await tools.call('uncertain_write',{value:'x'});} catch(e) {output(e.message);} try {await tools.call('next_write',{value:'x'});} catch(e) {output(e.message);}"}});
    else {assert.equal(o.tools.length,0,'Nested uncertainty must reach the driver conclusion boundary');o.onChunk('External state is unknown; no further actions were performed.');}
    return {completed:true};
  }});
  try {
    assert.equal(d.harness.ptcStatus.available,true);
    const result=await d.runFixture('nested-unknown');
    assert.equal(mutations,1);assert.equal(after,0);
    const receipt=result.log.find(e=>e.type==='tool/result'&&e.payload.name==='uncertain_write').payload;
    assert.equal(receipt.status,'unknown');assert.equal(receipt.executionReceipt.bodyStarted,true);
    const blocked=result.log.find(e=>e.type==='tool/result'&&e.payload.name==='next_write').payload;
    assert.equal(blocked.executionReceipt.bodyStarted,false);
    const outcome=d.harness.sessions.outcome('nested-unknown');
    assert.equal(outcome.taskStatus,'unknown');assert(outcome.unresolvedCallIds.includes(receipt.callId));
    assert.equal(outcome.verificationStatus,'unverified');assert.equal(result.run.status,'failed');
  } finally {await d.closeFixture();}
});

test('uncertainty is rechecked after approval/middleware waits, before any body or budget',async()=>{
  const gate=Promise.withResolvers(),entered=Promise.withResolvers();
  let bodies=0,consumed=0;
  const run={runId:'r',sessionId:'s',agentId:'a',scope:{scopeId:'standalone:s'},signal:new AbortController().signal,
    capabilities:['write'],budget:{consume(){consumed++;}},runTools:{validateCall:()=>({tool:{execute:args=>{
      bodies++;if(args.fail)throw Error('Uncertain effect');return {saved:true};
    }}})}};
  const invocation=new ToolInvocationService({resolveRun:()=>run,authorize:async()=>({action:'ALLOW'}),
    pipeline:async(call,_context,execute)=>{if(call.id==='waiting'){entered.resolve();await gate.promise;}return execute();}});
  const waiting=invocation.invoke({call:{id:'waiting',name:'write',arguments:{}},context:{runId:'r'}});
  try {
    await entered.promise;
    const unknown=await invocation.invoke({call:{id:'uncertain',name:'write',arguments:{fail:true}},context:{runId:'r'}});
    assert.equal(unknown.status,'unknown');gate.resolve();
    const rejected=await waiting;
    assert.equal(rejected.executionReceipt.bodyStarted,false);assert.notEqual(rejected.status,'success');
    assert.equal(bodies,1);assert.equal(consumed,1);
  } finally {gate.resolve();await waiting;await invocation.drain();invocation.release('r');}
});

test('real host-shell timeout after a write stays unknown and fences sibling actions',async()=>{
  let d,after=0,requests=0;
  d=await harnessFixture({tools:[
    {name:'timed_shell',parameters:{type:'object'},execute:(_args,ctx)=>executeHostShell({
      command:process.platform==='win32'?"Set-Content effect.txt applied; Start-Sleep -Seconds 5":"printf applied > effect.txt; sleep 5",cwd:d.fixtureRoot,timeout:250
    },ctx)},
    {name:'after_timeout',parameters:{type:'object'},execute:()=>{after++;return {saved:true};}}
  ],stream:async o=>{
    if(++requests===1){o.onToolCall({id:'timed',name:'timed_shell',arguments:{}});o.onToolCall({id:'after',name:'after_timeout',arguments:{}});}
    else o.onChunk('The interrupted command needs verification before further actions.');
    return {completed:true};
  }});
  try {
    const result=await d.runFixture('shell-timeout');
    assert.match(fs.readFileSync(d.fixtureRoot+'/effect.txt','utf8'),/applied/);
    assert.equal(after,0);
    const receipt=result.log.find(e=>e.type==='tool/result'&&e.payload.callId==='timed').payload;
    assert.equal(receipt.status,'unknown');assert.equal(receipt.executionReceipt.bodyStarted,true);
    assert.equal(d.harness.sessions.outcome('shell-timeout').taskStatus,'unknown');
  } finally {await d.closeFixture();}
});
