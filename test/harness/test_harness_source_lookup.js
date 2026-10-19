import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {lookupText} from '../../server/harness/source_text.js';
import {DocumentContexts} from '../../server/document_context.js';
import {harnessFixture} from '../harness_fixture.js';
const source='Title\n'+ 'Some unrelated paragraph or row.\n'.repeat(1000)+'Customer KEY-42: amount 1250\nEnd 😀';
const started=performance.now();
for(let i=0;i<100;i++){
 const found=lookupText(source,{query:'KEY-42',limit:300});
 assert(found.found);assert(found.content.includes('amount 1250'));assert(found.content.length<=300);assert.equal(source.slice(found.matchOffset,found.matchOffset+6),'KEY-42');
}
console.log('100 exact source lookups ms:',(performance.now()-started).toFixed(2));
assert.equal(lookupText(source,{query:'not found'}).found,false);
assert.equal(lookupText('A😀B',{offset:2,limit:2}).content,'😀');
assert.throws(()=>lookupText(source,{query:' '}));
const contexts=new DocumentContexts();
for(let i=0;i<10;i++)contexts.update('scope',{key:String(i),text:'Reference: '+JSON.stringify({scope:'scope',path:`file${i}.docx`,grantId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',version:'a'.repeat(64)})+'\n'+'content '.repeat(1900)});
assert(contexts.prompt('scope').length<15000,'Many documents cannot inject 200KB into every request');
assert.equal(contexts.sessions.get('scope').size,10);assert.equal(contexts.prompt('foreign'),'');
let daemon,current;
daemon=await harnessFixture({stream:async options=>{
 const result=options.messages.findLast(m=>m.role==='tool');
 if(!result)options.onToolCall({id:'lookup',name:'read_open_documents',arguments:{path:current,query:'KEY-42',limit:300}});
 else{const data=JSON.parse(result.content);assert.equal(data.reference.path,current);assert(data.found);assert(data.content.includes('amount 1250'));assert(data.content.length<=300);options.onChunk('Found the exact requested value in the snapshot.');}
 return {completed:true};
}});
try{
 for(const [index,name] of ['report.docx','ledger.xlsx','notes.md'].entries()){
  current=name;const id=`source-${index}`;
  daemon.agentLoop.documentContexts.update(id,{key:'tab',text:'Reference: '+JSON.stringify({scope:id,path:name,grantId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',version:String(index+1).repeat(64)})+'\n'+'source '.repeat(1000)+'\nCustomer KEY-42: amount 1250\n'});
  const run=await daemon.runFixture(id);assert.equal(run.run.status,'completed');
 }
 console.log('Source retrieval: Word/Excel/Markdown snapshots use the actual scoped tool path and bounded exact queries');
}finally{await daemon.closeFixture();}
