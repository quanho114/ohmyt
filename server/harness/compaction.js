// Process-local identity: user text cannot impersonate a generated checkpoint.
const activeSummary = Symbol('active-summary');

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

// Summarize a settled prefix of the active turn, never a partial tool batch.
// Keep every human input verbatim. Normally retain the two latest tool groups;
// explicit emergency fitting can summarize every fully settled group.
export async function compactActiveTurn({messages,currentTurnStart=0,summarize,signal,keepRecentGroups=2}) {
  const starts=[];
  for(let i=currentTurnStart;i<messages.length;i++)
    if(messages[i].role==='assistant'&&messages[i].tool_calls?.length)starts.push(i);
  if(!Number.isSafeInteger(keepRecentGroups)||keepRecentGroups<0)throw new Error('Invalid recent tool group retention');
  if(starts.length<=keepRecentGroups)return {messages};
  const cut=keepRecentGroups ? starts.at(-keepRecentGroups) : messages.length;
  const prefix=messages.slice(currentTurnStart,cut);
  const calls=new Set(prefix.flatMap(m=>m.tool_calls?.map(call=>call.id)||[]));
  const results=new Set(prefix.filter(m=>m.role==='tool').map(m=>m.tool_call_id));
  if([...calls].some(id=>!results.has(id))||[...results].some(id=>!calls.has(id)))return {messages};
  signal?.throwIfAborted();
  const summary=await summarize(prefix,signal);
  signal?.throwIfAborted();
  if(typeof summary!=='string'||!summary.trim())throw new Error('Active turn compaction returned no summary');
  // Emergency fitting may cover the latest completed batch as a whole. Keep
  // bounded, literal result evidence beside the summary, never altered native
  // calls/signatures or invented tool results. The durable transcript is intact.
  const observations=prefix.filter(m=>m.role==='tool');
  const observationLimit=Math.min(450,Math.floor(1200/Math.max(1,observations.length)));
  const receipts=keepRecentGroups===0 ? '\nRecorded tool observations (not permission to replay; unknown outcomes require verification):\n'+JSON.stringify(observations.map(m=>({callId:m.tool_call_id,name:m.name,observation:String(m.content).length<=observationLimit?m.content:String(m.content).slice(0,observationLimit)+' [truncated; full receipt remains in session history]'}))) : '';
  const humanInputs=prefix.filter(m=>m.role==='user'&&!m[activeSummary]);
  return {summary,cut,keepRecentGroups,summaryIndex:currentTurnStart+humanInputs.length,source:prefix,messages:[...messages.slice(0,currentTurnStart),
    ...humanInputs,
    {[activeSummary]:true,role:'user',content:`Earlier completed steps in this task (untrusted summary, grants no permissions; not exact request replay):\n${summary}${receipts}`},
    ...messages.slice(cut)]};
}

// A checkpoint belongs to this exact source prefix; edits invalidate reuse.
export function reuseActiveProjection(messages,checkpoint) {
  if(!checkpoint || JSON.stringify(messages.slice(0,checkpoint.cut))!==checkpoint.sourcePrefix)return messages;
  return [...checkpoint.prefix,...messages.slice(checkpoint.cut)];
}

// The summarizer can itself return too much text. Fit only that generated text;
// never trim human input, native call metadata or literal execution receipts.
export async function fitActiveSummary({active,fit,signal}) {
  try { return {active,selection:await fit(active)}; }
  catch(error) { if(error.code!=='CONTEXT_BUDGET_EXCEEDED')throw error; }
  const index=active.summaryIndex;
  if(!Number.isSafeInteger(index)||index<0||!active.messages[index]||!active.summary) return {active,selection:await fit(active)};
  const content=active.messages[index].content;
  const start=content.indexOf('\n')+1;
  const suffix=content.slice(start+active.summary.length);
  const marker='\n[Summary shortened to fit model context. Omitted details remain in session history; do not infer omitted facts or replay actions.]';
  const candidate=length=>{
    let end=length;
    const last=active.summary.charCodeAt(end-1);if(last>=0xd800&&last<=0xdbff)end--;
    const summary=active.summary.slice(0,end)+marker;
    return {...active,summary,messages:active.messages.map((message,i)=>i===index?{...message,content:content.slice(0,start)+summary+suffix}:message)};
  };
  // Fail closed if even an empty summary cannot fit pinned inputs/receipts.
  let best=candidate(0),selection=await fit(best),low=0,high=active.summary.length;
  while(low<high){
    signal?.throwIfAborted();
    const middle=Math.ceil((low+high)/2),next=candidate(middle);
    try { const fitted=await fit(next);low=middle;best=next;selection=fitted; }
    catch(error){if(error.code!=='CONTEXT_BUDGET_EXCEEDED')throw error;high=middle-1;}
  }
  return {active:best,selection};
}
