import {useEffect,useState} from 'react';
import {api} from '../api.ts';
import {foldEvents,type ConversationState} from './conversationReducer.ts';
export function useSessionEvents(sessionId:string|null){
 const [state,setState]=useState<ConversationState|undefined>();
 useEffect(()=>{let disposed=false,running=false,current:ConversationState|undefined,revision=-1;setState(undefined);if(!sessionId)return;
 const refresh=async()=>{if(running)return;running=true;try{let page=await api.getSessionEvents(sessionId,current?.sequence || 0);if(disposed)return;if(page.revision!==revision){current=undefined;page=await api.getSessionEvents(sessionId,0);if(disposed)return;}revision=page.revision;
 do{if(disposed)return;for(let i=0;i<page.events.length;){const first=page.events[i];if(!current)current={sessionId,sequence:first.seq-1,events:[],artifacts:{}};else if(first.seq>current.sequence+1)current={...current,sequence:first.seq-1};let end=i+1;while(end<page.events.length&&page.events[end].seq===page.events[end-1].seq+1)end++;current=foldEvents(current,page.events.slice(i,end));i=end;}if(page.events.length<500)break;page=await api.getSessionEvents(sessionId,current?.sequence || 0);if(disposed)return;}while(true);
 if(!disposed)setState(current);
 }catch{}finally{running=false;}};void refresh();const interval=setInterval(refresh,1000);return()=>{disposed=true;clearInterval(interval);};},[sessionId]);return state;
}
