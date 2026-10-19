import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=';
for(const mode of ['failures','thrown-observation','stalled','reset','batch']){
  let requests=0,bodies=0;
  const fixture=await harnessFixture({vision:true,tools:[{
    name:mode==='stalled'?'browser_act':'browser_observe',readOnly:mode!=='stalled',exclusive:true,parameters:{type:'object',properties:{tabId:{type:'integer'},snapshotId:{type:'string'},action:{type:'string'}},required:['tabId'],additionalProperties:false},
    execute:async()=>{bodies++;if(mode==='thrown-observation')throw new Error('Observation failed before any page mutation');return mode==='stalled'?{success:true,snapshotId:String(bodies),image:{dataUrl:png,name:'fixture.png'}}:mode==='reset'&&bodies===3?{success:true,page:'different'}:{success:false,error:'Browser unavailable'};}
  }],stream:async opts=>{
    requests++;
    if(opts.tools.length && !(mode==='reset'&&requests===6)){
      for(let i=0;i<(mode==='batch'?5:1);i++)opts.onToolCall({id:`call_${requests}_${i}`,name:mode==='stalled'?'browser_act':'browser_observe',arguments:{tabId:1,snapshotId:String(requests),action:'click'}});
    }else opts.onChunk('The browser result could not be verified.');
    return {completed:true};
  }});
  try{
    const result=await fixture.runFixture(mode);
    assert.equal(bodies,mode==='reset'?5:3,'No body may enter after stop threshold; success resets consecutive failures');
    assert.equal(requests,mode==='reset'?6:mode==='batch'?2:4);
    if(mode!=='reset'){
      assert.equal(result.run.status,'failed');assert.doesNotMatch(result.run.error,/not defined/);
      assert(result.events.some(e=>e.type==='RunFailed'));
      assert(!result.events.some(e=>e.type==='RunCompleted'));
    }
    for(const msg of result.history.filter(m=>m.tool_calls?.length))for(const call of msg.tool_calls){
      assert(result.history.some(m=>m.role==='tool'&&m.tool_call_id===call.id));
    }
    assert.equal(fixture.agentLoop.activeRuns.size,0);
  }finally{await fixture.closeFixture();}
}
console.log('Browser failures/stalls stop at threshold, reset on progress, settle skipped calls and release ownership');
