import assert from 'node:assert/strict';
import http from 'node:http';
import { streamChat as openai } from '../server/providers/adapters/openai-compatible.js';
import { streamChat as anthropic } from '../server/providers/adapters/anthropic.js';
import { streamChat as google } from '../server/providers/adapters/google.js';

const counters = new Map();
const requests = [];
const failures = [];
const server = http.createServer(async(req,res)=>{
  try {
    let raw='';for await (const chunk of req) raw+=chunk;
    const body=JSON.parse(raw);
    const kind=req.url.includes('streamGenerateContent')?'google':req.url==='/v1/messages'?'anthropic':'openai';
    const turn=(counters.get(kind)||0)+1;counters.set(kind,turn);requests.push({kind,body});
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    const send=value=>res.write(`data: ${JSON.stringify(value)}\n\n`);
    if (kind==='google') {
      if(turn===1) send({candidates:[{content:{parts:[
        {functionCall:{id:'native-1',name:'lookup',args:{value:'first'}},thoughtSignature:'signature-1'},
        {functionCall:{id:'native-2',name:'lookup',args:{value:'second'}}}
      ]},finishReason:'STOP'}]});
      else {
        assert.deepEqual(body.toolConfig,{functionCallingConfig:{mode:'NONE'}});
        assert.equal(body.tools,undefined);
        const model=body.contents.find(m=>m.role==='model');
        assert.equal(model.parts.length,2);assert.equal(model.parts[0].thoughtSignature,'signature-1');
        assert.deepEqual(model.parts.map(p=>p.functionCall.id),['native-1','native-2']);
        const results=body.contents.at(-1).parts;
        assert.deepEqual(results.map(p=>p.functionResponse.id),['native-1','native-2']);
        send({candidates:[{content:{parts:[{text:'Google verified.'}]},finishReason:'STOP'}]});
      }
    } else if(kind==='anthropic') {
      if(turn===1) {
        for(let index=0;index<2;index++) {
          send({type:'content_block_start',index,content_block:{type:'tool_use',id:`anthropic-${index}`,name:'lookup',input:{}}});
          send({type:'content_block_delta',index,delta:{type:'input_json_delta',partial_json:JSON.stringify({value:index?'second':'first'})}});
          send({type:'content_block_stop',index});
        }
        send({type:'message_delta',delta:{stop_reason:'tool_use'}});
      } else {
        assert.equal(body.messages[1].content.length,2);
        assert.deepEqual(body.messages.at(-1).content.map(p=>p.tool_use_id),['anthropic-0','anthropic-1']);
        send({type:'content_block_delta',delta:{type:'text_delta',text:'Anthropic verified.'}});
        send({type:'message_delta',delta:{stop_reason:'end_turn'}});
      }
      send({type:'message_stop'});
    } else {
      if(turn===1) send({choices:[{delta:{tool_calls:[0,1].map(index=>({index,id:`openai-${index}`,type:'function',function:{name:'lookup',arguments:JSON.stringify({value:index?'second':'first'})}}))},finish_reason:'tool_calls'}]});
      else {
        assert.deepEqual(body.messages.filter(m=>m.role==='tool').map(m=>m.tool_call_id),['openai-0','openai-1']);
        assert(!JSON.stringify(body).includes('providerMetadata'));
        send({choices:[{delta:{content:'OpenAI verified.'},finish_reason:'stop'}]});
      }
      res.write('data: [DONE]\n\n');
    }
    res.end();
  } catch(error) {failures.push(error);res.destroy(error);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  for(const [kind,stream] of [['openai',openai],['anthropic',anthropic],['google',google]]) {
    const calls=[];
    const messages=[{role:'user',content:'Look up first and second.'}];
    const options={baseURL:`http://127.0.0.1:${server.address().port}`,model:'fixture',messages,tools:[{name:'lookup',parameters:{type:'object',properties:{value:{type:'string'}},required:['value']}}],onChunk(){},onToolCall:call=>calls.push(call)};
    await stream(options);
    assert.equal(calls.length,2,`${kind}: repeated same-name calls remain distinct`);
    assert.deepEqual(calls.map(call=>call.arguments.value),['first','second']);
    messages.push({role:'assistant',content:'',tool_calls:calls.map(call=>({id:call.id,type:'function',function:{name:call.name,arguments:JSON.stringify(call.arguments)},providerMetadata:call.providerMetadata}))});
    for(const call of calls) messages.push({role:'tool',name:call.name,tool_call_id:call.id,content:JSON.stringify({result:call.arguments.value})});
    let final='';await stream({...options,tools:[],onChunk:text=>{final+=text;},onToolCall(){throw Error('Unexpected third call');}});
    assert(final.includes('verified'));
  }
  assert.equal(requests.length,6);assert.equal(failures.length,0);
} finally {await new Promise(resolve=>server.close(resolve));}
console.log('PASS canonical provider protocol: local HTTP OpenAI/Anthropic/Gemini, multiple same-name calls, paired results and thought signatures');
