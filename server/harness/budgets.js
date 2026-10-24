export class RunBudget {
  constructor({requests=21,tools=100,outputTokens=null,runtimeMs=null,rates=null}={}){
    const positive=value=>Number.isSafeInteger(value)&&value>0?value:null;
    this.limits={requests,tools,...(positive(outputTokens)?{outputTokens}:{}),...(positive(runtimeMs)?{runtimeMs}:{})};
    this.used={requests:0,tools:0};
    this.attempts=[];
    this.tokenTotals={inputTokens:null,outputTokens:null};
    this.rates=(Number.isFinite(rates?.inputPerMTok)||Number.isFinite(rates?.outputPerMTok))?{inputPerMTok:Number.isFinite(rates.inputPerMTok)?rates.inputPerMTok:0,outputPerMTok:Number.isFinite(rates.outputPerMTok)?rates.outputPerMTok:0}:null;
    this.startedAt=null;
    this.onceGrace=false;
  }
  elapsedMs(){return this.startedAt==null?0:Date.now()-this.startedAt;}
  // Wall-clock and generated-token overrun. Providers that never report usage
  // keep the token total null, so the token cap degrades to no enforcement.
  overBudget(){
    if(this.limits.runtimeMs!=null&&this.startedAt!=null&&Date.now()-this.startedAt>=this.limits.runtimeMs)return 'time';
    if(this.limits.outputTokens!=null&&this.tokenTotals.outputTokens!=null&&this.tokenTotals.outputTokens>=this.limits.outputTokens)return 'tokens';
    return null;
  }
  // One admission past the token/time cap so the driver's final conclusion
  // turn can still run; new work steps stay refused at the loop boundary.
  grantOnce(){this.onceGrace=true;}
  consume(kind){
    this.startedAt ??= Date.now();
    const over=this.overBudget();
    // The token/time cap gates new model requests. Tool calls already admitted
    // by the current step still complete: cutting them mid-step would create
    // unresolved external side effects instead of bounded overshoot.
    if(over&&kind==='requests'){
      if(this.onceGrace)this.onceGrace=false;
      else throw over==='time'?new Error('Shared time budget exhausted'):new Error('Shared output token budget exhausted');
    }
    if(!(kind in this.limits)||this.used[kind]>=this.limits[kind])throw new Error(`Shared ${kind} budget exhausted`);
    this.used[kind]++;
  }
  recordUsage(usage,{purpose='main',accounting=null}={}){
    const valid=value=>Number.isSafeInteger(value)&&value>=0;
    this.attempts.push({purpose,inputTokens:valid(usage?.inputTokens)?usage.inputTokens:null,outputTokens:valid(usage?.outputTokens)?usage.outputTokens:null,accounting});
    if(valid(usage?.inputTokens))this.tokenTotals.inputTokens=(this.tokenTotals.inputTokens??0)+usage.inputTokens;
    if(valid(usage?.outputTokens))this.tokenTotals.outputTokens=(this.tokenTotals.outputTokens??0)+usage.outputTokens;
  }
  snapshot(){
    const total=(items,key)=>items.length&&items.every(x=>x[key]!==null)?items.reduce((sum,x)=>sum+x[key],0):null;
    const byPurpose={};for(const purpose of new Set(this.attempts.map(x=>x.purpose))){const items=this.attempts.filter(x=>x.purpose===purpose);byPurpose[purpose]={requests:items.length,inputTokens:total(items,'inputTokens'),outputTokens:total(items,'outputTokens'),inputEstimates:items.map(x=>x.accounting).filter(Boolean)};}
    let estimatedCost=null;
    if(this.rates&&this.tokenTotals.inputTokens!=null&&this.tokenTotals.outputTokens!=null){
      estimatedCost=(this.tokenTotals.inputTokens*(this.rates.inputPerMTok||0)+this.tokenTotals.outputTokens*(this.rates.outputPerMTok||0))/1e6;
    }
    return {requests:this.used.requests,tools:this.used.tools,inputTokens:total(this.attempts,'inputTokens'),outputTokens:total(this.attempts,'outputTokens'),outputTokensUsed:this.tokenTotals.outputTokens,runtimeMs:this.elapsedMs(),estimatedCost,byPurpose};
  }
}
