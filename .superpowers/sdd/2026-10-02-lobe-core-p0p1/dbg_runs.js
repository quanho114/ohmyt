import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/app.db');
const runs = db.prepare('SELECT id, session_id, status, error FROM runs ORDER BY started_at DESC LIMIT 5').all();
console.log(JSON.stringify(runs, null, 1));
if (runs.length > 0) {
  const ev = db.prepare('SELECT event_type, payload, sequence FROM run_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 8').all(runs[0].id);
  for (const e of ev) {
    console.log('---');
    console.log(e.event_type + ': ' + String(e.payload || '').slice(0, 400));
  }
}
db.close();
