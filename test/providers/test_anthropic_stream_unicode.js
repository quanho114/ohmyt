import assert from 'node:assert/strict';
import {streamChat} from '../../server/providers/adapters/anthropic.js';

const event=value=>'data: '+JSON.stringify(value)+'\n\n';
const originalFetch=globalThis.fetch;
const text='Tiếng Việt: đường dẫn tài liệu 📚';
const args={path:'tài liệu/đề xuất 📚.md'};
const wire=Buffer.from([
  event({type:'content_block_delta',delta:{type:'text_delta',text}}),
  event({type:'content_block_start',index:1,content_block:{type:'tool_use',id:'native-vn',name:'read',input:{}}}),
  event({type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:JSON.stringify(args)}}),
  event({type:'content_block_stop',index:1}),
  event({type:'message_delta',delta:{stop_reason:'tool_use'}}),
  event({type:'message_stop'})
].join(''));
try {
  // Every UTF-8 boundary is split, including JSON tool arguments and emoji.
  globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){
    for(let i=0;i<wire.length;i++)controller.enqueue(wire.subarray(i,i+1));controller.close();
  }}));
  let received='';const calls=[];
  const result=await streamChat({baseURL:'http://fixture.invalid',model:'fixture',messages:[{role:'user',content:'Read'}],
    onChunk:value=>received+=value,onToolCall:call=>calls.push(call)});
  assert.equal(result.completed,true);assert.equal(received,text);
  assert.deepEqual(calls,[{id:'native-vn',name:'read',arguments:args}]);
} finally {globalThis.fetch=originalFetch;}
console.log('Anthropic fragmented UTF-8 preserves Vietnamese text, emoji and exact tool arguments');
