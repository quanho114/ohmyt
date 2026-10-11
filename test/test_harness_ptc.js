import assert from 'node:assert/strict';
import {PtcRuntime} from '../server/harness/ptc.js';
const calls=[];const runtime=new PtcRuntime({call:async(name,args)=>{calls.push({name,args});return {value:args.value};}});
assert.equal((await runtime.probe()).available,true,'OS isolation must actually launch');
const result=await runtime.execute({code:"const r=await tools.call('echo',{value:42});output(r);",signal:new AbortController().signal});assert.equal(calls.length,1);assert.equal(result.output[0].value,42);
await assert.rejects(runtime.execute({code:"const fs=output.constructor('return process')().getBuiltinModule('fs');output(fs.readFileSync('/etc/passwd','utf8'));"}),/ENOENT|Code generation|denied|not defined|is not a function/i);
await assert.rejects(runtime.execute({code:'while(true){}',wallTimeMs:100}),/time/i);
await assert.rejects(runtime.execute({code:"for(let i=0;i<30;i++)await tools.call('echo',{value:i});",maxSubcalls:2}),/limit/i);
console.log('PTC OS isolation, audited RPC, timeout and call limits passed');
