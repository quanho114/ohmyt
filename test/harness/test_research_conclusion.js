import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
for(const mode of ['missing','wrong','valid','resists','redirect']){
  let requests=0;
  const d=await harnessFixture({stream:async o=>{
    requests++;
    if(requests===1)o.onToolCall({id:'source',name:'web_fetch',arguments:{url:'https://example.org/implementation'}});
    else if(requests===2)o.onChunk(mode==='valid'?'The source implements addition. [Implementation](https://example.org/implementation)':mode==='wrong'?'This is verified. [Made-up citation](https://unread.example/claim)':'The source implements addition.');
    else{
      assert.equal(o.tools.length,0,'citation correction must not admit additional actions');
      assert(o.messages.some(m=>m.role==='system'&&(mode==='redirect'?m.content.includes('no source content was read')&&m.content.endsWith('[]'):m.content.includes('https://example.org/implementation'))));
      o.onChunk(mode==='resists'?'I still omit citations.':mode==='redirect'?'Only a redirect was observed. No source content was read, so the implementation could not be verified.':'The source implements addition. [Implementation](https://example.org/implementation)');
    }
    return {completed:true};
  }});
  try{
    d.tools.webReader={read:async url=>mode==='redirect'?{url,redirectUrl:'https://example.org/elsewhere',httpStatus:302}:{url,content:'function add(a, b) { return a + b; }',contentType:'text/plain',truncated:false}};
    const result=await d.runFixture(mode,'Inspect this implementation and explain the behavior.');
    assert.equal(requests,mode==='valid'?2:3,'at most one source-citation correction');
    const grounding=JSON.parse(result.messages.at(-1).metadata).activity.grounding;
    assert.equal(grounding.status,mode==='redirect'?'no_read_sources':mode==='resists'?'missing_citations':'cited');
    assert.equal(grounding.observedSources,mode==='redirect'?0:1);assert.equal(grounding.correctionAttempted,mode!=='valid');
    if(['resists','redirect'].includes(mode)){
      assert.match(result.messages.at(-1).content,/chưa được xác minh|chưa dẫn nguồn/i);
      assert.equal(JSON.parse(result.messages.at(-1).metadata).activity.status,'warnings');
    }
    let live='';for(const event of result.events){if(event.type==='TextReset')live='';if(event.type==='TextDelta')live+=event.payload.delta;}
    assert.equal(live,result.messages.at(-1).content,'host evidence notice must match persisted and streamed text');
    assert.equal(result.run.status,'completed');
  }finally{await d.closeFixture();}
}
console.log('PASS research conclusions: actual-source citations, one bounded text-only repair, honest unresolved grounding');
