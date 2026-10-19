import assert from 'node:assert/strict';
import {DocumentContexts} from '../../server/document_context.js';
const contexts=new DocumentContexts();
const reference={scope:'a',path:'a.md',grantId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',version:'a'.repeat(64)};
const text='Reference: '+JSON.stringify(reference)+'\nContent: test';
contexts.update('a',{key:'file',text});assert(contexts.prompt('a').includes('Content: test'));assert.equal(contexts.prompt('b'),'');
assert.throws(()=>contexts.update('b',{key:'file',text}));assert.throws(()=>contexts.update('a',{key:'file',text:'x'.repeat(20001)}));
contexts.update('a',{key:'file',text:null});assert.equal(contexts.prompt('a'),'');
contexts.update('a',{key:'file',text});contexts.clear('a');assert.equal(contexts.sessions.size,0);
console.log('Backend document context: session isolation, bounded snapshots, close and clear passed');

const {streamChat}=await import('../../server/providers/adapters/google.js');
contexts.update('a',{key:'file',text});
const originalFetch=globalThis.fetch;let captured;
try{
  globalThis.fetch=async (_url,options)=>{
    captured=JSON.parse(options.body);
    return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'I can read a.md'}]},finishReason:'STOP'}]})+'\n',{status:200});
  };
  await streamChat({baseURL:'http://fixture',apiKey:'fixture',model:'gemini-fixture',messages:[{role:'system',content:contexts.prompt('a')},{role:'user',content:'Can you see my open file?'}],onChunk:()=>{},onToolCall:()=>{}});
  assert(captured.system_instruction.parts[0].text.includes('Content: test'));
  assert(captured.system_instruction.parts[0].text.includes('Do not ask the user to upload'));
  assert.equal(captured.contents[0].parts[0].text,'Can you see my open file?');
}finally{globalThis.fetch=originalFetch;}
console.log('Gemini request serialization preserves open document context without changing user input');
