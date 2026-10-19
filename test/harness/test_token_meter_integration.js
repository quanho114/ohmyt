import assert from 'node:assert/strict';
import {normalizeUsage} from '../../server/providers/usage.js';
import {contextBreakdown,measuredContext} from '../../server/harness/token_meter.js';
import {streamChat} from '../../server/providers/adapters/openai-compatible.js';
assert.deepEqual(normalizeUsage('openai',{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:80},completion_tokens_details:{reasoning_tokens:10}}),{inputTokens:100,outputTokens:20,cacheReadTokens:80,reasoningTokens:10,source:'provider'});
assert.equal(normalizeUsage('anthropic',{input_tokens:20,cache_read_input_tokens:80,output_tokens:10}).inputTokens,100);
assert.equal(normalizeUsage('google',{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:5}).outputTokens,15);
assert.equal(normalizeUsage('openai',{prompt_tokens:1,completion_tokens:-1}),null);
assert.equal(normalizeUsage('openai',{prompt_tokens:1,completion_tokens:2,prompt_tokens_details:{cached_tokens:3}}),null);
const parts=contextBreakdown([{role:'system',content:'abcd'},{role:'user',content:'abcd'}],[]);assert.equal(parts.system,5);assert.equal(parts.messages,9);assert.equal(parts.tools,0);
const accounting={tokens:100,contextTokens:1000,envelopeDigest:'a'};
assert.equal(measuredContext(accounting,{status:'completed',usage:{inputTokens:60,outputTokens:10}}).used,60);
assert.equal(measuredContext(accounting,{status:'failed',usage:{inputTokens:60}}).used,100);
const old=globalThis.fetch;
try{
 globalThis.fetch=async(_url,options)=>{assert.equal(JSON.parse(options.body).stream_options.include_usage,true);return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Hi'},finish_reason:'stop'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage:{prompt_tokens:123,completion_tokens:2}})+'\n\ndata: [DONE]\n\n');};
 const result=await streamChat({baseURL:'http://fixture',model:'fixture',messages:[],onChunk:()=>{},onToolCall:()=>{}});assert.equal(result.usage.inputTokens,123,'Usage-only terminal event survives parsing');
}finally{globalThis.fetch=old;}
console.log('PASS usage normalization, cache/reasoning subsets, missing usage, composition and terminal stream usage');
