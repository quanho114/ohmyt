// Composition follows DeepSeek's fixed-density convention; admission retains its
// conservative counter until route-specific calibration establishes safe bounds.
const textTokens=s=>Math.ceil(s.length/4);
export function contextBreakdown(messages,tools){
 const result={system:0,tools:tools.length?textTokens(JSON.stringify(tools))+4:0,messages:0,estimator:'fixed-density-v1'};
 for(const m of messages){
  let price=4;
  if(typeof m.content==='string')price+=textTokens(m.content)+(m.role==='system'?0:4);
  else price+=textTokens(JSON.stringify(m.content??''))+4;
  if(m.tool_calls)price+=textTokens(JSON.stringify(m.tool_calls));
  result[m.role==='system'?'system':'messages']+=price;
 }
 return result;
}
export function measuredContext(accounting,end){
 const usage=end?.status==='completed'?end.usage:null;
 const exact=Number.isSafeInteger(usage?.inputTokens)&&usage.inputTokens>=0;
 return {used:exact?usage.inputTokens:accounting.tokens,limit:accounting.contextTokens,reserved:accounting.reserveTokens,accuracy:exact?'exact':accounting.accuracy,providerId:accounting.providerId,modelId:accounting.modelId,
  ...(accounting.breakdown?{breakdown:accounting.breakdown}:{}),...(accounting.modelContextTokens?{modelLimit:accounting.modelContextTokens}:{}),
  ...(accounting.envelopeDigest?{source:exact?'provider':'estimate',estimatedInput:accounting.tokens,output:exact?usage.outputTokens:null}:{} )};
}
