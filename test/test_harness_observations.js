import assert from 'node:assert/strict';
import {harnessFixture,stringSchema} from './harness_fixture.js';
const full='prefix:'+('full-evidence-'.repeat(5000))+':end';let live;
const d=await harnessFixture({tools:[{name:'large',parameters:stringSchema,execute:()=>({value:full})}],stream:async options=>{const result=options.messages.find(m=>m.role==='tool');if(result){live=result.content;options.onChunk('The full result is available in an artifact.');}else options.onToolCall({id:'large',name:'large',arguments:{value:'x'}});return {completed:true};}});
try{
 const result=await d.runFixture('observations');const receipt=result.log.find(e=>e.type==='tool/result'&&e.payload.executionReceipt).payload;
 assert.equal(live,receipt.modelContent);assert.equal(result.history.find(m=>m.tool_call_id==='large').content,live);assert(live.length<=12000);assert.match(live,/truncated/);assert.equal(receipt.artifactRefs.length,1);
 const artifact=d.harness.artifacts.get(receipt.artifactRefs[0].artifactId,'observations');assert.equal(JSON.parse(artifact.content).value,full);
 assert.throws(()=>d.harness.artifacts.get(artifact.artifactId,'other'),/scope/);
 d.db.db.prepare("UPDATE harness_turns SET messages_json='[]'").run();assert.equal(d.harness.sessions.history('observations').find(m=>m.tool_call_id==='large').content,live);
 assert(result.events.find(e=>e.type==='ToolCallCompleted').payload.output.value===full);
 d.db.db.prepare('DELETE FROM messages WHERE id=?').run(d.harness.sessions.get('observations').user_message_id);assert.throws(()=>d.harness.artifacts.get(artifact.artifactId,'observations'));
}finally{await d.closeFixture();}
console.log('Canonical bounded live/replay observations retain scoped full output, locators and deletion lifecycle');
