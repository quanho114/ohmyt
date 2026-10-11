import {randomUUID} from 'node:crypto';
export class RequestAttempts {
  constructor({stream,record,maxAttempts=2}){this.stream=stream;this.record=record;this.maxAttempts=maxAttempts;}
  async run(options){
    for(let index=0;index<this.maxAttempts;index++){
      const attemptId=randomUUID(),base={turnId:options.runId,stepId:`${options.runId}:${options.step}`,attemptId,index,purpose:options.purpose || 'main',accounting:options.accounting || null};
      let emitted=false,settled=false,reportedUsage=null;
      const wrap=callback=>(...args)=>{if(settled||options.signal?.aborted)return;emitted=true;callback?.(...args);};
      options.signal?.throwIfAborted();
      options.onAttempt?.();
      this.record({eventId:`${attemptId}:start`,type:'attempt/start',payload:base});
      try{
        options.signal?.throwIfAborted();
        const outcome=await this.stream({...options,onChunk:wrap(options.onChunk),onReasoning:wrap(options.onReasoning),onToolCall:wrap(options.onToolCall)});
        reportedUsage=outcome?.usage || null;
        options.signal?.throwIfAborted();
        if(outcome?.completed!==true)throw Object.assign(new Error('Provider ended without verified completion'),{code:'PROTOCOL'});
        settled=true;options.onUsage?.(outcome.usage || null,base);this.record({eventId:`${attemptId}:end`,type:'attempt/end',payload:{...base,status:'completed',usage:outcome.usage || null}});return outcome;
      }catch(error){
        settled=true;options.onUsage?.(reportedUsage,base);this.record({eventId:`${attemptId}:end`,type:'attempt/end',payload:{...base,status:options.signal?.aborted?'aborted':'failed',code:error.code || 'REQUEST_FAILED',usage:reportedUsage}});
        if(index===this.maxAttempts-1||emitted||options.signal?.aborted||!['UNREACHABLE','TIMEOUT','ECONNRESET'].includes(error.code))throw error;
      }
    }
  }
}
