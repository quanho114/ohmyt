import assert from 'node:assert/strict';
import {RequestAttempts} from '../server/harness/attempts.js';
const events=[];let calls=0;
const attempts=new RequestAttempts({record:e=>events.push(e),stream:async(options)=>{calls++;if(calls===1){const err=new Error('offline');err.code='UNREACHABLE';throw err;}options.onChunk('ok');return {completed:true};}});
let text='';assert.equal((await attempts.run({runId:'r',step:1,onChunk:s=>text+=s})).completed,true);assert.equal(calls,2);assert.equal(text,'ok');assert.equal(events.filter(e=>e.type==='attempt/end').length,2);
const partial=new RequestAttempts({record:e=>events.push(e),stream:async(o)=>{o.onChunk('partial');throw Object.assign(new Error('lost'),{code:'UNREACHABLE'});}});
let partialCalls=0;await assert.rejects(partial.run({runId:'p',step:1,onChunk:()=>partialCalls++}));assert.equal(partialCalls,1,'partial output cannot be retried invisibly');
const bad=new RequestAttempts({record:()=>{},stream:async()=>({completed:false})});await assert.rejects(bad.run({runId:'b',step:1}),/completion/);
console.log('Request attempts bounded retries and settlement passed');
