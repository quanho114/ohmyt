import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';

for(const repeated of [false,true]){
  let requests=0,executions=0;
  const d=await harnessFixture({config:{maxSteps:5},tools:[{
    name:'fixture_read',readOnly:true,exclusive:true,
    parameters:{type:'object',properties:{command:{type:'string'}},required:['command'],additionalProperties:false},
    execute:()=>{executions++;return {success:true,stdout:'Known result'};}
  }],stream:async options=>{
    requests++;
    if(requests<=6||repeated)options.onToolCall({id:`call-${requests}`,name:'fixture_read',arguments:{command:'test'}});
    else {
      assert.equal(options.tools.length,0);
      const result=options.messages.find(message=>message.tool_call_id==='call-6');
      assert(JSON.parse(result.content).error.includes('not executed'));
      options.onChunk('Đã xác minh kết quả trước đó; chưa xác minh được thông tin bổ sung.');
    }
    return {completed:true};
  }});
  try {
    const result=await d.runFixture(`final-recovery-${repeated}`,'Kiểm tra thông tin');
    assert.equal(executions,5);assert.equal(requests,7);
    const saved=result.messages.at(-1);
    const rejected=JSON.parse(saved.metadata).activity.tools.find(tool=>tool.id==='call-6');
    assert(rejected,'A rejected tool must remain visible');assert.equal(rejected.status,'error');
    assert.equal(rejected.output.code,'TOOL_STEP_LIMIT');assert.deepEqual(rejected.input,{command:'test'});
    const receipt=result.log.find(e=>e.type==='tool/result'&&e.payload.callId==='call-6').payload;
    assert.equal(receipt.executionReceipt.bodyStarted,false);
    assert(result.events.some(event=>event.type===(repeated?'RunFailed':'RunCompleted')));
    if(repeated)assert(saved.content.includes('không thể kết luận'));
    else {
      let live='';for(const event of result.events){if(event.type==='TextReset')live='';if(event.type==='TextDelta')live+=event.payload.delta;}
      assert.equal(live,saved.content);
    }
  } finally {await d.closeFixture();}
}
console.log('PASS final tool recovery: configured limit, paired rejection, no extra execution, bounded retry and live text');
