const base = 'http://localhost:3188';
const j = async (m, p, b) => {
  const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
};
const p = await j('POST', '/api/providers', { name: 'dbg-badkey', type: 'openai-compatible', baseURL: 'http://localhost:20128', apiKey: 'definitely-wrong-key' });
await j('POST', `/api/providers/${p.id}/models`, { modelId: 'ag/gemini-3.8-flash-high' });
const sess = await j('POST', '/api/sessions', { title: 'dbg', agentId: 'default-assistant' });
await j('PATCH', `/api/sessions/${sess.id}/model`, { override: { providerId: p.id, modelId: 'ag/gemini-3.8-flash-high' } });
const { runId } = await j('POST', '/api/runs', { sessionId: sess.id, prompt: 'ping' });
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
        done = e.type + ' :: ' + JSON.stringify(e.payload).slice(0, 300);
        break;
      }
    } catch {}
  }
  if (done.startsWith('Run')) break;
}
console.log('BADKEY RESULT:', done);
await j('DELETE', `/api/sessions/${sess.id}`);
await j('DELETE', `/api/providers/${p.id}`);
process.exit(0);
