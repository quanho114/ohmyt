import {randomUUID} from 'node:crypto';
export class Artifacts {
  constructor(database){this.db=database.db;this.db.exec(`CREATE TABLE IF NOT EXISTS harness_artifacts(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,scope_id TEXT NOT NULL,title TEXT NOT NULL,mime TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL);`);if(!this.db.prepare('PRAGMA table_info(harness_artifacts)').all().some(c=>c.name==='user_message_id'))this.db.exec('ALTER TABLE harness_artifacts ADD COLUMN user_message_id TEXT REFERENCES messages(id) ON DELETE CASCADE');}
  save({sessionId,scopeId,title,mime,content,userMessageId=null}){
    if(typeof title!=='string'||!title.trim()||title.length>200||/[\\/\u0000-\u001f]/.test(title)||typeof content!=='string'||Buffer.byteLength(content)>25*1024*1024||!['text/plain','text/markdown','text/html','application/json','image/svg+xml'].includes(mime)||!scopeId)throw new Error('Invalid artifact');
    const id=randomUUID();this.db.prepare('INSERT INTO harness_artifacts(id,session_id,scope_id,title,mime,content,created_at,user_message_id) VALUES(?,?,?,?,?,?,?,?)').run(id,sessionId,scopeId,title,mime,content,Date.now(),userMessageId);return {artifactId:id,version:1,title,mime,scopeId,sessionId,bytes:Buffer.byteLength(content)};
  }
  get(id,sessionId){const row=this.db.prepare('SELECT * FROM harness_artifacts WHERE id=? AND session_id=?').get(id,sessionId);if(!row)throw Object.assign(new Error('Artifact unavailable in this scope'),{statusCode:404});return {artifactId:row.id,version:1,sessionId:row.session_id,scopeId:row.scope_id,title:row.title,mime:row.mime,content:row.content};}
}
