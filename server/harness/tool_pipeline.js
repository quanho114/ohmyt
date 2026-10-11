import {toolResult} from './tool_results.js';
export class ToolPipeline {
  constructor({authorize,execute,guard=async()=>null,record=()=>{}}){Object.assign(this,{authorize,executor:execute,guard,record});}
  async execute({call,scope,signal,...context}){
    const startedAt=Date.now();let status,output;
    const finish=(status,output)=>{const result=toolResult(call.id,status,output,startedAt);const content=JSON.stringify(output ?? null, (key,value)=>key==='dataUrl'||key==='image_url'?undefined:value);this.record({type:'tool/result',eventId:`${context.runId}:${call.id}:receipt`,payload:{turnId:context.runId,callId:call.id,name:call.name,status,modelContent:content.length>16000?content.slice(0,16000)+' [truncated]':content,executionReceipt:result.executionReceipt}});return result;};
    if(!call?.id || !call.name || !call.arguments)throw new Error('Invalid tool call');
    if(signal?.aborted)return finish('cancelled',{error:'Run cancelled before execution'});
    this.record({type:'tool/call',eventId:`${context.runId}:${call.id}:intent`,payload:{turnId:context.runId,callId:call.id,name:call.name,arguments:call.arguments}});
    let decision;
    try{decision=await this.authorize({call,scope,signal,...context});}
    catch(error){return finish(signal?.aborted?'cancelled':'denied',{error:error.message});}
    if(signal?.aborted)return finish('cancelled',{error:'Run cancelled before execution'});
    if(decision.action!=='ALLOW')return finish('denied',{error:decision.reason || 'Policy denied action',rejected:decision.rejected===true});
    try{const veto=await this.guard({call,scope,signal,...context});if(veto?.action==='DENY')return finish('denied',{error:veto.reason || 'Guard denied action'});}
    catch(error){return finish(signal?.aborted?'cancelled':'denied',{error:error.message});}
    if(signal?.aborted)return finish('cancelled',{error:'Run cancelled before execution'});
    try{output=await this.executeBody(call,{...context,scope,signal});status=output?.success===false?'error':'success';}
    catch(error){status=signal?.aborted?(error.code==='TOOL_NOT_STARTED'?'cancelled':'unknown'):'error';output={error:error.message,code:error.code || 'ACTION_FAILED'};}
    return finish(status,output);
  }
  executeBody(call,context){return this.executor(call,context);}
  // Store callback separately from the method named execute.
  set executeCallback(value){this.executor=value;}
}
