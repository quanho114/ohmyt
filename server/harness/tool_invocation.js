import {freezeValue} from './prompt.js';
import {ToolPipeline} from './tool_pipeline.js';
import {toolResult} from './tool_results.js';

export class ToolInvocationService {
  constructor({resolveRun,authorize,record=()=>{},pipeline,observe=()=>{}}){
    Object.assign(this,{resolveRun,authorize,record,pipeline,observe});
    this.guards=new Map();this.calls=new Map();this.inFlight=new Map();
  }
  registerGuard(id,guard){
    if(this.guards.has(id)||typeof guard!=='function')throw new Error('Duplicate or invalid invocation guard');
    this.guards.set(id,guard);return ()=>{if(this.guards.get(id)===guard)this.guards.delete(id);};
  }
  invoke({call,context}){
    if(!call?.id||typeof call.id!=='string')return Promise.reject(new Error('Invalid tool call ID'));
    const frozenCall=freezeValue(structuredClone(call));
    const key=JSON.stringify([context.runId,call.id]),fingerprint=JSON.stringify(frozenCall);
    const previous=this.calls.get(key);
    if(previous){if(previous.fingerprint!==fingerprint)return Promise.reject(new Error('Tool call ID collision'));return previous.promise;}
    const promise=Promise.resolve().then(()=>this._invoke(frozenCall,context));
    this.calls.set(key,{fingerprint,promise});
    if(!this.inFlight.has(context.runId))this.inFlight.set(context.runId,new Set());
    const pending=this.inFlight.get(context.runId);pending.add(promise);
    promise.then(()=>pending.delete(promise),()=>pending.delete(promise));
    return promise;
  }
  async _invoke(call,supplied){
    const run=this.resolveRun(supplied.runId);
    if(!run)throw new Error('Tool invocation requires an active server run');
    const startedAt=Date.now();
    let validated;
    const context=Object.freeze({...supplied,runId:run.runId,sessionId:run.sessionId,agentId:run.agentId,scope:run.scope,scopeId:run.scope.scopeId,signal:run.signal,model:run.model});
    try{
      for(const field of ['sessionId','agentId','scopeId'])if(supplied[field]!==undefined&&supplied[field]!==context[field])throw new Error('Tool invocation scope mismatch');
      if(supplied.scope&&supplied.scope.scopeId!==run.scope.scopeId)throw new Error('Tool invocation scope mismatch');
      if(!run.capabilities.includes(call.name))throw new Error('Tool unavailable in this run scope');
      validated=run.runTools.validateCall(call);
    }catch(error){
      const result=toolResult(call.id,'denied',{error:error.message},startedAt);
      this.record(run.runId,{type:'tool/result',eventId:`${run.runId}:${call.id}:receipt`,payload:{turnId:run.runId,callId:call.id,name:call.name,status:result.status,modelContent:result.modelContent,executionReceipt:result.executionReceipt}});
      return result;
    }
    const execute=()=>{
      if(run.signal?.aborted)throw Object.assign(new Error('Run cancelled before tool body started'),{code:'TOOL_NOT_STARTED'});
      run.budget?.consume('tools');return validated.tool.execute(call.arguments,context);
    };
    const result=await new ToolPipeline({
      record:event=>this.record(run.runId,event),
      authorize:()=>this.authorize({call,context,run}),
      guard:async()=>{for(const guard of this.guards.values()){const decision=await guard({call,context});if(decision?.action==='DENY')return decision;}return null;},
      execute:()=>this.pipeline?this.pipeline(call,context,execute):execute()
    }).execute({call,...context});
    try{await this.observe(call,result,context);}catch{/* Observers never change a committed result. */}
    return result;
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
