import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/app.db');
const rows = db.prepare('SELECT id, provider_id, model_id, display_name, capabilities_json, enabled FROM models').all();
console.log('total models:', rows.length);
for (const r of rows.slice(0, 5)) {
  console.log(r.model_id, '| enabled=' + r.enabled, '| caps=' + r.capabilities_json);
}
const provs = db.prepare('SELECT id, name, type FROM providers').all();
console.log('providers:', JSON.stringify(provs));
db.close();
