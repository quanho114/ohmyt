// Subscription installed before replay; synchronous SQLite read cannot interleave
// with JS listeners. Cursor dedupe also covers idempotent append notifications.
export function subscribeSession(log,sessionId,afterSeq,send){
  let cursor=afterSeq;
  const forward=event=>{if(event.sessionId===sessionId && event.seq>cursor){send(event);cursor=event.seq;}};
  log.on('event',forward);
  try{let page;do{page=log.read(sessionId,{afterSeq:cursor,limit:500});for(const event of page)forward(event);}while(page.length===500);}catch(error){log.off('event',forward);throw error;}
  return ()=>log.off('event',forward);
}
