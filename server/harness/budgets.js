export class RunBudget {
  constructor({requests=21,tools=100}={}){this.limits={requests,tools};this.used={requests:0,tools:0};this.attempts=[];}
  consume(kind){if(!(kind in this.limits)||this.used[kind]>=this.limits[kind])throw new Error(`Shared ${kind} budget exhausted`);this.used[kind]++;}
  recordUsage(usage,{purpose='main',accounting=null}={}){
    const valid=value=>Number.isSafeInteger(value)&&value>=0;
    this.attempts.push({purpose,inputTokens:valid(usage?.inputTokens)?usage.inputTokens:null,outputTokens:valid(usage?.outputTokens)?usage.outputTokens:null,accounting});
  }
  snapshot(){
    const total=(items,key)=>items.length&&items.every(x=>x[key]!==null)?items.reduce((sum,x)=>sum+x[key],0):null;
    const byPurpose={};for(const purpose of new Set(this.attempts.map(x=>x.purpose))){const items=this.attempts.filter(x=>x.purpose===purpose);byPurpose[purpose]={requests:items.length,inputTokens:total(items,'inputTokens'),outputTokens:total(items,'outputTokens'),inputEstimates:items.map(x=>x.accounting).filter(Boolean)};}
    return {requests:this.used.requests,tools:this.used.tools,inputTokens:total(this.attempts,'inputTokens'),outputTokens:total(this.attempts,'outputTokens'),estimatedCost:null,byPurpose};
  }
}
