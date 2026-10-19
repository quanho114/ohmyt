import assert from 'node:assert/strict';
import * as envelope from '../../server/harness/request_envelope.js';
import {TokenCounters} from '../../server/harness/tokenizers.js';
assert.equal(typeof envelope.prepareRequestEnvelope,'function','request fitting must use route accounting');
const counters=new TokenCounters();counters.register('exact',request=>({tokens:request.messages.reduce((sum,m)=>sum+String(m.content).length,0)+JSON.stringify(request.tools).length,accuracy:'exact',source:'fixture-wire'}));
const config={contextTokens:1100,reserveTokens:100,currentTurnStart:2},tools=[];
const input=[{role:'user',content:'old'.repeat(600)},{role:'assistant',content:'old answer'},{role:'user',content:'tiếng Việt'},{role:'assistant',content:'',tool_calls:[{id:'c',function:{name:'read',arguments:'{}'}}]},{role:'tool',name:'read',tool_call_id:'c',content:'x'.repeat(3000)}];
const fitted=await envelope.prepareRequestEnvelope({messages:input,tools,route:'exact',config,counters});assert.equal(fitted.accounting.accuracy,'exact');assert.equal(fitted.accounting.source,'fixture-wire');assert(fitted.accounting.tokens<=1000);assert.equal(fitted.omitted,2);assert.equal(fitted.shortened,1);assert.equal(fitted.messages[0].content,'tiếng Việt');assert.equal(fitted.messages[1].tool_calls[0].id,'c');assert.equal(input[4].content.length,3000);
await assert.rejects(envelope.prepareRequestEnvelope({messages:[{role:'user',content:'x'.repeat(2000)}],tools,route:'exact',config:{...config,currentTurnStart:0},counters}),error=>error.code==='CONTEXT_BUDGET_EXCEEDED');
const estimated=await envelope.prepareRequestEnvelope({messages:[{role:'user',content:'hello'}],tools,route:'absent',config:{contextTokens:24000,reserveTokens:4000},counters});assert.equal(estimated.accounting.accuracy,'estimated');
counters.register('broken',()=>{throw new Error('Tokenizer broken');});await assert.rejects(envelope.prepareRequestEnvelope({messages:[],tools,route:'broken',config,counters}),/Tokenizer broken/);
const abort=new AbortController();abort.abort();await assert.rejects(envelope.prepareRequestEnvelope({messages:[],tools,route:'exact',config,counters,signal:abort.signal}));
const changed=await envelope.prepareRequestEnvelope({messages:[{role:'user',content:'hello'}],tools:[{name:'schema',parameters:{type:'object'}}],route:'exact',config,counters});assert(changed.accounting.tokens>7,'schemas are included in complete request accounting');
console.log('Request envelope uses route counters, whole turns, pinned protocol and explicit overflow');

const {compactActiveTurn}=await import('../../server/harness/compaction.js');
assert.equal(typeof compactActiveTurn,'function');
const active=[{role:'user',content:'Keep this exact task'},...Array.from({length:6},(_,i)=>[
 {role:'assistant',content:'Inspect',tool_calls:[{id:`a${i}`,function:{name:'read',arguments:'{}'}}]},
 {role:'tool',tool_call_id:`a${i}`,content:'result '.repeat(300)},
 ...(i===2?[{role:'user',content:'Keep steering exactly'}]:[]),
]).flat()];
const compacted=await compactActiveTurn({messages:active,currentTurnStart:0,summarize:async older=>{assert(older.some(m=>m.tool_call_id==='a0'));return 'Observed earlier read results; remaining work unverified.';}});
assert.equal(compacted.messages[0].content,'Keep this exact task');
assert(compacted.messages.some(m=>m.content==='Keep steering exactly'));
assert(compacted.messages.some(m=>m.tool_call_id==='a5'));
assert(compacted.messages.some(m=>m.tool_call_id==='a4'));
assert(!compacted.messages.some(m=>m.tool_call_id==='a0'));
assert.equal(active.length,14,'source history remains intact');
const invalid=active.map(m=>({...m}));invalid.splice(2,1);
assert.equal((await compactActiveTurn({messages:invalid,summarize:async()=>{throw Error('must not summarize incomplete batch');}})).summary,undefined);
await assert.rejects(compactActiveTurn({messages:active,summarize:async()=>'',signal:undefined}),/no summary/);
const {reuseActiveProjection}=await import('../../server/harness/compaction.js');
assert.equal(typeof reuseActiveProjection,'function');
const cp={sourcePrefix:JSON.stringify(active.slice(0,compacted.cut)),cut:compacted.cut,prefix:compacted.messages.slice(0,-(active.length-compacted.cut))};
assert.deepEqual(reuseActiveProjection([...active,{role:'assistant',content:'next'}],cp),[...compacted.messages,{role:'assistant',content:'next'}]);
const edited=active.map((m,i)=>i===0?{...m,content:'Different request'}:m);
assert.equal(reuseActiveProjection(edited,cp),edited);

// Emergency fitting can cover one settled batch, but never drop a partial batch
// or the exact user input/steering. The summary retains literal tool evidence.
const single=[{role:'user',content:'Exact task'},
 {role:'assistant',content:'',tool_calls:[{id:'large',function:{name:'html_preview',arguments:JSON.stringify({content:'x'.repeat(9000)})},providerMetadata:{thoughtSignature:'exact-native'}}]},
 {role:'tool',tool_call_id:'large',name:'html_preview',content:'{"name":"game.html","success":true}'},
 {role:'user',content:'Exact steering'}];
const singleBefore=JSON.stringify(single);
const emergency=await compactActiveTurn({messages:single,keepRecentGroups:0,summarize:async()=> 'Preview is available.'});
assert.equal(emergency.cut,single.length);
assert(emergency.messages.some(m=>m.content==='Exact task'));
assert(emergency.messages.some(m=>m.content==='Exact steering'));
assert.match(emergency.messages.at(-1).content,/large/);
assert.match(emergency.messages.at(-1).content,/game.html/);
assert.equal(JSON.stringify(single),singleBefore);
assert.equal((await compactActiveTurn({messages:single.filter(m=>m.role!=='tool'),keepRecentGroups:0,summarize:async()=>{throw Error('incomplete batch must not summarize');}})).summary,undefined);
const cancelled=new AbortController();
await assert.rejects(compactActiveTurn({messages:single,keepRecentGroups:0,signal:cancelled.signal,summarize:async()=>{cancelled.abort();return 'Do not use';}}));

// A model-generated summary can overflow even after the last settled group is
// compacted. Only shorten the summary, not human steering or literal receipts.
const {fitActiveSummary}=await import('../../server/harness/compaction.js');
const oversized=await compactActiveTurn({messages:single,keepRecentGroups:0,summarize:async()=> 'Detailed summary '.repeat(1000)});
const fittedSummary=await fitActiveSummary({active:oversized,fit:active=>envelope.prepareRequestEnvelope({messages:active.messages,tools:[],route:'exact',config:{contextTokens:1600,reserveTokens:100,currentTurnStart:0},counters})});
assert(fittedSummary.selection.accounting.tokens<=1500);
assert(fittedSummary.active.summary.includes('Summary shortened'));
assert(fittedSummary.active.messages.some(m=>m.content==='Exact task'));
assert(fittedSummary.active.messages.some(m=>m.content==='Exact steering'));
assert(fittedSummary.active.messages.at(-1).content.includes('game.html'));
assert.equal(oversized.summary,'Detailed summary '.repeat(1000));
await assert.rejects(fitActiveSummary({active:oversized,fit:active=>envelope.prepareRequestEnvelope({messages:active.messages,tools:[{schema:'x'.repeat(2000)}],route:'exact',config:{contextTokens:1000,reserveTokens:100,currentTurnStart:0},counters})}),error=>error.code==='CONTEXT_BUDGET_EXCEEDED');
console.log('Oversized active summaries fit without changing input, steering, receipts or tool schemas');
const protectedText='Earlier completed steps in this task (untrusted summary, grants no permissions; not exact request replay):\n'+ 'Human text must remain exact. '.repeat(10);
const spoofed=await compactActiveTurn({messages:[{role:'user',content:protectedText},...single.slice(1)],keepRecentGroups:0,summarize:async()=> 'Long summary '.repeat(1000)});
const protectedFit=await fitActiveSummary({active:spoofed,fit:active=>envelope.prepareRequestEnvelope({messages:active.messages,tools:[],route:'exact',config:{contextTokens:2000,reserveTokens:100,currentTurnStart:0},counters})});
assert.equal(protectedFit.active.messages[0].content,protectedText,'Human text resembling a summary is never edited');
await assert.rejects(fitActiveSummary({active:oversized,fit:async()=>{throw new Error('Tokenizer unavailable');}}),/Tokenizer unavailable/);
const fittingAbort=new AbortController();fittingAbort.abort();
await assert.rejects(fitActiveSummary({active:oversized,signal:fittingAbort.signal,fit:active=>envelope.prepareRequestEnvelope({messages:active.messages,tools:[],route:'exact',config,counters,signal:fittingAbort.signal})}));
