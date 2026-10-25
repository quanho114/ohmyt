import assert from 'node:assert/strict';
import {streamChat} from '../../server/providers/adapters/openai-compatible.js';
import {RequestAttempts} from '../../server/harness/attempts.js';
const originalFetch=globalThis.fetch;
let release;
const gate=new Promise(resolve=>{release=resolve;});
let notify;
const observed=new Promise(resolve=>{notify=resolve;});
let executed=0,requests=0;
const progress=[];
globalThis.fetch=async()=>{
 requests++;
 return {ok:true,body:(async function*(){
  yield new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'call-1',function:{name:'html_preview',arguments:'{"html":"'}}]}}]})+'\n\n');
  await gate;
  throw Object.assign(new Error('connection lost'),{code:'ECONNRESET'});
 })()};
};
try {
 const attempts=new RequestAttempts({stream:streamChat,record:()=>{}});
 const pending=attempts.run({baseURL:'http://fixture',model:'fixture',messages:[],onChunk:()=>{},onToolCall:()=>executed++,onToolProgress:value=>{progress.push(value);notify();}});
 const rejected=assert.rejects(pending,/connection lost/);
 await observed;
 assert.deepEqual(progress,[{id:'call-1',name:'html_preview',characters:9}]);
 assert.equal(executed,0,'Partial arguments must never execute a tool');
 assert.equal('arguments' in progress[0],false,'Progress does not expose argument content');
 release();await rejected;
 assert.equal(requests,1,'Progress marks partial output and prevents automatic retry');
 assert.equal(executed,0);
 console.log('PASS streamed tool progress before completion, no premature execution or retry');
} finally {release();globalThis.fetch=originalFetch;}
