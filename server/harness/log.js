import {EventEmitter} from 'node:events';
import {validateSessionEvent} from './contracts.js';

export class SessionLog extends EventEmitter {
  constructor(database){
    super();this.database=database;this.db=database.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS harness_events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,event_id TEXT NOT NULL,version INTEGER NOT NULL,
      type TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,
      user_message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      PRIMARY KEY(session_id,seq),UNIQUE(session_id,event_id));
      CREATE TABLE IF NOT EXISTS harness_sequences(session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,seq INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
      INSERT INTO harness_sequences(session_id,seq) SELECT session_id,MAX(seq) FROM harness_events GROUP BY session_id ON CONFLICT(session_id) DO UPDATE SET seq=MAX(seq,excluded.seq);`);
    if(!this.db.prepare('PRAGMA table_info(harness_sequences)').all().some(c=>c.name==='revision'))this.db.exec('ALTER TABLE harness_sequences ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    this.db.exec('CREATE TRIGGER IF NOT EXISTS harness_event_deletion AFTER DELETE ON harness_events BEGIN UPDATE harness_sequences SET revision=revision+1 WHERE session_id=OLD.session_id; END;');
  }
  revision(sessionId){return this.db.prepare('SELECT revision FROM harness_sequences WHERE session_id=?').get(sessionId)?.revision || 0;}
  sequence(sessionId){return this.db.prepare('SELECT seq FROM harness_sequences WHERE session_id=?').get(sessionId)?.seq ?? 0;}
  append(sessionId,expectedSeq,inputs){
    const ownTransaction=!this.db.isTransaction;
    if(ownTransaction)this.db.exec('BEGIN IMMEDIATE');
    let committed=[];
    try{
      let seq=this.sequence(sessionId);
      const existing=inputs.map(input=>this.db.prepare('SELECT * FROM harness_events WHERE session_id=? AND event_id=?').get(sessionId,input.eventId));
      if(existing.every(Boolean) && inputs.length){
        committed=existing.map((row,i)=>{if(row.type!==inputs[i].type || row.payload!==JSON.stringify(inputs[i].payload))throw new Error('Event ID collision');return decode(row);});
      }else{
        if(existing.some(Boolean))throw new Error('Partially duplicated event batch');
        if(seq!==expectedSeq)throw new Error('Session sequence conflict');
        committed=inputs.map(input=>validateSessionEvent({sessionId,seq:++seq,eventId:input.eventId,version:1,type:input.type,payload:input.payload,createdAt:input.createdAt ?? Date.now()}));
        for(let i=0;i<committed.length;i++){
          const e=committed[i];this.db.prepare('INSERT INTO harness_events VALUES (?,?,?,?,?,?,?,?)').run(sessionId,e.seq,e.eventId,e.version,e.type,JSON.stringify(e.payload),e.createdAt,inputs[i].userMessageId || null);
        }
      }
      this.db.prepare('INSERT INTO harness_sequences(session_id,seq) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET seq=MAX(seq,excluded.seq)').run(sessionId,seq);
      if(ownTransaction)this.db.exec('COMMIT');
    }catch(error){if(ownTransaction)this.db.exec('ROLLBACK');throw error;}
    // Only publish after the outermost durability barrier.
    if(ownTransaction)for(const event of committed)this.emit('event',event);
    return committed;
  }
  read(sessionId,{afterSeq=0,limit=500}={}){
    if(!Number.isSafeInteger(afterSeq)||afterSeq<0 || !Number.isSafeInteger(limit)||limit<1||limit>10000)throw new Error('Invalid event cursor');
    return this.db.prepare('SELECT * FROM harness_events WHERE session_id=? AND seq>? ORDER BY seq LIMIT ?').all(sessionId,afterSeq,limit).map(decode);
  }
  readAll(sessionId){return this.db.prepare('SELECT * FROM harness_events WHERE session_id=? ORDER BY seq').all(sessionId).map(decode);}
}
function decode(row){return {sessionId:row.session_id,seq:row.seq,eventId:row.event_id,version:row.version,type:row.type,payload:JSON.parse(row.payload),createdAt:row.created_at};}
