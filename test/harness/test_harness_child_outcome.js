import assert from 'node:assert/strict';
import {harnessFixture,stringSchema} from '../harness_fixture.js';
for(const mode of ['partial','denied']){
let returned;
const d=await harnessFixture({tools:[{name:'failed_write',parameters:stringSchema,execute:()=>({success:false,error:'Write failed'})},{name:'read_probe',parameters:stringSchema,execute:()=>({read:true})}],stream:async options=>{
 const results=options.messages.filter(m=>m.role==='tool');
 if(options.runId.startsWith('run_child_')){
  if(!results.length){options.onToolCall({id:'write',name:'failed_write',arguments:{value:'required'}});options.onToolCall({id:'read',name:'read_probe',arguments:{value:'probe'}});}
  else options.onChunk('Everything succeeded.');
 }else if(!results.length)options.onToolCall({id:'spawn',name:'subagent_spawn',arguments:{task:'Perform required write',capabilities:['failed_write','read_probe']}});
 else if(results.length===1)options.onToolCall({id:'wait',name:'subagent_wait',arguments:{childId:JSON.parse(results[0].content).childId}});
 else {returned=JSON.parse(results.at(-1).content);options.onChunk('The child reported incomplete work.');}
 return {completed:true,usage:{inputTokens:10,outputTokens:5}};
}});
if(mode==='denied')d.permissions.evaluate=name=>({action:name==='failed_write'?'DENY':'ALLOW'});
try{
 const result=await d.runFixture('parent');assert.equal(returned.status,mode==='partial'?'partial':'blocked');assert.equal(returned.verificationStatus,'unverified');assert.deepEqual(returned.evidence,[]);assert(returned.unresolvedItems.includes('write'));
 const {port}=await d.start();
 const childList=await (await fetch(`http://127.0.0.1:${port}/api/runs/parent/subagents`)).json();
 assert.equal(childList.children[0].outcome.taskStatus,mode==='partial'?'partial':'blocked','Chat API must expose the child task result separately from run completion');
 assert.equal(d.harness.sessions.outcome('parent').verificationStatus,'unverified');assert.equal(d.harness.sessions.outcome('parent').taskStatus,mode==='partial'?'partial':'blocked');const usage=JSON.parse(result.messages.at(-1).metadata).activity.usage;
 assert.equal(usage.requests,5);assert.equal(usage.byPurpose.child.requests,2);assert.equal(usage.byPurpose.main.requests,3);assert(d.harness.subagents.list('parent').every(child=>child.state!=='running'));
}finally{await d.closeFixture();}
}
console.log('Child partial work cannot become verified parent evidence; child attempts consume root budget');
