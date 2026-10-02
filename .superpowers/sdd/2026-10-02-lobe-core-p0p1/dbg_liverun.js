const base = 'http://localhost:3188';
const j = async (m, p, b) => {
  const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
};
const providers = await j('GET', '/api/providers');
const mine = providers.find(p => p.name === 'My Local Server');
if (!mine) throw new Error('provider missing, have: ' + providers.map(p => p.name).join(','));
console.log('provider:', mine.id, 'key_ref:', mine.api_key_ref ? 'SET' : 'NULL', 'models:', mine.models.length);
const sess = await j('POST', '/api/sessions', { title: 'dbg', agentId: 'default-assistant' });
const model = mine.models.find(m => m.enabled) || mine.models[0];
await j('PATCH', `/api/sessions/${sess.id}/model`, { override: { providerId: mine.id, modelId: model.model_id } });
const { runId } = await j('POST', '/api/runs', { sessionId: sess.id, prompt: 'ping' });
console.log('run:', runId);
const res = await fetch(`${base}/api/runs/${runId}/stream`);
let buf = '';
let done = 'STREAM ENDED without terminal event';
for await (const c of res.body) {
  buf += Buffer.from(c).toString();
  const parts = buf.split('\n\n');
  buf = parts.pop();
  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith('data: ')) continue;
    try {
      const e = JSON.parse(line.slice(6));
      if (['RunCompleted', 'RunFailed', 'RunAborted'].includes(e.type)) {
        done = e.type + ' :: ' + JSON.stringify(e.payload).slice(0, 500);
        break;
      }
      if (e.type === 'TextDelta') process.stdout.write(e.payload.delta || '');
    } catch {}
  }
  if (done.startsWith('Run')) break;
}
console.log('\nRESULT:', done);
await j('DELETE', `/api/sessions/${sess.id}`);
process.exit(0);
