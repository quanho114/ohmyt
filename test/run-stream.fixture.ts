import {api} from '../src/api.ts';
const events:unknown[]=[],errors:string[]=[];
let close:()=>void;
(window as any).streamFixture={events,errors,start:()=>{close=api.subscribeRunStream('reconnect',event=>events.push(event),error=>errors.push(error.message));},close:()=>close?.()};
