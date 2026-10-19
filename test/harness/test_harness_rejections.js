import assert from 'node:assert/strict';
import {harnessFixture,stringSchema} from '../harness_fixture.js';
for(const mode of ['siblings','unknown','malformed','repeated','denied']){
 let requests=0,bodies=0;const observed=[];
 const fixture=await harnessFixture({tools:[{name:'fixture_read',parameters:stringSchema,execute:async args=>{bodies++;return {value:args.value};}}],stream:async opts=>{
  requests++;observed.push(structuredClone(opts.messages));
  if(opts.tools.length&&(mode==='repeated'||mode==='denied'||requests===1)){
   opts.onToolCall({id:`bad_${requests}`,name:mode==='unknown'?'absent_tool':'fixture_read',arguments:mode==='malformed'?'not JSON':mode==='denied'?{value:'denied'}:{}});
   if(mode==='siblings')opts.onToolCall({id:'good',name:'fixture_read',arguments:{value:'sibling'}});
  }else if(requests===2)opts.onToolCall({id:'corrected',name:'fixture_read',arguments:{value:'fixed'}});
  else opts.onChunk('The observed value is fixed.');
  return {completed:true};
 }});
 if(mode==='denied')fixture.permissions.evaluate=()=>({action:'DENY',matchedPolicy:'fixture'});
 try{
  const result=await fixture.runFixture(mode);
  const receipts=result.log.filter(e=>e.type==='tool/result'&&e.payload.executionReceipt);
  assert(receipts.length>0,'Each rejected call must have a canonical receipt');
  if(mode==='repeated'){assert.equal(bodies,0);assert.equal(requests,4);assert.equal(receipts.length,3);assert.equal(result.run.status,'failed');}
  else if(mode==='denied'){assert.equal(bodies,0);assert.equal(result.run.status,'failed');assert(receipts.every(e=>e.payload.status==='denied'));}
  else{
   assert.equal(requests,3);assert.equal(bodies,mode==='siblings'?2:1);
   assert.equal(receipts[0].payload.status,'error');assert.equal(receipts[0].payload.executionReceipt.bodyStarted,false);
   assert.equal(JSON.parse(receipts[0].payload.modelContent).code,mode==='unknown'?'UNKNOWN_TOOL':'INVALID_ARGS');
   const next=observed[1];assert(next.some(m=>m.role==='tool'&&m.tool_call_id==='bad_1'));
   if(mode==='siblings')assert(next.some(m=>m.role==='tool'&&m.tool_call_id==='good'));
  }
 }finally{await fixture.closeFixture();}
}
// Changed arguments for a reused provider identity cannot re-execute a mutation.
let calls=0,body=0;
const duplicate=await harnessFixture({tools:[{name:'fixture_read',parameters:stringSchema,execute:async()=>{body++;return 'ok';}}],stream:async o=>{calls++;o.onToolCall({id:'same',name:'fixture_read',arguments:{value:String(calls)}});return {completed:true};}});
try{const result=await duplicate.runFixture('collision');assert.equal(body,1);assert.equal(result.run.status,'failed');assert.match(result.run.error,/collision|reused/i);}finally{await duplicate.closeFixture();}
console.log('Recoverable invalid arguments/unknown names, ordered siblings, bounded correction, denial and identity collision');
