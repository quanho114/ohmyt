import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const html='<!doctype html><title>Neon</title><script>'+ 'const star=1;\n'.repeat(9000)+'</script>';
let main=0,summaries=0;
const d=await harnessFixture({config:{contextTokens:24000},stream:async options=>{
 if(options.purpose==='summary'){
  summaries++;assert.equal(options.tools.length,0);
  options.onChunk(JSON.stringify({facts:'html_preview call preview-large returned success:true and preview:true for neon.html. HTML is already available; do not recreate it.',artifactRefs:['neon.html'],decisions:[],openTasks:['Explain the preview to the user'],permissionBoundaries:[]}));
 }else{
  main++;
  if(main===1)options.onToolCall({id:'preview-large',name:'html_preview',arguments:{name:'neon.html',content:html},providerMetadata:{model:'fixture',thoughtSignature:'native-signature'}});
  else{
   assert(options.messages.some(m=>m.content==='Code something to preview'));
   assert(!JSON.stringify(options.messages).includes(html),'Oversized settled source must be projected, not sent verbatim');
   assert.match(JSON.stringify(options.messages),/neon.html/);
   options.onChunk('Created neon.html. Open the preview to play.');
  }
 }
 return {completed:true};
}});
try{
 const result=await d.runFixture('large-preview','Code something to preview');
 assert.equal(result.run.status,'completed',result.messages.at(-1)?.content);
 assert.equal(main,2);assert(summaries>0);
 const calls=result.history.flatMap(m=>m.tool_calls||[]);
 assert.equal(calls.filter(c=>c.id==='preview-large').length,1,'No automatic tool replay');
 const original=calls.find(c=>c.id==='preview-large');
 assert.equal(JSON.parse(original.function.arguments).content,html,'Durable source is preserved');
 assert.equal(original.providerMetadata.thoughtSignature,'native-signature');
 assert(result.history.some(m=>m.tool_call_id==='preview-large'));
 console.log('PASS oversized current tool: completed preview, bounded summary, original payload/native metadata and receipt preserved, no replay');
}finally{await d.closeFixture();}
