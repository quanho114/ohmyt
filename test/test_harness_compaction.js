import assert from 'node:assert/strict';
import {TokenCounters} from '../server/harness/tokenizers.js';
import {compactHistory} from '../server/harness/compaction.js';
const counters=new TokenCounters();assert.equal((await counters.countRequest({messages:[],tools:[]},'unknown')).accuracy,'estimated');
const remove=counters.register('fixture',async()=>({tokens:42,accuracy:'exact',source:'fixture'}));assert.equal((await counters.countRequest({},'fixture')).tokens,42);remove();
let calls=0;
const messages=[{role:'user',content:'old '.repeat(1000)},{role:'assistant',content:'old result'},{role:'user',content:'current'}];
const compacted=await compactHistory({messages,budget:1000,count:x=>counters.countRequest({messages:x},'unknown'),summarize:async()=>{calls++;return 'Old task facts verified.';}});
assert.equal(calls,1);assert.equal(compacted.messages.at(-1).content,'current');assert.match(compacted.messages[0].content,/Old task/);
const fallback=await compactHistory({messages,budget:1000,count:x=>counters.countRequest({messages:x},'unknown'),summarize:async()=>{throw new Error('offline');}});assert.deepEqual(fallback.messages,messages);assert(fallback.error);
console.log('Token accuracy and compaction boundaries passed');

const steered=[...messages,{role:'assistant',tool_calls:[{id:'pending'}],content:''},{role:'tool',tool_call_id:'pending',content:'Evidence'},{role:'user',content:'Steering'}];const pinned=await compactHistory({messages:steered,currentTurnStart:2,budget:1000,count:x=>counters.countRequest({messages:x},'unknown'),summarize:async older=>{assert.deepEqual(older,messages.slice(0,2));return 'Previous task facts';}});assert.deepEqual(pinned.messages.slice(1),steered.slice(2));
