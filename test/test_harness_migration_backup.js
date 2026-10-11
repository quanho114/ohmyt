import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {AppDatabase} from '../server/db.js';
import {SessionStore} from '../server/harness/sessions.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-harness-migration-'));const file=path.join(dir,'app.db');
try {
 let db=new AppDatabase(file);db.createSession('legacy',db.getAgents()[0].id,'Legacy');db.addMessage('legacy-user','legacy','user','Keep this text');db.createRun('legacy-run','legacy');
 db.db.exec("CREATE TABLE harness_turns(run_id TEXT PRIMARY KEY REFERENCES runs(id),session_id TEXT REFERENCES sessions(id),user_message_id TEXT REFERENCES messages(id),messages_json TEXT DEFAULT '[]',step INTEGER DEFAULT 0,status TEXT DEFAULT 'completed',updated_at INTEGER)");
 const messages=[{role:'user',content:'Keep this text'},{role:'assistant',content:'Legacy evidence'}];db.db.prepare('INSERT INTO harness_turns VALUES(?,?,?,?,?,?,?)').run('legacy-run','legacy','legacy-user',JSON.stringify(messages),1,'completed',Date.now());db.close();
 db=new AppDatabase(file);let store=new SessionStore(db);assert(store.log.readAll('legacy').some(e=>e.type==='turn/start'));const sequence=store.log.sequence('legacy');
 const backup=file+'.before-harness-v1.backup';assert.equal(fs.statSync(backup).mode&0o777,0o600);const old=new DatabaseSync(backup,{readOnly:true});assert.equal(old.prepare('SELECT content FROM messages WHERE id=?').get('legacy-user').content,'Keep this text');assert.equal(old.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='harness_events'").get().n,0);assert.deepEqual(JSON.parse(old.prepare('SELECT messages_json FROM harness_turns').get().messages_json),messages);old.close();
 assert.deepEqual(JSON.parse(db.db.prepare('SELECT messages_json FROM harness_turns').get().messages_json),messages,'legacy snapshot stays readable');db.close();
 db=new AppDatabase(file);store=new SessionStore(db);assert.equal(store.log.sequence('legacy'),sequence,'migration is idempotent after cold reopen');db.close();
 console.log('Populated DB backup, legacy migration, compatibility snapshot and cold reopen passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
