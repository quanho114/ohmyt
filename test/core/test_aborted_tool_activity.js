import assert from 'node:assert/strict';
import {harnessFixture,stringSchema} from '../harness_fixture.js';
const entered=Promise.withResolvers(),gate=Promise.withResolvers();let writes=0;
const daemon=await harnessFixture({tools:[{name:'slow_write',parameters:stringSchema,execute:async()=>{writes++;entered.resolve();await gate.promise;return {saved:true};}}],stream:async options=>{options.onToolCall({id:'write',name:'slow_write',arguments:{value:'save'}});return {completed:true};}});
try{
 daemon.db.createSession('cancelled','fixture','Cancellation activity');
 const running=daemon.agentLoop.run({runId:'cancelled',sessionId:'cancelled',prompt:'Save the draft'});
 await entered.promise;daemon.agentLoop.abortRun('cancelled');
 const activity=()=>JSON.parse(daemon.db.getMessages('cancelled').find(message=>message.sender==='agent').metadata).activity;
 assert.equal(activity().tools[0].status,'unknown','Stopping after body start cannot claim the action was blocked');
 assert.equal(activity().tools[0].output.code,'TOOL_OUTCOME_UNKNOWN');
 gate.resolve();await running;
 assert.equal(writes,1);assert.equal(activity().tools[0].status,'unknown');
 assert.equal(activity().outcome.taskStatus,'unknown');
 assert.equal(daemon.harness.sessions.log.readAll('cancelled').filter(event=>event.type==='tool/result'&&event.payload.executionReceipt).length,1);
 console.log('PASS stopped chat preserves uncertain body effects before and after tool drain');
}finally{gate.resolve();await daemon.closeFixture();}
