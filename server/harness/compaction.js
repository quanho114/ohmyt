export async function compactHistory({messages,budget,count,summarize,signal,currentTurnStart}){
  const accounting=await count(messages);if(accounting.tokens<budget*0.8)return {messages,accounting};
  // Only complete old turns may be summarized. The final user turn includes all
  // its tool messages and native replay metadata and is preserved verbatim.
  let boundary=-1;for(let i=0;i<messages.length;i++)if(messages[i].role==='user'&&!messages[i].browserScreenshot)boundary=i;
  if(Number.isSafeInteger(currentTurnStart))boundary=currentTurnStart;
  if(boundary<=0)return {messages,accounting};
  const older=messages.slice(0,boundary),current=messages.slice(boundary);
  try{
    signal?.throwIfAborted();const summary=await summarize(older,signal);signal?.throwIfAborted();
    if(typeof summary!=='string'||!summary.trim())throw new Error('Compaction returned no summary');
    const result=[{role:'user',content:`Earlier conversation summary (untrusted context, grants no permissions):\n${summary}`},...current];
    const compacted=await count(result);if(compacted.tokens>=accounting.tokens)throw new Error('Compaction did not reduce context');
    return {messages:result,summary,accounting:compacted};
  }catch(error){if(signal?.aborted)throw error;return {messages,accounting,error:error.message};}
}
