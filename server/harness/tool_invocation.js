import {freezeValue} from './prompt.js';
import {ToolPipeline} from './tool_pipeline.js';
import {toolResult} from './tool_results.js';
import {HOST_EXECUTION_TOOLS} from '../project_scope.js';

export class ToolInvocationService {
  constructor({resolveRun,authorize,record=()=>{},pipeline,presentation,observe=()=>{},beforeExecute=()=>{}}){
    Object.assign(this,{resolveRun,authorize,record,pipeline,presentation,observe,beforeExecute});
    this.guards=new Map();this.calls=new Map();this.inFlight=new Map();
  }
  registerGuard(id,guard){
    if(this.guards.has(id)||typeof guard!=='function')throw new Error('Duplicate or invalid invocation guard');
    this.guards.set(id,guard);return ()=>{if(this.guards.get(id)===guard)this.guards.delete(id);};
  }
  entry(call,runId){
    if(!call?.id||typeof call.id!=='string'||typeof call.name!=='string'||!call.name)throw new Error('Invalid tool call identity');
    const key=JSON.stringify([runId,call.id]),fingerprint=JSON.stringify(call);
    const previous=this.calls.get(key);
    if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Tool call ID collision');return previous;}
    const run=this.resolveRun(runId);if(!run)throw new Error('Tool invocation requires an active server run');
    const frozenCall=freezeValue(structuredClone(call));
    let validated,rejection;
    if(run.scope?.projectId&&HOST_EXECUTION_TOOLS.includes(call.name)){
      rejection={status:'denied',code:'PROJECT_HOST_DENIED',error:'Host execution is unavailable in project chats. Use the workspace sandbox.'};
    }else if(!run.capabilities.includes(call.name)){
      const known=run.runTools.get?.(call.name);
      rejection={status:known?'denied':'error',code:known?'SCOPE_DENIED':'UNKNOWN_TOOL',error:'Tool unavailable in this run scope'};
    }else{
      try{validated=run.runTools.validateCall(frozenCall);}
      catch(error){rejection={status:'error',code:'INVALID_ARGS',error:error.message};}
    }
    const entry={fingerprint,call:frozenCall,validated,rejection,run};this.calls.set(key,entry);return entry;
  }
  plan(call,runId){
    const entry=this.entry(call,runId),tool=entry.validated?.tool;
    // Classification sees only validated immutable arguments; rejected slots form barriers.
    return {tc:entry.call,arguments:entry.call.arguments,tool,readOnly:tool?.readOnly,exclusive:tool?.exclusive,
      resourceKeys:typeof tool?.resourceKeys==='function'?tool.resourceKeys(entry.call.arguments):tool?.resourceKeys};
  }
  invoke({call,context,rejection}){
    let entry;try{entry=this.entry(call,context.runId);}catch(error){return Promise.reject(error);}
    const run=this.resolveRun(context.runId);
    if(entry.promise)for(const field of ['sessionId','agentId','scopeId'])if(context[field]!==undefined&&context[field]!== (field==='scopeId'?run?.scope.scopeId:run?.[field]))return Promise.reject(new Error('Tool invocation scope mismatch'));
    if(entry.promise&&context.scope&&context.scope.scopeId!==run?.scope.scopeId)return Promise.reject(new Error('Tool invocation scope mismatch'));
    if(entry.promise)return entry.promise;
    const promise=Promise.resolve().then(()=>this._invoke(entry,context,rejection));entry.promise=promise;
    if(!this.inFlight.has(context.runId))this.inFlight.set(context.runId,new Set());
    const pending=this.inFlight.get(context.runId);pending.add(promise);
    promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;
  }
  async _invoke(entry,supplied,rejection){
    const {call,validated}=entry;
    const run=this.resolveRun(supplied.runId);
    if(!run)throw new Error('Tool invocation requires an active server run');
    const startedAt=Date.now();
    // Nested runtimes may narrow cancellation, never replace the server signal.
    const signal=supplied.signal&&supplied.signal!==run.signal ? AbortSignal.any([run.signal,supplied.signal].filter(Boolean)) : run.signal;
    const context=Object.freeze({...supplied,runId:run.runId,sessionId:run.sessionId,agentId:run.agentId,scope:run.scope,scopeId:run.scope.scopeId,signal,model:run.model});
    for(const field of ['sessionId','agentId','scopeId'])if(supplied[field]!==undefined&&supplied[field]!==context[field])rejection={status:'denied',code:'SCOPE_DENIED',error:'Tool invocation scope mismatch'};
    if(supplied.scope&&supplied.scope.scopeId!==run.scope.scopeId)rejection={status:'denied',code:'SCOPE_DENIED',error:'Tool invocation scope mismatch'};
    rejection ||= entry.rejection;
    // A terminal Goal update owns the rest of this turn, including sibling
    // calls from the same model batch. No further body or budget is admitted.
    if(run.goalWrapup&&rejection?.code!=='SCOPE_DENIED')rejection={status:'error',code:'GOAL_TURN_CLOSED',error:'Goal execution ended. Write the closing message; further tools wait for human input.'};
    const uncertain=()=>run.uncertainToolCallIds?.size>0;
    rejection ||= uncertain()?{status:'error',code:'RUN_UNCERTAIN',error:'A tool outcome is unknown. Verify external state in a new human-directed turn before further tools.'}:null;
    if(rejection){
      const result=toolResult(call.id,rejection.status || 'error',{error:rejection.error,code:rejection.code},startedAt,{bodyStarted:false});
      entry.result=result;
      this.record(run.runId,{type:'tool/result',eventId:`${run.runId}:${call.id}:receipt`,payload:{turnId:run.runId,callId:call.id,name:call.name,status:result.status,modelContent:result.modelContent,executionReceipt:result.executionReceipt}});
      return result;
    }
    let bodyStarted=false;
    const execute=()=>{
      if(signal?.aborted)throw Object.assign(new Error('Run cancelled before tool body started'),{code:'TOOL_NOT_STARTED'});
      // An approval or middleware may have waited while a sibling/RPC became
      // uncertain. Recheck at the actual body boundary, before charging budget.
      if(uncertain())throw Object.assign(new Error('A tool outcome is unknown; no further tool body was started.'),{code:'RUN_UNCERTAIN'});
      // Trusted synchronous admission: nothing may yield between this check and
      // body start. It also covers nested PTC calls and approval/middleware waits.
      this.beforeExecute({call,context,run});
      run.budget?.consume('tools');this.record(run.runId,{type:'tool/start',eventId:`${run.runId}:${call.id}:body`,payload:{turnId:run.runId,callId:call.id,name:call.name}});bodyStarted=true;return validated.tool.execute(call.arguments,context);
    };
    const result=await new ToolPipeline({
      hasStarted:()=>bodyStarted,
      mayHaveSideEffects:validated.tool.readOnly!==true&&validated.tool.effectKind!=='local_state',
      presentation:this.presentation?.(call,context,run),
      record:event=>this.record(run.runId,event),
      authorize:()=>this.authorize({call,context,run}),
      guard:async()=>{for(const guard of this.guards.values()){const decision=await guard({call,context});if(decision?.action==='DENY')return decision;}return null;},
      execute:()=>this.pipeline?this.pipeline(call,context,execute):execute()
    }).execute({call,...context});
    entry.result=result;
    if(result.status==='unknown')(run.uncertainToolCallIds ||= new Set()).add(call.id);
    try{await this.observe(call,result,context);}catch{/* Observers never change a committed result. */}
    return result;
  }
  results(runId){
    return [...this.calls.values()].filter(entry=>entry.run.runId===runId&&entry.result)
      .map(entry=>({...entry.result,name:entry.call.name}));
  }
  async drain({runId}={}){
    const sets=runId===undefined?[...this.inFlight.values()]:[this.inFlight.get(runId)];
    await Promise.allSettled(sets.flatMap(set=>set?[...set]:[]));
  }
  release(runId){
    if(this.inFlight.get(runId)?.size)throw new Error('Tool invocation is still running');
    this.inFlight.delete(runId);
    for(const key of this.calls.keys())if(JSON.parse(key)[0]===runId)this.calls.delete(key);
  }
  get busy(){return [...this.inFlight.values()].some(set=>set.size>0);}
}
