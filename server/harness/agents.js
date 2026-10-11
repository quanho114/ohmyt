import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';

// Registry owns session admission and quiescence; drivers own turn execution.
export class AgentRegistry extends EventEmitter {
  constructor({driver,initialize=async()=>{},legacy=null}) {
    super();this.driver=driver;this.initialize=initialize;this.legacy=legacy;
    this.drivers=new Map([['default',driver]]);this.handles=new Map();this.sessionOwners=new Map();this.closed=false;
  }
  registerDriver(id,factory){if(typeof id!=='string'||!id||this.drivers.has(id)||!(typeof factory==='function'||typeof factory?.run==='function'))throw new Error('Invalid or duplicate agent driver');this.drivers.set(id,factory);return ()=>{if([...this.handles.values()].some(h=>h.driverId===id))throw new Error('Dispose driver handles before unloading');if(this.drivers.get(id)===factory)this.drivers.delete(id);};}
  async create({sessionId,scope={},driverId='default'}) {
    if(this.closed || typeof sessionId!=='string' || !sessionId) throw new Error('Agent registry unavailable or invalid session');
    const factory=this.drivers.get(driverId);if(!factory)throw new Error('Agent driver unavailable');
    const handle=new AgentHandle(this,{id:randomUUID(),sessionId,scope,driverId});
    this.handles.set(handle.id,handle);
    try{handle.driver=typeof factory==='function'?await factory(handle):factory;handle.ownedDriver=typeof factory==='function';if(typeof handle.driver?.run!=='function')throw new Error('Driver factory must return a run method');await this.initialize(handle);return handle;}catch(error){await handle.dispose();throw error;}
  }
  list(){return [...this.handles.values()].map(h=>({id:h.id,sessionId:h.sessionId,state:h.state,runId:h.runId}));}
  findRun(runId){return [...this.handles.values()].find(h=>h.runId===runId);}
  async execute(input) {
    const handle=await this.create({sessionId:input.sessionId,scope:input.scope});
    try{return await handle.run(input);}finally{await handle.dispose();}
  }
  // Compatibility for existing core/agentLoop replacement plugins.
  _run(input){return this.legacy._run(input);}
  async dispose(){this.closed=true;await Promise.all([...this.handles.values()].map(h=>h.dispose()));}
}
class AgentHandle {
  constructor(registry,{id,sessionId,scope,driverId}){
    Object.assign(this,{registry,id,sessionId,scope:Object.freeze({...scope}),driverId,state:'idle'});
  }
  run(input){
    if(this.state!=='idle' || this.registry.closed || this.registry.sessionOwners.has(this.sessionId)) return Promise.reject(new Error('Session is busy or agent is disposed'));
    this.registry.sessionOwners.set(this.sessionId,this.id);this.state='running';this.runId=input.runId;this.controller=new AbortController();
    const parentAbort=()=>this.abort('Parent cancelled');if(input.parentSignal?.aborted)parentAbort();else input.parentSignal?.addEventListener('abort',parentAbort,{once:true});
    this.task=(async()=>{try{return await this.driver.run({handle:this,input,signal:this.controller.signal});}
      finally{input.parentSignal?.removeEventListener('abort',parentAbort);if(this.registry.sessionOwners.get(this.sessionId)===this.id)this.registry.sessionOwners.delete(this.sessionId);this.state='idle';this.runId=null;this.wake?.();}})();
    return this.task;
  }
  notify(){this.registry.emit('state',{id:this.id,sessionId:this.sessionId,runId:this.runId,state:this.state});}
  pause(){if(this.state==='running'){this.state='pause_requested';this.notify();}}
  resume(){if(['paused','pause_requested'].includes(this.state)){this.state='running';this.wake?.();this.notify();}}
  abort(reason='Agent cancelled'){this.controller?.abort(reason);this.wake?.();if(this.runId)this.registry.legacy?.abortRun(this.runId,reason);}
  async boundary(signal=this.controller?.signal){
    if(signal?.aborted)throw new Error('Run cancelled');
    if(this.state==='pause_requested'){
      this.state='paused';this.notify();
      await new Promise(resolve=>{this.wake=resolve;signal?.addEventListener('abort',resolve,{once:true});});this.wake=null;
    }
    if(signal?.aborted)throw new Error('Run cancelled');
  }
  dispose(){return this.disposeTask ||= (async()=>{this.abort('Agent disposed');await this.task?.catch(()=>{});if(this.ownedDriver)await this.driver?.dispose?.();this.state='disposed';this.registry.handles.delete(this.id);this.notify();})();}
}
