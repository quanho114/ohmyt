import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import {harnessFixture,stringSchema} from './harness_fixture.js';

// Scripted streams exercise production contracts; these scores do not measure model intelligence.
const records=[];
for(const domain of ['coding','research','browser-state'])for(const correct of [true,false]){
 let d,server,state={saved:false};const source={id:'source-local-v1',text:'The launch year is 2024.'};
 if(domain==='browser-state'){
  server=http.createServer((request,response)=>{if(request.method==='POST')state.saved=request.url==='/save';response.setHeader('Content-Type','application/json');response.end(JSON.stringify(state));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 }
 const start=Date.now();
 try{
  d=await harnessFixture({tools:[{name:'fixture_action',parameters:stringSchema,execute:async args=>{
   if(domain==='coding'){fs.writeFileSync(path.join(d.fixtureRoot,'increment.js'),args.value);return {written:true};}
   if(domain==='research')return {sourceId:source.id,text:source.text};
   return (await fetch(`http://127.0.0.1:${server.address().port}/${args.value}`,{method:'POST'})).json();
  }}],stream:async options=>{if(!options.messages.some(m=>m.role==='tool'))options.onToolCall({id:'effect',name:'fixture_action',arguments:{value:domain==='coding'?`(n)=>n+${correct?1:2}`:domain==='browser-state'?(correct?'save':'noop'):'source'}});else options.onChunk(domain==='research'?`Launch year: ${correct?2024:2025}. [${source.id}]`:'Everything completed successfully.');return {completed:true,usage:{inputTokens:10,outputTokens:5}};}});
  const oracle=async ({answer,results})=>{
   let verified;
   if(domain==='coding'){const fn=vm.runInNewContext(fs.readFileSync(path.join(d.fixtureRoot,'increment.js'),'utf8'),{}, {timeout:1000});verified=[-9,0,2,999].every(n=>fn(n)===n+1);}
   else if(domain==='research')verified=answer===`Launch year: 2024. [${source.id}]`&&results.some(r=>r.output.sourceId===source.id&&r.output.text===source.text);
   else verified=(await (await fetch(`http://127.0.0.1:${server.address().port}/state`)).json()).saved;
   return {verified,evidenceRefs:verified?[`${domain}:independent-oracle-v1`]:[]};
  };
  const result=await d.runFixture(`${domain}-${correct}`,'Complete fixture objective',{verifyTask:oracle});
  const outcome=d.harness.sessions.outcome(result.run.id);if(!correct)assert(!result.messages.at(-1).content.includes('Everything completed successfully.'));assert.equal(outcome.taskStatus,correct?'completed':'failed');assert.equal(outcome.verificationStatus,correct?'verified':'unverified');
  const receipt=result.log.find(e=>e.type==='tool/result'&&e.payload.executionReceipt);assert(receipt);assert.equal(outcome.protocolStatus,'completed');
  records.push({domain,expectedSuccess:correct,taskSuccess:outcome.taskStatus==='completed',verified:outcome.verificationStatus==='verified',falseSuccess:!correct&&outcome.taskStatus==='completed',durationMs:Date.now()-start,usage:JSON.parse(result.messages.at(-1).metadata).activity.usage,estimatedCost:null});
 }finally{if(d)await d.closeFixture();if(server)await new Promise(resolve=>server.close(resolve));}
}
assert.equal(records.filter(r=>r.falseSuccess).length,0);assert.equal(records.filter(r=>r.verified).length,3);
console.log(JSON.stringify({fixtureVersion:1,route:'offline-scripted-streams',trials:6,positiveTrials:3,negativeTrials:3,falseSuccess:0,records}));
