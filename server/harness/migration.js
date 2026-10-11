import fs from 'node:fs';
import {compareHistory} from './history_compare.js';

export function migrateLegacy(store){
  // Snapshot rows have stable run/message anchors. Copied chats retain ordinary
  // messages and cannot import pending actions or execution privileges.
  for(const row of store.db.db.prepare('SELECT * FROM harness_turns').all()){
    if(store.log.readAll(row.session_id).some(e=>e.type==='turn/start'&&e.payload.turnId===row.run_id))continue;
    store.appendTurn(row,JSON.parse(row.messages_json),row.step,row.status);
  }
}

export function migrateSessionHistory(store,sessionId,{dryRun=false}={}){
  const db=store.db.db;
  if(!store.db.getSession(sessionId))throw new Error('Session not found');
  const marker=db.prepare('SELECT * FROM harness_migration_state WHERE session_id=?').get(sessionId);
  if(marker?.complete===1){
    const coverage=store.log.readAll(sessionId).find(e=>e.seq===marker.through_seq&&e.eventId==='history:v1:complete');
    if(marker.version!==1||coverage?.payload.coverageVersion!==1)throw new Error('Invalid semantic history coverage marker');
    return {equal:true,differences:[],alreadyMigrated:true};
  }
  if(db.prepare("SELECT 1 FROM harness_turns WHERE session_id=? AND status='running'").get(sessionId))throw new Error('Wait for running turns before migrating history');
  const entries=store.legacyHistoryEntries(sessionId),legacy=entries.map(e=>e.message),start=store.log.sequence(sessionId);
  const inputs=entries.map((entry,index)=>({eventId:`history:v1:${entry.messageId}`,type:entry.message.role==='tool'?'tool/result':entry.message.role==='assistant'?'message/assistant':'message/user',payload:{turnId:`migration:${sessionId}`,messageId:entry.messageId,historySource:'migration',historyOrder:index,message:entry.message},userMessageId:entry.userMessageId}));
  const preview=inputs.map((e,index)=>({...e,seq:start+index+1}));
  const diff=compareHistory({legacy,semantic:project(preview)});
  if(dryRun||!diff.equal)return diff;
  const file=store.db.dbPath;
  if(file&&file!==':memory:'){
    const backup=`${file}.before-harness-history-v1.backup`;
    if(!fs.existsSync(backup)){db.prepare('VACUUM INTO ?').run(backup);fs.chmodSync(backup,0o600);}
  }
  inputs.push({eventId:'history:v1:complete',type:'context/summary',payload:{coverageVersion:1}});
  const own=!db.isTransaction;if(own)db.exec('BEGIN IMMEDIATE');
  let events;
  try{
    events=store.log.append(sessionId,start,inputs);
    db.prepare('INSERT INTO harness_migration_state VALUES(?,1,1,?) ON CONFLICT(session_id) DO UPDATE SET version=1,complete=1,through_seq=excluded.through_seq').run(sessionId,events.at(-1).seq);
    if(own)db.exec('COMMIT');
  }catch(error){if(own)db.exec('ROLLBACK');throw error;}
  if(own)for(const event of events)store.log.emit('event',event);
  return {...diff,seq:events.at(-1).seq};
}
import {projectModelHistory as project} from './projections.js';
