const body = JSON.stringify({
  model: 'ag/gemini-3.8-flash-high',
  messages: [{ role: 'user', content: 'bạn là ai á' }],
  stream: true
});
async function attempt(headers, label) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch('http://localhost:20128/v1/chat/completions', {
      method: 'POST', headers, body, signal: ctrl.signal
    });
    clearTimeout(t);
    console.log(label, '-> HTTP', r.status);
    if (!r.ok) {
      console.log('  err body:', (await r.text()).slice(0, 500));
      return;
    }
    let n = 0;
    for await (const chunk of r.body) {
      const s = Buffer.from(chunk).toString();
      if (n < 3) console.log('  chunk:', s.slice(0, 200));
      n++;
      if (n > 5) break;
    }
    r.destroy();
    console.log('  chunks seen:', n);
  } catch (e) {
    console.log(label, '-> FETCH ERROR:', e.message);
  }
}
await attempt({ 'Content-Type': 'application/json' }, 'no-key');
process.exit(0);
