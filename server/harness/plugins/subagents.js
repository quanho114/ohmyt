import {Subagents} from '../subagents.js';

export function createSubagents({db,sessions,agents,childSessions,runChild}){
    db.db.exec('CREATE TABLE IF NOT EXISTS harness_children(session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,parent_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,parent_run_id TEXT NOT NULL,child_id TEXT NOT NULL);');
    if(!db.db.prepare('PRAGMA table_info(harness_children)').all().some(c=>c.name==='parent_user_message_id'))db.db.exec('ALTER TABLE harness_children ADD COLUMN parent_user_message_id TEXT REFERENCES messages(id) ON DELETE CASCADE');
    db.db.exec('CREATE TRIGGER IF NOT EXISTS harness_child_trace_delete AFTER DELETE ON harness_children BEGIN DELETE FROM sessions WHERE id=OLD.session_id; END;');
    return new Subagents({spawn:async child=>{
      const parent=child.parent,sessionId=`child_${child.id}`,runId=`run_child_${child.id}`;
      db.createSession(sessionId,parent.agentId,child.task.slice(0,80),parent.scope.projectId || null);
      db.db.prepare('UPDATE sessions SET harness_parent_session_id=? WHERE id=?').run(parent.sessionId,sessionId);
      db.db.prepare('INSERT INTO harness_children(session_id,parent_session_id,parent_run_id,child_id,parent_user_message_id) VALUES(?,?,?,?,?)').run(sessionId,parent.sessionId,parent.runId,child.id,sessions.get(parent.runId)?.user_message_id || null);
      db.setSessionModelOverride(sessionId,parent.model);
      childSessions.set(runId,{...child,budget:parent.budget});
      const abort=()=>agents.findRun(runId)?.abort('Parent cancelled');child.signal.addEventListener('abort',abort,{once:true});
      try{await runChild({runId,sessionId,prompt:child.task,parentSignal:child.signal});const run=db.db.prepare('SELECT status FROM runs WHERE id=?').get(runId);if(run?.status!=='completed')throw new Error('Child task did not complete');return {childId:child.id,sessionId,summary:db.getMessages(sessionId).filter(m=>m.sender==='agent').at(-1)?.content || ''};}
      finally{child.signal.removeEventListener('abort',abort);childSessions.delete(runId);}
    }});
}

export function subagentsPlugin({subagents,sessions,runContexts,childSessions,agentLoop}){
  return {name:'agents/subagents',inject:['tools','subagents'],apply:ctx=>{
    const onState=child=>{const parent=runContexts.get(child.parentRunId);if(!parent)return;sessions.record(child.parentRunId,{eventId:`${child.id}:${child.state}`,type:child.state==='running'?'child/start':'child/end',payload:{turnId:child.parentRunId,...child}});agentLoop.emitEvent(child.parentRunId,'SubagentState',child);};
    const onEvent=event=>{const child=childSessions.get(event.runId);if(child&&event.type==='PermissionRequired')agentLoop.emitEvent(child.parent.runId,'PermissionRequired',{...event.payload,approvalRunId:event.runId});};
    ctx.effect(()=>{subagents.on('state',onState);agentLoop.on('event',onEvent);return ()=>{subagents.off('state',onState);agentLoop.off('event',onEvent);};});
      for(const definition of [
        {name:'subagent_spawn',description:'Delegate a bounded task to a child with the same or fewer tools.',parameters:{type:'object',properties:{task:{type:'string',maxLength:100000},capabilities:{type:'array',items:{type:'string'},uniqueItems:true}},required:['task'],additionalProperties:false},execute:async(args,context)=>({childId:subagents.spawn({parent:runContexts.get(context.runId),...args})})},
        {name:'subagent_wait',description:'Wait for a child task and return its verified final result.',parameters:{type:'object',properties:{childId:{type:'string'}},required:['childId'],additionalProperties:false},execute:async(args,context)=>subagents.wait(args.childId,context.runId)},
        {name:'subagent_cancel',description:'Cancel a child belonging to this run.',parameters:{type:'object',properties:{childId:{type:'string'}},required:['childId'],additionalProperties:false},execute:async(args,context)=>{subagents.cancel(args.childId,context.runId);return {cancelled:true};}}
      ])ctx.effect(()=>ctx.tools.register({...definition,scopes:['standalone','project']}));
    }};
}
