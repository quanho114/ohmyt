import assert from 'node:assert/strict';
import {taskOutcome} from '../server/harness/outcomes.js';
import {harnessFixture,stringSchema} from './harness_fixture.js';
for(const mode of ['masked','success','oracle-pass','oracle-fail','denied','corrected']){
 let requests=0;
 const fixture=await harnessFixture({tools:[
  {name:'fixture_read',parameters:stringSchema,readOnly:true,resourceKeys:['fixture:read'],execute:async args=>({value:args.value})},
  {name:'fixture_write',parameters:stringSchema,execute:async()=>({success:false,error:'Required write failed'})}
 ],stream:async opts=>{
  requests++;
  if(requests===1){
   if(mode==='corrected')opts.onToolCall({id:'bad',name:'fixture_read',arguments:{}});
   else{
    if(mode==='masked'||mode==='denied')opts.onToolCall({id:'required',name:'fixture_write',arguments:{value:'required'}});
    opts.onToolCall({id:'read',name:'fixture_read',arguments:{value:'unrelated'}});
   }
  }else if(mode==='corrected'&&requests===2)opts.onToolCall({id:'corrected',name:'fixture_read',arguments:{value:'fixed'}});
  else opts.onChunk('Everything completed successfully.');
  return {completed:true};
 }});
 if(mode==='denied')fixture.permissions.evaluate=name=>({action:name==='fixture_write'?'DENY':'ALLOW'});
 try{
  fixture.db.createSession(mode,'fixture','Explicit title');
  await fixture.agentLoop.run({runId:mode,sessionId:mode,prompt:'Perform required task',verifyTask:mode.startsWith('oracle')?async()=>({verified:mode==='oracle-pass',evidenceRefs:['oracle:test']}):undefined});
  const result=fixture.harness.sessions.outcome(mode);
  assert(result,'Outcome is durable and distinct from protocol completion');
  assert.equal(result.version,1);
  if(mode==='masked'){assert.equal(result.taskStatus,'partial');assert.equal(result.verificationStatus,'unverified');assert(result.unresolvedCallIds.includes('required'));}
  if(mode==='success'||mode==='corrected'){assert.equal(result.taskStatus,'unknown');assert.equal(result.verificationStatus,'unverified');if(mode==='corrected')assert.deepEqual(result.unresolvedCallIds,[]);}
  if(mode==='oracle-pass'){assert.equal(result.taskStatus,'completed');assert.equal(result.verificationStatus,'verified');assert.deepEqual(result.evidenceRefs,['oracle:test']);}
  if(mode==='oracle-fail'){assert.equal(result.taskStatus,'failed');assert.equal(result.verificationStatus,'unverified');}
  if(mode==='denied')assert.equal(result.taskStatus,'blocked');
  const message=fixture.db.getMessages(mode).filter(m=>m.sender==='agent').at(-1);
  assert.deepEqual(JSON.parse(message.metadata).activity.outcome,result);
  const terminal=fixture.db.getRunEvents(mode).filter(e=>['RunCompleted','RunFailed'].includes(e.event_type)).at(-1);
  const payload=JSON.parse(terminal.payload);assert.deepEqual(payload.outcome,result);
  if(mode!=='oracle-pass')assert.doesNotMatch(payload.summary || '',/thành công|success/i);
 }finally{await fixture.closeFixture();}
}
console.log('Protocol settlement cannot assert task verification; independent oracle, failure, denial and corrected arguments survive persistence');

for(const evidenceRefs of [undefined,[],[null,17,''],'not-an-array']){const result=taskOutcome({results:[{callId:'tool',status:'success'}],verification:{verified:true,evidenceRefs}});assert.equal(result.verificationStatus,'unverified');assert.equal(result.taskStatus,'unknown');}
