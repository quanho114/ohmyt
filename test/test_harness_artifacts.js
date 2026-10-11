import assert from 'node:assert/strict';
import {AppDatabase} from '../server/db.js';
import {Artifacts} from '../server/harness/artifacts.js';
const db=new AppDatabase(':memory:');db.createSession('a',db.getAgents()[0].id,'A');db.createSession('b',db.getAgents()[0].id,'B');const artifacts=new Artifacts(db);
const item=artifacts.save({sessionId:'a',scopeId:'standalone',title:'report.md',mime:'text/markdown',content:'# Report'});assert.equal(artifacts.get(item.artifactId,'a').content,'# Report');assert.throws(()=>artifacts.get(item.artifactId,'b'),/scope/);assert.throws(()=>artifacts.save({sessionId:'a',scopeId:'standalone',title:'../x',mime:'text/plain',content:'x'}));
db.db.prepare('DELETE FROM sessions WHERE id=?').run('a');assert.throws(()=>artifacts.get(item.artifactId,'a'));db.close();console.log('Artifact content scope and cascade passed');
