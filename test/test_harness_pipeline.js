import assert from 'node:assert/strict';
import {ToolPipeline} from '../server/harness/tool_pipeline.js';
const records=[];let executions=0;
const pipeline=new ToolPipeline({record:e=>records.push(e),authorize:async()=>({action:'DENY'}),execute:async()=>{executions++;return 'ok';}});
const denied=await pipeline.execute({call:{id:'c',name:'write',arguments:{}},scope:{},signal:new AbortController().signal});assert.equal(denied.status,'denied');assert.equal(executions,0);
const allowed=new ToolPipeline({record:e=>records.push(e),authorize:async()=>({action:'ALLOW'}),execute:async()=>{executions++;return {value:42};}});
const success=await allowed.execute({call:{id:'c2',name:'read',arguments:{}},scope:{},signal:new AbortController().signal});assert.equal(success.status,'success');assert.equal(success.executionReceipt.status,'success');assert(Object.isFrozen(success.executionReceipt));assert.equal(executions,1);
const cancelled=new AbortController();cancelled.abort();const result=await allowed.execute({call:{id:'c3',name:'write',arguments:{}},signal:cancelled.signal,scope:{}});assert.equal(result.status,'cancelled');assert.equal(executions,1);
console.log('Authoritative tool pipeline passed');
