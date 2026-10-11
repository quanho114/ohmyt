import assert from 'node:assert/strict';
import {harnessFixture,stringSchema} from './harness_fixture.js';
let mutations=0,after=0;
const d=await harnessFixture({tools:[{name:'uncertain_write',parameters:stringSchema,execute:()=>{mutations++;throw new Error('Connection lost after external mutation');}},{name:'next_write',parameters:stringSchema,execute:()=>{after++;return {saved:true};}}],stream:async options=>{if(options.tools.length){options.onToolCall({id:'first',name:'uncertain_write',arguments:{value:'write'}});options.onToolCall({id:'next',name:'next_write',arguments:{value:'write'}});}else options.onChunk('External state must be checked before retrying.');return {completed:true};}});
try{
 const result=await d.runFixture('uncertain');assert.equal(mutations,1);assert.equal(after,0);const receipt=result.log.find(e=>e.payload.callId==='first'&&e.payload.executionReceipt).payload;
 assert.equal(receipt.status,'unknown');assert.equal(receipt.executionReceipt.bodyStarted,true);assert.equal(d.harness.sessions.outcome('uncertain').taskStatus,'unknown');assert.equal(d.harness.sessions.outcome('uncertain').verificationStatus,'unverified');
 assert.equal(result.history.filter(m=>m.role==='tool').length,2);assert.equal(result.run.status,'failed');
}finally{await d.closeFixture();}
console.log('Thrown mutation outcome stays unknown; no sibling mutation or automatic retry after uncertain effect');
