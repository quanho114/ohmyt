// Missing results stay model-visible errors; a projection never executes a tool.
export function projectModelHistory(events){
  const receipts=new Map(events.filter(e=>e.type==='tool/result'&&e.payload.modelContent).map(e=>[JSON.stringify([e.payload.turnId,e.payload.callId]),e.payload]));
  const messages=[];
  const turns=new WeakMap();
  for(const event of events)if(['message/user','message/assistant','tool/result'].includes(event.type) && event.payload.message){const message={...event.payload.message};turns.set(message,event.payload.turnId);messages.push(message);}
  const output=[];
  for(let i=0;i<messages.length;i++){
    const message=messages[i];output.push(message);
    if(!message.tool_calls?.length)continue;
    const seen=new Set();
    while(messages[i+1]?.role==='tool'){const result=messages[++i],receipt=receipts.get(JSON.stringify([turns.get(message),result.tool_call_id]));seen.add(result.tool_call_id);output.push(receipt?{...result,content:receipt.modelContent}:result);}
    for(const call of message.tool_calls)if(!seen.has(call.id))output.push({role:'tool',name:call.function.name,tool_call_id:call.id,content:receipts.get(JSON.stringify([turns.get(message),call.id]))?.modelContent || JSON.stringify({code:'INTERRUPTED',error:'Execution interrupted; outcome unknown. Verify state before retrying.'})});
  }
  return output;
}
export function projectConversation(events){
  return events.filter(e=>['message/user','message/assistant','turn/end','artifact/update','child/start','child/end'].includes(e.type));
}
