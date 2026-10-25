import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AppDatabase} from '../../server/db.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-brand-'));
const dbPath = path.join(root, 'app.db');
let db;
try {
  db = new AppDatabase(dbPath);
  const fresh = db.getAgent('default-assistant');
  assert.equal(fresh.name, 'sky');
  assert.equal(fresh.avatar, 'sky');
  assert.match(fresh.system_prompt, /^Bạn là sky,/);
  const legacy = {...fresh, name:'ohmyt', avatar:'OT', system_prompt:fresh.system_prompt.replace('Bạn là sky,', 'Bạn là ohmyt,'), model_provider:'custom-provider', model_name:'custom-model', temperature:0.25};
  db.upsertAgent(legacy);
  db.upsertAgent({...legacy, id:'personal-assistant'});
  db.createSession('existing-chat', fresh.id, 'Keep this conversation');
  db.addMessage('existing-message', 'existing-chat', 'user', 'Keep my message');
  db.close();

  db = new AppDatabase(dbPath);
  const upgraded = db.getAgent(fresh.id);
  assert.equal(upgraded.name, 'sky');
  assert.equal(upgraded.avatar, 'sky');
  assert.equal(upgraded.system_prompt, fresh.system_prompt);
  assert.equal(upgraded.model_provider, legacy.model_provider);
  assert.equal(upgraded.model_name, legacy.model_name);
  assert.equal(upgraded.temperature, legacy.temperature);
  assert.equal(db.getMessages('existing-chat')[0].content, 'Keep my message');
  assert.equal(db.getAgent('personal-assistant').name, 'ohmyt', 'Other agents are user data');

  const custom = {...upgraded, name:'My assistant', avatar:'custom-avatar', system_prompt:'My instructions mention ohmyt, keep them verbatim.'};
  db.upsertAgent(custom);
  db.close();
  db = new AppDatabase(dbPath);
  assert.deepEqual({...db.getAgent(fresh.id)}, {...custom}, 'Customized fields survive the rename and repeated startup');
  console.log('PASS sky branding: fresh identity, legacy upgrade, preserved model settings, messages and customized agents');
} finally {
  db?.close();
  fs.rmSync(root, {recursive:true, force:true});
}
