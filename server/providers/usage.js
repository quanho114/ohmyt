// inputTokens includes cached input; reasoningTokens is a subset of outputTokens.
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function normalizeUsage(kind,value){
 if(!value)return null;
 let input,output,cache,write,reasoning;
 if(kind==='anthropic'){
  cache=value.cache_read_input_tokens;write=value.cache_creation_input_tokens;
  input=count(value.input_tokens)?value.input_tokens+(cache??0)+(write??0):undefined;output=value.output_tokens;
 }else if(kind==='google'){
  input=value.promptTokenCount;cache=value.cachedContentTokenCount;reasoning=value.thoughtsTokenCount;
  output=count(value.candidatesTokenCount)?value.candidatesTokenCount+(reasoning??0):undefined;
 }else{
  input=value.prompt_tokens;output=value.completion_tokens;cache=value.prompt_tokens_details?.cached_tokens??value.prompt_cache_hit_tokens;reasoning=value.completion_tokens_details?.reasoning_tokens;
 }
 if(!count(input)||!count(output)||[cache,write,reasoning].some(n=>n!==undefined&&!count(n))||(cache??0)+(write??0)>input||(reasoning??0)>output)return null;
 return {inputTokens:input,outputTokens:output,...(cache!==undefined?{cacheReadTokens:cache}:{}),...(write!==undefined?{cacheWriteTokens:write}:{}),...(reasoning!==undefined?{reasoningTokens:reasoning}:{}),source:'provider'};
}
