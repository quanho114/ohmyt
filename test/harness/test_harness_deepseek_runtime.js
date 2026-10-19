import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
let requests=0,bodies=0;
const daemon=await harnessFixture({tools:[{name:'deepseek_probe',scopes:['standalone'],readOnly:true,parameters:{type:'object',properties:{path:{type:'string'},limit:{type:'integer'}},required:['path','limit'],additionalProperties:false},execute:async()=>({observation:++bodies})}],stream:async options=>{
 if(requests++<3){
  options.onToolCall({id:`read-${requests}`,name:'deepseek_probe',arguments:requests%2?{path:'target.csv',limit:10}:{limit:10,path:'target.csv'}});
 }else{
  const text=options.messages.map(message=>String(message.content)).join('\n');
  assert(text.includes('Repeated tool call: deepseek_probe × 3'));
  assert(text.includes('continued polling may be justified'));
  assert.equal(options.messages.filter(message=>message.role==='tool').length,3);
  options.onChunk('Observed three probe results; no task verification claimed.');
 }
 return {completed:true};
}});
try {
 const result=await daemon.runFixture('deepseek-adapted');
 assert.equal(result.run.status,'completed',result.messages.at(-1)?.content);
 assert.equal(bodies,3,'Advisory guard never suppresses or replays tool bodies');
 const calls=result.log.filter(event=>event.type==='tool/call');
 assert.equal(calls.length,3);assert.equal(new Set(calls.map(event=>event.payload.callId)).size,3);
 console.log('DeepSeek adaptation runtime: canonical repeat feedback reaches next model request; all execution receipts remain distinct');
}finally{await daemon.closeFixture();}

let failedBodies=0,failedRequests=0;
const failing=await harnessFixture({tools:[{name:'failing_probe',scopes:['standalone'],readOnly:true,parameters:{type:'object',properties:{path:{type:'string'},limit:{type:'integer'}},required:['path','limit']},execute:async()=>{failedBodies++;return {success:false,error:'No access'};}}],stream:async options=>{
 if(failedRequests++<3)options.onToolCall({id:`failed-${failedRequests}`,name:'failing_probe',arguments:failedRequests%2?{path:'x',limit:1}:{limit:1,path:'x'}});
 else options.onChunk('The read failed; task remains unfinished.');
 return {completed:true};
}});
try{
 const result=await failing.runFixture('canonical-failure');
 assert.equal(failedBodies,3,'Argument key order cannot bypass the existing identical-failure fence');
 assert.notEqual(result.run.status,'completed');
 console.log('DeepSeek canonical repeat keys also preserve the existing three-failure execution fence');
}finally{await failing.closeFixture();}
