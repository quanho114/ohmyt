import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
const SUMMARY_CAP=2000;
export class Subagents extends EventEmitter {
  constructor({spawn,db=null,maxActive=3,maxDepth=2}){super();this.spawnBody=spawn;this.db=db;this.maxActive=maxActive;this.maxDepth=maxDepth;this.children=new Map();}
  // Durable delegation records: the in-memory worker is short-lived by design,
  // but the delegation itself survives restarts so a later turn in the parent
  // session can see what was delegated, what finished and what was orphaned.
  ensureDelegationsTable(){
    if(!this.db)return;
    this.db.db.exec('CREATE TABLE IF NOT EXISTS harness_delegations(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,parent_run_id TEXT NOT NULL,root_run_id TEXT NOT NULL,child_session_id TEXT,task TEXT NOT NULL,status TEXT NOT NULL,summary TEXT,error TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)');
  }
  recordDelegation({id,sessionId,parentRunId,rootRunId,task}){
    if(!this.db)return;
    this.ensureDelegationsTable();
    const now=Date.now();
    this.db.db.prepare('INSERT INTO harness_delegations(id,session_id,parent_run_id,root_run_id,child_session_id,task,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,sessionId,parentRunId,rootRunId,null,task,'running',now,now);
  }
  updateDelegation(id,{status,summary=null,error=null,childSessionId=null}){
    if(!this.db)return;
    this.db.db.prepare('UPDATE harness_delegations SET status=COALESCE(?,status),summary=COALESCE(?,summary),error=COALESCE(?,error),child_session_id=COALESCE(?,child_session_id),updated_at=? WHERE id=?')
      .run(status,summary,error,childSessionId,Date.now(),id);
  }
  listDelegations(sessionId,limit=20){
    if(!this.db)return [];
    this.ensureDelegationsTable();
    return this.db.db.prepare('SELECT * FROM harness_delegations WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?').all(sessionId,limit)
      .map(row=>({id:row.id,sessionId:row.session_id,parentRunId:row.parent_run_id,rootRunId:row.root_run_id,childSessionId:row.child_session_id,task:row.task,status:row.status,summary:row.summary,error:row.error,createdAt:row.created_at,updatedAt:row.updated_at}));
  }
  orphanRunning(){
    if(!this.db)return 0;
    this.ensureDelegationsTable();
    // A restart never resumes delegated work on its own; in-flight delegations
    // become explicit orphans for the parent session to inspect and re-task.
    return this.db.db.prepare("UPDATE harness_delegations SET status='orphaned',error='Daemon restarted while the delegation was in flight',updated_at=? WHERE status='running'").run(Date.now()).changes;
  }
  spawn({parent,task,capabilities=parent.capabilities}){
    if(typeof task!=='string'||!task.trim())throw new Error('Subagent task is required');
    if(capabilities.some(name=>!parent.capabilities.includes(name)))throw new Error('Child capability exceeds parent');
    if(parent.depth>=this.maxDepth)throw new Error('Subagent depth limit exceeded');
    const rootId=parent.rootRunId || parent.runId;
    if([...this.children.values()].filter(c=>c.rootId===rootId&&c.state==='running').length>=this.maxActive)throw new Error('Subagent active limit exceeded');
    const id=randomUUID(),controller=new AbortController(),abort=()=>controller.abort(parent.signal?.reason);
    if(parent.signal?.aborted)abort();else parent.signal?.addEventListener('abort',abort,{once:true});
    const child={id,rootId,parentRunId:parent.runId,task,state:'running',controller};this.children.set(id,child);
    this.recordDelegation({id,sessionId:parent.sessionId,parentRunId:parent.runId,rootRunId:rootId,task});
    child.promise=(async()=>{try{const result=await this.spawnBody({id,task,scope:parent.scope,capabilities:[...capabilities],depth:parent.depth+1,signal:controller.signal,parent,rootRunId:rootId});child.state=controller.signal.aborted?'cancelled':'completed';child.result=result;
      if(!controller.signal.aborted)this.updateDelegation(id,{status:'completed',summary:JSON.stringify(result ?? null)?.slice(0,SUMMARY_CAP) ?? null,childSessionId:result?.sessionId || null});
      return result;}catch(error){child.state=controller.signal.aborted?'cancelled':'failed';child.error=error.message;
      if(controller.signal.aborted)this.updateDelegation(id,{status:'cancelled'});
      else this.updateDelegation(id,{status:'failed',error:error.message?.slice(0,SUMMARY_CAP)});
      throw error;}finally{parent.signal?.removeEventListener('abort',abort);this.emit('state',this.describe(child));}})();child.promise.catch(()=>{});this.emit('state',this.describe(child));return id;
  }
  describe(child){return {id:child.id,parentRunId:child.parentRunId,rootRunId:child.rootId,task:child.task,state:child.state,error:child.error};}
  list(parentId){return [...this.children.values()].filter(c=>c.parentRunId===parentId).map(c=>this.describe(c));}
  wait(id,parentId){const child=this.children.get(id);if(!child||parentId&&child.parentRunId!==parentId)throw new Error('Child unavailable in this run');return child.promise;}
  cancel(id,parentId){const child=this.children.get(id);if(!child||parentId&&child.parentRunId!==parentId)throw new Error('Child unavailable in this run');child.controller.abort('Child cancelled');}
  async drainParent(parentId){const children=[...this.children.values()].filter(c=>c.parentRunId===parentId);for(const child of children)if(child.state==='running')child.controller.abort('Parent turn ended');await Promise.allSettled(children.map(c=>c.promise));}
  async dispose(){for(const c of this.children.values())c.controller.abort('Subagents disposed');await Promise.allSettled([...this.children.values()].map(c=>c.promise));}
}
