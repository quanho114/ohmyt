import {randomUUID,createHash} from 'node:crypto';
const submissionFingerprint=(kind,content)=>createHash('sha256').update(JSON.stringify([kind,content])).digest('hex');
export class Inbox {
  constructor(database,log=null){
    this.db=database.db;this.log=log;
    this.db.exec(`CREATE TABLE IF NOT EXISTS harness_inbox(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,client_message_id TEXT NOT NULL,kind TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',created_at INTEGER NOT NULL,UNIQUE(session_id,client_message_id));`);
    const columns=new Set(this.db.prepare('PRAGMA table_info(harness_inbox)').all().map(c=>c.name));
    for(const name of ['target_run_id','request_fingerprint'])if(!columns.has(name))this.db.exec(`ALTER TABLE harness_inbox ADD COLUMN ${name} TEXT`);
    this.db.exec("UPDATE harness_inbox SET status=CASE WHEN EXISTS(SELECT 1 FROM runs WHERE runs.id='run_queue_'||harness_inbox.id) THEN 'consumed' ELSE 'queued' END WHERE status='claimed'; UPDATE harness_inbox SET status='cancelled' WHERE kind='steering' AND status='queued';");
  }
  mutation(sessionId,type,body){const own=!this.db.isTransaction;if(own)this.db.exec('BEGIN IMMEDIATE');let events=[];try{const item=body();if(this.log)events=this.log.append(sessionId,this.log.sequence(sessionId),[{eventId:`inbox:${item.id}:${type}:${randomUUID()}`,type,payload:{inboxId:item.id,kind:item.kind,content:item.content,targetRunId:item.targetRunId,status:item.status}}]);if(own)this.db.exec('COMMIT');if(own)for(const event of events)this.log.emit('event',event);return item;}catch(error){if(own)this.db.exec('ROLLBACK');throw error;}}
  enqueue({sessionId,clientMessageId,kind,content,targetRunId=null}){
    if(!sessionId||typeof clientMessageId!=='string'||!clientMessageId||!['queued','steering'].includes(kind)||typeof content!=='string'||!content.trim()||content.length>100000)throw new Error('Invalid inbox message');
    const existing=this.db.prepare('SELECT * FROM harness_inbox WHERE session_id=? AND client_message_id=?').get(sessionId,clientMessageId);
    const fingerprint=submissionFingerprint(kind,content);
    if(existing){if((existing.request_fingerprint || submissionFingerprint(existing.kind,existing.content))!==fingerprint)throw new Error('Inbox message ID collision');return decode(existing);}
    const id=randomUUID();return this.mutation(sessionId,'control/queued',()=>{this.db.prepare('INSERT INTO harness_inbox(id,session_id,client_message_id,kind,content,created_at,target_run_id,request_fingerprint) VALUES(?,?,?,?,?,?,?,?)').run(id,sessionId,clientMessageId,kind,content,Date.now(),targetRunId,fingerprint);return this.get(id);});
  }
  findSubmission(sessionId,clientMessageId){const row=typeof clientMessageId==='string'?this.db.prepare('SELECT * FROM harness_inbox WHERE session_id=? AND client_message_id=?').get(sessionId,clientMessageId):null;return row?decode(row):null;}
  get(id){const row=this.db.prepare('SELECT * FROM harness_inbox WHERE id=?').get(id);return row?decode(row):null;}
  list(sessionId){return this.db.prepare("SELECT * FROM harness_inbox WHERE session_id=? AND status='queued' ORDER BY created_at,rowid").all(sessionId).map(decode);}
  editPending(id,content){if(typeof content!=='string'||!content.trim()||content.length>100000)throw new Error('Invalid content');const item=this.get(id);if(!item)throw new Error('Message unavailable');return this.mutation(item.sessionId,'control/updated',()=>{if(!this.db.prepare("UPDATE harness_inbox SET content=?,request_fingerprint=COALESCE(request_fingerprint,?) WHERE id=? AND status='queued'").run(content,submissionFingerprint(item.kind,item.content),id).changes)throw new Error('Message no longer pending');return this.get(id);});}
  cancelPending(id){const item=this.get(id);if(!item)throw new Error('Message unavailable');return this.mutation(item.sessionId,'control/cancelled',()=>{if(!this.db.prepare("UPDATE harness_inbox SET status='cancelled' WHERE id=? AND status='queued'").run(id).changes)throw new Error('Message no longer pending');return this.get(id);});}
  setPendingKind(id,kind,targetRunId=null){
    if(!['queued','steering'].includes(kind) || kind==='steering'&&!targetRunId)throw new Error('Invalid pending mode');
    const item=this.get(id);if(!item)throw new Error('Message unavailable');
    return this.mutation(item.sessionId,'control/updated',()=>{
      this.db.prepare('UPDATE harness_inbox SET request_fingerprint=COALESCE(request_fingerprint,?) WHERE id=?').run(submissionFingerprint(item.kind,item.content),id);
      if(!this.db.prepare("UPDATE harness_inbox SET kind=?,target_run_id=? WHERE id=? AND status='queued'").run(kind,kind==='steering'?targetRunId:null,id).changes)throw new Error('Message no longer pending');
      return this.get(id);
    });
  }
  settleSteering(runId,{cancelled=false}={}){
    // A correction accepted during the final stream still belongs to the human.
    // Preserve its identity/order for the next turn; explicit cancellation must
    // never restart work. Startup recovery keeps its separate disarmed policy.
    const rows=this.db.prepare("SELECT id FROM harness_inbox WHERE target_run_id=? AND kind='steering' AND status='queued' ORDER BY created_at,rowid").all(runId);
    for(const {id} of rows)if(cancelled)this.cancelPending(id);else this.setPendingKind(id,'queued');
  }
  consume(sessionId,kind,limit=100,targetRunId=null,onConsume=null){
    this.db.exec('BEGIN IMMEDIATE');try{const rows=this.list(sessionId).filter(item=>item.kind===kind && (!targetRunId || item.targetRunId===targetRunId)).slice(0,limit);for(const row of rows)this.db.prepare("UPDATE harness_inbox SET status=? WHERE id=? AND status='queued'").run(kind==='queued'?'claimed':'consumed',row.id);onConsume?.(rows);this.db.exec('COMMIT');return rows;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
function decode(row){return {id:row.id,sessionId:row.session_id,clientMessageId:row.client_message_id,kind:row.kind,content:row.content,status:row.status,createdAt:row.created_at,targetRunId:row.target_run_id};}
