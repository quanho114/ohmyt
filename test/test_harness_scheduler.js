import assert from 'node:assert/strict';
import {schedule} from '../server/harness/scheduler.js';
let concurrent=0,max=0;const run=async call=>{concurrent++;max=Math.max(max,concurrent);await new Promise(r=>setTimeout(r,10));concurrent--;return call.id;};
const results=await schedule([{id:'1',readOnly:true,resourceKeys:['a']},{id:'2',readOnly:true,resourceKeys:['b']},{id:'3',readOnly:true,resourceKeys:['c']}],{execute:run,maxParallel:3});assert.equal(max,3);assert.deepEqual(results,['1','2','3']);
max=0;await schedule([{id:'1',readOnly:true,resourceKeys:['a']},{id:'2',readOnly:true,resourceKeys:['a']}],{execute:run,maxParallel:3});assert.equal(max,1);
max=0;await schedule([{id:'1'},{id:'2'}],{execute:run,maxParallel:3});assert.equal(max,1);
console.log('Tool scheduler disjoint reads and exclusive defaults passed');
