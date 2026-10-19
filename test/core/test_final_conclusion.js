import assert from 'node:assert/strict';
import {harnessFixture,stringSchema} from '../harness_fixture.js';

for(const mode of ['answer','empty','stuck','direct','resume-tools','translation']){
  let turns=0,executions=0;
  const translated='Tôi sẽ kiểm tra tác giả.';
  const answer='Tác giả commit gồm Ho Minh Quan và Antigravity Agent.';
  const d=await harnessFixture({config:{maxSteps:5},tools:[{
    name:'fixture_read',readOnly:true,exclusive:true,parameters:stringSchema,
    execute:()=>{executions++;return {success:true,stdout:'Ho Minh Quan\nAntigravity Agent'};}
  }],stream:async opts=>{
    turns++;
    if(mode==='direct')opts.onChunk('Xin chào bạn!');
    else if(mode==='translation')opts.onChunk(translated);
    else if(turns===1){opts.onChunk('Đang kiểm tra tác giả.');opts.onToolCall({id:'git',name:'fixture_read',arguments:{value:'git log'}});}
    else if(mode==='stuck'||mode==='empty'&&turns===2){assert.equal(opts.tools.some(t=>t.name==='fixture_read'),turns!==6);}
    else if(mode==='resume-tools'&&turns===2)opts.onToolCall({id:'lookup',name:'fixture_read',arguments:{value:'git log'}});
    else {assert(opts.messages.some(m=>typeof m.content==='string'&&m.content.includes('Ho Minh Quan')));opts.onChunk(answer);}
    return {completed:true};
  }});
  try {
    const prompt=mode==='translation'?'Translate this sentence into Vietnamese: I will check the author.':mode==='direct'?'Chào bạn':'Ai là tác giả?';
    const result=await d.runFixture(mode,prompt),saved=result.messages.at(-1);
    if(mode==='stuck'){
      assert(result.events.some(e=>e.type==='RunFailed'));assert(saved.content.includes('chưa đưa ra câu trả lời'));
    }else{
      const expected=mode==='direct'?'Xin chào bạn!':mode==='translation'?translated:answer;
      assert(result.events.some(e=>e.type==='RunCompleted'));assert.equal(saved.content,expected);
      let live='';for(const e of result.events){if(e.type==='TextReset')live='';if(e.type==='TextDelta')live+=e.payload.delta;}
      assert.equal(live,saved.content);
    }
    assert.equal(turns,mode==='stuck'?6:['direct','translation'].includes(mode)?1:['empty','resume-tools'].includes(mode)?3:2);
    assert.equal(executions,['direct','translation'].includes(mode)?0:mode==='resume-tools'?2:1);
  } finally {await d.closeFixture();}
}
console.log('PASS conclusions: configured step limit, bounded empty recovery, direct answers and translated action phrases without lexical retries');
