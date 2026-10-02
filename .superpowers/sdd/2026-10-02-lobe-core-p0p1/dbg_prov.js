import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/app.db');
const rows = db.prepare('SELECT id, name, base_url, api_key_ref, created_at FROM providers').all();
for (const r of rows) {
  console.log(r.id, '|', r.name, '|', r.base_url, '| key:', r.api_key_ref ? 'SET' : 'NULL', '| created:', new Date(r.created_at).toLocaleTimeString());
}
db.close();
