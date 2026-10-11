export async function schedule(calls,{execute,signal,maxParallel=3}){
  if(!Number.isSafeInteger(maxParallel)||maxParallel<1||maxParallel>32)throw new Error('Invalid parallel tool limit');
  const results=[];let group=[],keys=new Set();
  const flush=async()=>{if(!group.length)return;signal?.throwIfAborted();const outcomes=await Promise.allSettled(group.map(call=>execute(call)));for(const outcome of outcomes){if(outcome.status==='rejected')throw outcome.reason;results.push(outcome.value);}group=[];keys.clear();};
  for(const call of calls){
    signal?.throwIfAborted();const safe=call.readOnly===true&&!call.exclusive&&Array.isArray(call.resourceKeys)&&call.resourceKeys.length>0;
    if(!safe){await flush();results.push(await execute(call));continue;}
    if(group.length>=maxParallel || call.resourceKeys.some(key=>keys.has(key)))await flush();
    group.push(call);for(const key of call.resourceKeys)keys.add(key);
  }
  await flush();return results;
}
