import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {BrowserUseRuntime} from '../server/browser_use.js';
const runtime=new BrowserUseRuntime({enabled:true,mode:'standalone',python:process.execPath,domains:['example.com'],timeoutMs:1000},{spawnProcess:(_python,_args,options)=>spawn(process.execPath,[new URL('./fixtures/browser_use_sidecar.cjs',import.meta.url).pathname],options)});
const context={runId:'control',sessionId:'chat',scopeId:'standalone:chat'};
try{
 await runtime.execute('navigate',{url:'https://example.com/'},context);
 await assert.rejects(runtime.control('control','other','pause'),/Unknown/);
 await runtime.control('control','chat','pause');assert.equal(runtime.status('chat')[0].state,'paused');
 let finished=false;const pending=runtime.execute('read',{},context).then(result=>{finished=true;return result;});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(finished,false);
 await runtime.control('control','chat','resume');await pending;assert.equal(finished,true);
 await runtime.control('control','chat','authentication');assert.equal(runtime.status('chat')[0].authentication,true);
 const controller=new AbortController();const stopped=assert.rejects(runtime.execute('read',{}, {...context,signal:controller.signal}),/stopped/);controller.abort();await stopped;
 const history=runtime.trace.read('control','chat');assert(history.some(event=>event.type==='control'));assert(!JSON.stringify(history).includes('example.com'));
 await assert.rejects(async()=>runtime.trace.read('control','other'));
 const waiting=assert.rejects(runtime.execute('read',{},context),/stopped/);await runtime.releaseRun('control');await waiting;assert.equal(runtime.runs.size,0);assert.equal(runtime.controls.size,0);
 console.log('PASS lifecycle: pause/resume, auth handoff, ownership, cancellation while paused, release and redacted trace');
}finally{await runtime.close();}
