export interface SemanticEvent {sessionId:string;seq:number;eventId:string;version:number;type:string;payload:Record<string,unknown>;createdAt:number}
export interface ConversationState {sessionId:string;sequence:number;events:SemanticEvent[];artifacts:Record<string,Record<string,unknown>>}
export function foldEvents(previous:ConversationState|undefined,incoming:SemanticEvent[]):ConversationState{
 const base=previous || {sessionId:incoming[0]?.sessionId || '',sequence:0,events:[],artifacts:{}};
 const events=[...base.events],artifacts={...base.artifacts},ids=new Set(events.map(e=>e.eventId));let sequence=base.sequence;
 for(const event of incoming){if(event.sessionId!==base.sessionId)throw new Error('Wrong session event');if(ids.has(event.eventId))continue;if(event.seq!==sequence+1)throw new Error('Session event sequence gap');if(event.version!==1)throw new Error('Unsupported event version');ids.add(event.eventId);events.push(event);sequence=event.seq;if(event.type==='artifact/update')artifacts[String(event.payload.artifactId)]=event.payload;}
 return {sessionId:base.sessionId,sequence,events,artifacts};
}
