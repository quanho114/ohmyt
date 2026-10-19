import {toolResult} from './tool_results.js';
import {recordSource} from './research_sources.js';
export class ToolPipeline {
  constructor({authorize,execute,guard=async()=>null,record=()=>{},hasStarted,presentation,mayHaveSideEffects=false}){Object.assign(this,{authorize,executor:execute,guard,record,hasStarted,presentation,mayHaveSideEffects});}
  async execute({call,scope,signal,...context}){
    const startedAt=Date.now();let status,output,entered=false;
    const bodyStarted=()=>this.hasStarted?this.hasStarted():entered;
    const finish=(status,output)=>{
      const source=status==='success'?recordSource(call,output,scope?.scopeId):null;
      if(source)output={...output,source};
      const result=toolResult(call.id,status,output,startedAt,{bodyStarted:bodyStarted(),...(source?{source}:{})},this.presentation);
      this.record({type:'tool/result',eventId:`${context.runId}:${call.id}:receipt`,payload:{turnId:context.runId,callId:call.id,name:call.name,status,modelContent:result.modelContent,artifactRefs:result.artifactRefs,executionReceipt:result.executionReceipt}});return result;
    };
    if(!call?.id || !call.name || !call.arguments)throw new Error('Invalid tool call');
    if(signal?.aborted)return finish('cancelled',{error:'Run cancelled before execution'});
    this.record({type:'tool/call',eventId:`${context.runId}:${call.id}:intent`,payload:{turnId:context.runId,callId:call.id,name:call.name,arguments:call.arguments,bodyTrackingVersion:1}});
    let decision;
    try{decision=await this.authorize({call,scope,signal,...context});}
    catch(error){return finish(signal?.aborted?'cancelled':'denied',{error:error.message});}
    if(signal?.aborted)return finish('cancelled',{error:'Run cancelled before execution'});
    if(decision.action!=='ALLOW')return finish('denied',{error:decision.reason || 'Policy denied action',rejected:decision.rejected===true});
    try{const veto=await this.guard({call,scope,signal,...context});if(veto?.action==='DENY')return finish('denied',{error:veto.reason || 'Guard denied action'});}
    catch(error){return finish(signal?.aborted?'cancelled':'denied',{error:error.message});}
    if(signal?.aborted)return finish('cancelled',{error:'Run cancelled before execution'});
    try{
      entered=true;output=await this.executeBody(call,{...context,scope,signal});status=output?.code==='TOOL_OUTCOME_UNKNOWN'&&bodyStarted()?'unknown':output?.success===false?'error':'success';
      if(signal?.aborted){status=bodyStarted()?'unknown':'cancelled';output={error:'Execution cancelled; verify external state before any retry.',code:bodyStarted()?'TOOL_OUTCOME_UNKNOWN':'TOOL_NOT_STARTED'};}
    }
    catch(error){
      if(error.code==='TOOL_NOT_STARTED')entered=false;
      status=signal?.aborted?(bodyStarted()?'unknown':'cancelled'):bodyStarted()&&this.mayHaveSideEffects?'unknown':'error';output={error:error.message,code:status==='unknown'?'TOOL_OUTCOME_UNKNOWN':error.code || 'ACTION_FAILED'};
    }
    return finish(status,output);
  }
  executeBody(call,context){return this.executor(call,context);}
  // Store callback separately from the method named execute.
  set executeCallback(value){this.executor=value;}
}
