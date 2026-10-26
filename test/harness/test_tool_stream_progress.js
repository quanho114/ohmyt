import assert from 'node:assert/strict';
import {streamChat} from '../../server/providers/adapters/openai-compatible.js';
import {RequestAttempts} from '../../server/harness/attempts.js';
const originalFetch=globalThis.fetch;
let release;
const gate=new Promise(resolve=>{release=resolve;});
let notify;
const observed=new Promise(resolve=>{notify=resolve;});
let executed=0,requests=0;
const progress=[];
globalThis.fetch=async()=>{
 requests++;
 return {ok:true,body:(async function*(){
  yield new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'call-1',function:{name:'html_preview',arguments:'{"html":"'}}]}}]})+'\n\n');
  await gate;
  throw Object.assign(new Error('connection lost'),{code:'ECONNRESET'});
 })()};
};
try {
 const attempts=new RequestAttempts({stream:streamChat,record:()=>{}});
 const pending=attempts.run({baseURL:'http://fixture',model:'fixture',messages:[],onChunk:()=>{},onToolCall:()=>executed++,onToolProgress:value=>{progress.push(value);notify();}});
 const rejected=assert.rejects(pending,/connection lost/);
 await observed;
 assert.deepEqual(progress,[{id:'call-1',name:'html_preview',characters:9,argumentsText:'{"html":"'}]);
 assert.equal(executed,0,'Partial arguments must never execute a tool');
 assert.equal('arguments' in progress[0],false,'Display text never becomes executable tool arguments');
 release();await rejected;
 assert.equal(requests,1,'Progress marks partial output and prevents automatic retry');
 assert.equal(executed,0);
 console.log('PASS streamed tool progress before completion, no premature execution or retry');
} finally {release();globalThis.fetch=originalFetch;}

// Exercise production driver -> event -> invocation, with only the provider mocked.
const {harnessFixture}=await import('../harness_fixture.js');
let round=0;
const daemon=await harnessFixture({stream:async({onToolProgress,onToolCall,onChunk})=>{
 if(++round===1){
  onToolProgress({id:'draft',name:'html_preview',characters:48,argumentsText:'{"name":"demo.html","content":"<h1>Xin chào'});
  await new Promise(resolve=>setTimeout(resolve,520));
  onToolProgress({id:'draft',name:'html_preview',characters:60,argumentsText:'{"name":"demo.html","content":"<h1>Xin chào</h1>"}'});
  onToolCall({id:'draft',name:'html_preview',arguments:{name:'demo.html',content:'<h1>Xin chào</h1>'}});
 }else onChunk('Đã tạo trang.');
 return {completed:true};
}});
try{
 const result=await daemon.runFixture('live-html');
 const draftIndex=result.events.findIndex(e=>e.type==='HtmlDraft');
 const callIndex=result.events.findIndex(e=>e.type==='ToolCallStarted');
 assert(draftIndex>=0&&callIndex>draftIndex);
 assert.equal(result.events[draftIndex].payload.content,'<h1>Xin chào');
 const drafts=result.events.filter(e=>e.type==='HtmlDraft');
 assert.equal(drafts.length,2);assert.equal(drafts[1].payload.append,true);assert.equal(drafts[1].payload.content,'</h1>');
 assert.equal(result.events.filter(e=>e.type==='ToolCallStarted').length,1);
 assert.equal(result.run.status,'completed');
 console.log('PASS HTML draft event before canonical execution, successful receipt and normal conclusion');
}finally{await daemon.closeFixture();}
