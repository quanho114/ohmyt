import {estimateTokens} from './context.js';
export class TokenCounters {
  constructor(){this.counters=new Map();}
  register(route,count){if(this.counters.has(route)||typeof count!=='function')throw new Error('Duplicate or invalid token counter');this.counters.set(route,count);return ()=>{if(this.counters.get(route)===count)this.counters.delete(route);};}
  async countRequest(request,route){
    const counter=this.counters.get(route);if(!counter)return {tokens:estimateTokens(request),accuracy:'estimated',source:'characters-and-image-allowance'};
    const result=await counter(request);if(!Number.isSafeInteger(result?.tokens)||result.tokens<0||!['exact','estimated'].includes(result.accuracy)||typeof result.source!=='string'||!result.source)throw new Error('Invalid token counter result');return Object.freeze({...result});
  }
}
