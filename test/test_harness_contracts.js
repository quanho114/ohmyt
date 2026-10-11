import assert from 'node:assert/strict';
import * as contracts from '../server/harness/contracts.js';
assert.equal(typeof contracts.validateSessionEvent,'function','semantic event validator must exist');
const event={sessionId:'s',seq:1,eventId:'e',version:1,type:'turn/start',payload:{turnId:'r'},createdAt:1};
assert.deepEqual(contracts.validateSessionEvent(event),event);
for(const patch of [{sessionId:''},{seq:0},{version:2},{eventId:''},{payload:null},{type:'TextDelta'}]) assert.throws(()=>contracts.validateSessionEvent({...event,...patch}));
assert.throws(()=>contracts.validateToolResult({callId:'c',status:'unknown',executionReceipt:{success:true}}));
assert.doesNotThrow(()=>contracts.validateToolResult({callId:'c',status:'unknown',modelContent:'Outcome unknown',artifactRefs:[],executionReceipt:{status:'unknown'}}));
console.log('Harness contracts passed');
