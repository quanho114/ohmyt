import assert from 'node:assert/strict';
import {observeProgress} from '../../server/harness/progress.js';
const state=new Map();
const observe=(id,output,status='success',args={path:'target.xlsx'})=>observeProgress(state,[{id,name:'read',arguments:args}],new Map([[id,{status,output}]]));
assert.equal(observe('1','same'),false);
assert.equal(observe('2','same'),false);
assert.equal(observe('3','same'),true);
assert.equal(observe('4','changed'),false);
assert.equal(observe('5','changed'),false);
assert.equal(observe('6','changed'),true);
assert.equal(observe('7','changed','success',{path:'other.xlsx'}),false);
assert.equal(observe('8','changed','error'),false);
console.log('Progress observations: repeated identical success warns, changed evidence/arguments do not; no tool execution or replay');

const {observeToolRepeats}=await import('../../server/harness/progress.js');
const chain={};
const attempt=(id,args,status='error')=>observeToolRepeats(chain,[{id,name:'read',arguments:args}],new Map([[id,{status}]]));
assert.deepEqual(attempt('a',{path:'x',range:{start:1,end:2}}),[]);
assert.deepEqual(attempt('b',{range:{end:2,start:1},path:'x'}),[]);
assert.equal(attempt('c',{path:'x',range:{start:1,end:2}}).length,1,'Key order does not hide repeated calls');
assert.equal(attempt('d',{path:'different'}).length,0,'Different arguments reset the chain');
const successChain={};
const poll=id=>observeToolRepeats(successChain,[{id,name:'poll',arguments:{id:'job'}}],new Map([[id,{status:'success',output:{tick:id}}]]));
poll('1');poll('2');assert.equal(poll('3').length,1,'Advisory repeat detection does not require identical results or suppress polling');
chain.key=null;chain.count=0;assert.equal(attempt('steered',{path:'different'}).length,0);
const bounded={};for(let i=0;i<8;i++){
 const notices=observeToolRepeats(bounded,[{id:String(i),name:'write',arguments:{content:'x'.repeat(10000)}}],new Map([[String(i),{status:'denied'}]]));
 for(const note of notices){assert(note.length<1400);assert(note.includes('denial remains a denial'));}
}
console.log('DeepSeek repeat adaptation: canonical arguments, bounded advisory reminders and reset');
