import {limitToolContent} from './context.js';

export async function prepareRequestEnvelope({messages,tools=[],route,config,counters,signal}){
  signal?.throwIfAborted();
  const budget=config.contextTokens-config.reserveTokens;
  if(!Number.isSafeInteger(budget)||budget<1)throw Object.assign(new Error('No input context budget available'),{code:'CONTEXT_BUDGET_EXCEEDED'});
  const fixed=messages.filter(m=>m.role==='system'),history=messages.filter(m=>m.role!=='system');
  let boundary=config.currentTurnStart;
  if(!Number.isSafeInteger(boundary)){boundary=0;for(let i=0;i<history.length;i++)if(history[i].role==='user'&&!history[i].browserScreenshot)boundary=i;}
  boundary=Math.max(0,Math.min(boundary,history.length));
  let kept=history.map(m=>({...m})),omitted=0,shortened=0;
  const count=async()=>{signal?.throwIfAborted();const result=await counters.countRequest({messages:[...fixed,...kept],tools},route);signal?.throwIfAborted();return result;};
  let accounting=await count();
  while(accounting.tokens>budget&&boundary>0){
    let next=1;
    while(next<boundary&&!(kept[next].role==='user'&&!kept[next].browserScreenshot))next++;
    kept=kept.slice(next);boundary-=next;omitted+=next;accounting=await count();
  }
  for(const message of kept){
    if(accounting.tokens<=budget)break;
    if(message.role==='tool'&&typeof message.content==='string'&&message.content.length>600){message.content=limitToolContent(message.content,200);shortened++;accounting=await count();}
  }
  if(accounting.tokens>budget)throw Object.assign(new Error('Current turn and tool schemas exceed the configured input context budget'),{code:'CONTEXT_BUDGET_EXCEEDED',accounting});
  return {messages:[...fixed,...kept],tools,accounting,omitted,shortened};
}
