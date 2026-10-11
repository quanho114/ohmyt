import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
export class Subagents extends EventEmitter {
  constructor({spawn,maxActive=3,maxDepth=2}){super();this.spawnBody=spawn;this.maxActive=maxActive;this.maxDepth=maxDepth;this.children=new Map();}
  spawn({parent,task,capabilities=parent.capabilities}){
    if(typeof task!=='string'||!task.trim())throw new Error('Subagent task is required');
    if(capabilities.some(name=>!parent.capabilities.includes(name)))throw new Error('Child capability exceeds parent');
    if(parent.depth>=this.maxDepth)throw new Error('Subagent depth limit exceeded');
    const rootId=parent.rootRunId || parent.runId;
    if([...this.children.values()].filter(c=>c.rootId===rootId&&c.state==='running').length>=this.maxActive)throw new Error('Subagent active limit exceeded');
    const id=randomUUID(),controller=new AbortController(),abort=()=>controller.abort(parent.signal?.reason);
    if(parent.signal?.aborted)abort();else parent.signal?.addEventListener('abort',abort,{once:true});
    const child={id,rootId,parentRunId:parent.runId,task,state:'running',controller};this.children.set(id,child);
    child.promise=(async()=>{try{const result=await this.spawnBody({id,task,scope:parent.scope,capabilities:[...capabilities],depth:parent.depth+1,signal:controller.signal,parent,rootRunId:rootId});child.state='completed';child.result=result;return result;}catch(error){child.state=controller.signal.aborted?'cancelled':'failed';child.error=error.message;throw error;}finally{parent.signal?.removeEventListener('abort',abort);this.emit('state',this.describe(child));}})();child.promise.catch(()=>{});this.emit('state',this.describe(child));return id;
  }
  describe(child){return {id:child.id,parentRunId:child.parentRunId,rootRunId:child.rootId,task:child.task,state:child.state,error:child.error};}
  list(parentId){return [...this.children.values()].filter(c=>c.parentRunId===parentId).map(c=>this.describe(c));}
  wait(id,parentId){const child=this.children.get(id);if(!child||parentId&&child.parentRunId!==parentId)throw new Error('Child unavailable in this run');return child.promise;}
  cancel(id,parentId){const child=this.children.get(id);if(!child||parentId&&child.parentRunId!==parentId)throw new Error('Child unavailable in this run');child.controller.abort('Child cancelled');}
  async drainParent(parentId){const children=[...this.children.values()].filter(c=>c.parentRunId===parentId);for(const child of children)if(child.state==='running')child.controller.abort('Parent turn ended');await Promise.allSettled(children.map(c=>c.promise));}
  async dispose(){for(const c of this.children.values())c.controller.abort('Subagents disposed');await Promise.allSettled([...this.children.values()].map(c=>c.promise));}
}
