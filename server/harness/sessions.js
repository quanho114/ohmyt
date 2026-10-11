import fs from 'node:fs';
const userMessageAnchors=new WeakMap();
export function anchorUserMessage(message,id){userMessageAnchors.set(message,id);return message;}
import { SessionLog } from './log.js';
import {toolResult} from './tool_results.js';
import {taskOutcome} from './outcomes.js';
import { projectModelHistory } from './projections.js';
import { migrateLegacy, migrateSessionHistory } from './migration.js';
import { messageContent } from '../image_attachments.js';

// Durable model transcript is separate from chat rendering and transient SSE chunks.
export class SessionStore {
  constructor(db) {
    this.db = db;
    if(db.dbPath&&db.dbPath!==':memory:'&&!db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='harness_events'").get()&&db.db.prepare('SELECT COUNT(*) AS count FROM messages').get().count>0){const backup=`${db.dbPath}.before-harness-v1.backup`;if(!fs.existsSync(backup)){db.db.prepare('VACUUM INTO ?').run(backup);fs.chmodSync(backup,0o600);}}
    this.log = new SessionLog(db);
    db.db.exec(`CREATE TABLE IF NOT EXISTS harness_turns (
      run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      messages_json TEXT NOT NULL DEFAULT '[]', step INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running', updated_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS harness_turns_session ON harness_turns(session_id);`);
    db.db.exec(`CREATE TABLE IF NOT EXISTS harness_steering_messages(user_message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,content TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS harness_steering_snapshot_delete BEFORE DELETE ON messages WHEN EXISTS(SELECT 1 FROM harness_steering_messages WHERE user_message_id=OLD.id) BEGIN UPDATE harness_turns SET messages_json=(SELECT COALESCE(json_group_array(json(value)),'[]') FROM json_each(messages_json) WHERE NOT(json_extract(value,'$.role')='user' AND json_extract(value,'$.content')=OLD.content)) WHERE run_id=(SELECT run_id FROM harness_steering_messages WHERE user_message_id=OLD.id); END;`);
    migrateLegacy(this);
    db.db.exec('CREATE TABLE IF NOT EXISTS harness_migration_state(session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,version INTEGER NOT NULL,complete INTEGER NOT NULL,through_seq INTEGER NOT NULL)');
  }

  begin(runId, sessionId, userMessageId) {
    this.db.db.prepare('INSERT INTO harness_turns (run_id, session_id, user_message_id, updated_at) VALUES (?, ?, ?, ?)')
      .run(runId, sessionId, userMessageId, Date.now());
    const user=this.db.getMessages(sessionId).find(m=>m.id===userMessageId);
    return this.appendTurn(this.get(runId),[anchorUserMessage({role:'user',content:messageContent(user)},userMessageId)],0,'running',2);
  }

  settle(runId, messages, step, status = 'running') {
    const cleaned = messages.filter(message => message.role !== 'system').map(message => message.browserScreenshot ? {...message,content:message.content.filter(part=>part.type !== 'image_url')} : message);
    const row=this.get(runId);if(!row)return;
    this.appendTurn(row,cleaned,step,status);
    // Legacy UI/backward compatibility only; new history is projected from events.
    this.db.db.prepare('UPDATE harness_turns SET messages_json = ?, step = ?, status = ?, updated_at = ? WHERE run_id = ?')
      .run(JSON.stringify(cleaned), step, status, Date.now(), runId);
  }

  record(runId,event){
    const row=this.get(runId);if(!row)return;
    return this.log.append(row.session_id,this.log.sequence(row.session_id),[{...event,userMessageId:row.user_message_id}]);
  }

  appendTurn(row,messages,step,status,executionProtocolVersion=1) {
    const events=this.log.readAll(row.session_id).filter(e=>e.payload.turnId===row.run_id);
    const anchor=row.user_message_id, base={turnId:row.run_id};
    const inputs=[];
    if(!events.some(e=>e.type==='turn/start'))inputs.push({eventId:`${row.run_id}:start`,type:'turn/start',payload:{...base,userMessageId:anchor,executionProtocolVersion},userMessageId:anchor});
    const count=events.filter(e=>['message/user','message/assistant','tool/result'].includes(e.type)&&e.payload.message).length;
    for(let i=count;i<messages.length;i++){
      const message=messages[i],messageId=`${row.run_id}:message:${i}`;inputs.push({eventId:messageId,type:message.role==='tool'?'tool/result':message.role==='assistant'?'message/assistant':'message/user',payload:{...base,messageId,callId:message.tool_call_id,message},userMessageId:userMessageAnchors.get(message) || anchor});
    }
    if(status!=='running'&&!events.some(e=>e.type==='turn/end'))inputs.push({eventId:`${row.run_id}:end`,type:'turn/end',payload:{...base,status,step},userMessageId:anchor});
    if(inputs.length)return this.log.append(row.session_id,this.log.sequence(row.session_id),inputs);
  }

  get(runId) {
    const row = this.db.db.prepare('SELECT * FROM harness_turns WHERE run_id = ?').get(runId);
    return row ? { ...row, messages: JSON.parse(row.messages_json) } : null;
  }

  migrateHistory(sessionId,options){return migrateSessionHistory(this,sessionId,options);}

  modelHistory(sessionId){
    const marker=this.db.db.prepare('SELECT * FROM harness_migration_state WHERE session_id=?').get(sessionId);
    const events=this.log.readAll(sessionId);
    const superseded=new Set(events.filter(e=>e.type==='turn/end'&&e.payload.status==='superseded').map(e=>e.payload.turnId));
    if(marker?.version!==1||marker.complete!==1||!events.some(e=>e.seq===marker.through_seq&&e.eventId==='history:v1:complete'))return this.legacyHistory(sessionId);
    return projectModelHistory(events.filter(e=>(e.payload.historySource==='migration'||e.seq>marker.through_seq)&&!superseded.has(e.payload.turnId)));
  }

  history(sessionId){return this.modelHistory(sessionId);}
  legacyHistory(sessionId){return this.legacyHistoryEntries(sessionId).map(entry=>entry.message);}
  legacyHistoryEntries(sessionId) {
    const rows = this.db.getMessages(sessionId);
    const turns = this.db.db.prepare('SELECT * FROM harness_turns WHERE session_id = ?').all(sessionId);
    const completedMessages = new Map();
    for (const row of rows) {
      if (row.sender !== 'agent') continue;
      try { const runId = JSON.parse(row.metadata || '{}').activity?.runId; if (runId) completedMessages.set(runId, row); } catch {}
    }
    const byUser = new Map(turns.filter(turn => turn.status !== 'running' && completedMessages.has(turn.run_id)).map(turn => [turn.user_message_id, turn]));
    const replacedRuns = new Set();
    const steeringIds=new Set(this.log.readAll(sessionId).filter(e=>e.type==='control/consumed' && byUser.has(turns.find(t=>t.run_id===e.payload.turnId)?.user_message_id)).map(e=>`msg_steer_${e.payload.inboxId}`));
    const history = [];
    for (const row of rows) {
      if(steeringIds.has(row.id))continue;
      const turn = byUser.get(row.id);
      if (turn) {
        const thisEvents=this.db.db.prepare('SELECT payload,user_message_id FROM harness_events WHERE session_id=? ORDER BY seq').all(sessionId).map(e=>({...e,payload:JSON.parse(e.payload)})).filter(e=>e.payload.turnId===turn.run_id);
        const transcript = projectModelHistory(this.log.readAll(sessionId).filter(event=>event.payload.turnId===turn.run_id));
        const finalRow = completedMessages.get(turn.run_id);
        if (transcript.at(-1)?.role !== 'assistant' || transcript.at(-1)?.tool_calls?.length || transcript.at(-1)?.content !== finalRow.content) transcript.push({role:'assistant',content:finalRow.content});
        history.push(...transcript.map((message,index)=>({message,userMessageId:anchorUser(message,index),messageId:`${turn.run_id}:message:${index}`})));
        function anchorUser(message,index){
          const recorded= thisEvents.find(e=>e.payload.message&&JSON.stringify(e.payload.message)===JSON.stringify(message));
          return recorded?.user_message_id || turn.user_message_id;
        }
        replacedRuns.add(turn.run_id);
        continue;
      }
      if (row.sender === 'agent') {
        try { if (replacedRuns.has(JSON.parse(row.metadata || '{}').activity?.runId)) continue; } catch {}
      }
      history.push({message:{role:row.sender === 'agent' ? 'assistant' : row.sender, content:messageContent(row)},userMessageId:row.id,messageId:row.id});
    }
    return history;
  }

  recoverInterrupted() {
    const rows = this.db.db.prepare("SELECT h.*,r.status AS run_status FROM harness_turns h JOIN runs r ON r.id = h.run_id WHERE h.status = 'running' AND r.status IN ('running', 'waiting_approval', 'aborted', 'failed')").all();
    for (const row of rows) {
      const explanation = 'Phiên xử lý bị gián đoạn khi dịch vụ dừng. Các thao tác đang dở chưa được xác minh; không tự động thực hiện lại.';
      this.db.db.exec('BEGIN IMMEDIATE');
      try {
        const events=this.log.readAll(row.session_id).filter(e=>e.payload.turnId===row.run_id);
        const currentProtocol=events.some(e=>e.type==='turn/start'&&e.payload.executionProtocolVersion===2);
        const receipts=new Set(events.filter(e=>e.type==='tool/result'&&typeof e.payload.modelContent==='string'&&e.payload.status).map(e=>e.payload.callId));
        const starts=new Set(events.filter(e=>e.type==='tool/start').map(e=>e.payload.callId));
        const calls=new Map(events.filter(e=>e.type==='message/assistant').flatMap(e=>e.payload.message?.tool_calls || []).map(call=>[call.id,call]));
        for(const [callId,call] of calls)if(!receipts.has(callId)){
          const neverStarted=currentProtocol&&!starts.has(callId);
          const result=toolResult(callId,neverStarted?'cancelled':'unknown',{code:neverStarted?'TOOL_NOT_STARTED':'TOOL_OUTCOME_UNKNOWN',error:neverStarted?'Execution interrupted before the tool body started.':'Execution interrupted after admission; external effect unknown. Verify state before retrying.'},Date.now(),{bodyStarted:neverStarted?false:starts.has(callId)?true:null,recovered:true});
          this.record(row.run_id,{eventId:`${row.run_id}:${callId}:receipt`,type:'tool/result',payload:{turnId:row.run_id,callId,name:call.function.name,status:result.status,modelContent:result.modelContent,artifactRefs:[],executionReceipt:result.executionReceipt}});
        }
        for(const start of events.filter(e=>e.type==='step/start'&&typeof e.payload.stepId==='string'&&e.payload.stepId))if(!events.some(e=>e.type==='step/end'&&e.payload.stepId===start.payload.stepId))this.record(row.run_id,{eventId:`${start.payload.stepId}:end`,type:'step/end',payload:{...start.payload,status:'interrupted'}});
        const transcript=projectModelHistory(this.log.readAll(row.session_id).filter(e=>e.payload.turnId===row.run_id));
        transcript.push({role:'assistant',content:explanation});
        const outcome=taskOutcome({protocolStatus:'cancelled',results:this.log.readAll(row.session_id).filter(e=>e.payload.turnId===row.run_id&&e.type==='tool/result'&&e.payload.executionReceipt).map(e=>({callId:e.payload.callId,status:e.payload.status}))});

        this.completeTurn({runId:row.run_id,messages:transcript,finalMessage:transcript.at(-1),step:row.step,status:row.run_status==='aborted'?'aborted':'interrupted',error:explanation,outcome,uiMessage:{id:`msg_recovery_${row.run_id}`,content:explanation,metadata:{activity:{runId:row.run_id,status:'error',outcome,reasoning:'',tools:[],durationMs:0}}}});
        const pastEvents = this.db.getRunEvents(row.run_id);
        const sequence = pastEvents.reduce((max,event)=>Math.max(max,event.sequence || 0),0) + 1;
        if(!pastEvents.some(e=>['RunCompleted','RunFailed','RunAborted'].includes(e.event_type)))this.db.addRunEvent(row.run_id,'RunFailed',{runId:row.run_id,error:explanation,outcome,recovered:true,timestamp:Date.now()},sequence);
        this.db.db.exec('COMMIT');
      } catch (error) { this.db.db.exec('ROLLBACK'); throw error; }
    }
    return rows.map(row => row.run_id);
  }

  outcome(runId){
    const row=this.get(runId);if(!row)return null;
    return this.log.readAll(row.session_id).findLast(e=>e.type==='task/outcome'&&e.payload.turnId===runId)?.payload.outcome || null;
  }

  completeTurn({runId,messages,finalMessage,step,status,uiMessage,error,outcome}){
    const row=this.get(runId);if(!row)throw new Error('Turn not found');
    if(this.log.readAll(row.session_id).some(e=>e.type==='turn/end'&&e.payload.turnId===runId))return {events:[],seq:this.log.sequence(row.session_id)};
    const own=!this.db.db.isTransaction,before=this.log.sequence(row.session_id);
    if(own)this.db.db.exec('BEGIN IMMEDIATE');
    let events;
    try{
      const transcript=messages || projectModelHistory(this.log.readAll(row.session_id).filter(e=>e.payload.turnId===runId));
      const hasFinalSlot=transcript.at(-1)===finalMessage||(status==='completed'&&transcript.at(-1)?.role==='assistant'&&!transcript.at(-1).tool_calls?.length);
      const completed=hasFinalSlot?[...transcript.slice(0,-1),finalMessage]:[...transcript,finalMessage];
      this.settle(runId,completed,step,status);
      if(outcome)this.record(runId,{eventId:`${runId}:outcome`,type:'task/outcome',payload:{turnId:runId,outcome}});
      if(uiMessage)this.db.addMessage(uiMessage.id,row.session_id,'agent',uiMessage.content,uiMessage.metadata);
      this.db.updateRunStatus(runId,status==='interrupted'?'failed':status,error);
      events=this.log.readAll(row.session_id).filter(e=>e.seq>before);
      if(own)this.db.db.exec('COMMIT');
    }catch(cause){if(own)this.db.db.exec('ROLLBACK');throw cause;}
    if(own)for(const event of events)this.log.emit('event',event);
    return {events,seq:this.log.sequence(row.session_id)};
  }
}

export function balanceToolResults(messages) {
  const balanced = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    balanced.push(message);
    if (!message.tool_calls?.length) continue;
    const observed = new Set();
    while (messages[i + 1]?.role === 'tool') {
      const result = messages[++i]; observed.add(result.tool_call_id); balanced.push(result);
    }
    for (const call of message.tool_calls) if (!observed.has(call.id)) balanced.push({role:'tool',name:call.function.name,tool_call_id:call.id,content:JSON.stringify({error:'Execution was interrupted; outcome unknown. Verify state before any retry.',code:'INTERRUPTED'})});
  }
  return balanced;
}
