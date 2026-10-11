import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AppDatabase} from '../server/db.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-migration-'));
const dbPath=path.join(temp,'app.db');
let db;
try {
 db=new AppDatabase(dbPath);
 db.createSession('kept','default-assistant','Kept history');
 db.addMessage('kept-message','kept','user','Preserved');
 db.saveMemory('old-memory','default-assistant','semantic','private old memory');
 db.db.exec('DROP INDEX memory_scope; ALTER TABLE memories DROP COLUMN scope_id; ALTER TABLE projects DROP COLUMN root_identity;');
 db.close();db=new AppDatabase(dbPath);
 assert.equal(db.getMessages('kept')[0].content,'Preserved');
 assert.equal(db.getAllMemories()[0].scope_id,'legacy:unassigned');
 assert.equal(db.searchMemories('private',5,'default-assistant','project:new').length,0);
 const backups=fs.readdirSync(temp).filter(name=>name.includes('before-project-isolation'));
 assert(backups.length>=1);
 for(const name of backups) assert.equal(fs.statSync(path.join(temp,name)).mode & 0o777,0o600);
 console.log('✓ Isolation migration preserves chat, quarantines legacy memory and creates private SQLite backup');
} finally {db?.close();fs.rmSync(temp,{recursive:true,force:true});}
