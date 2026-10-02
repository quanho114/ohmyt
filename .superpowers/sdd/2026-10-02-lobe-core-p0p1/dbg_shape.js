const tools = [
  { name: 'fs_read', description: 'read', parameters: { type: 'object' } },
  { name: 'fs_write', description: 'write', parameters: { type: 'object' } },
  { name: 'fs_list', description: 'list', parameters: { type: 'object' } },
  { name: 'shell_exec', description: 'shell', parameters: { type: 'object' } },
  { name: 'web_search', description: 'web', parameters: { type: 'object' } },
  { name: 'memory_save', description: 'msave', parameters: { type: 'object' } },
  { name: 'memory_search', description: 'msearch', parameters: { type: 'object' } }
];
const body = JSON.stringify({
  model: 'ag/gemini-3.8-flash-high',
  messages: [
    { role: 'system', content: 'system prompt here' },
    { role: 'user', content: 'ping' }
  ],
  tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
  stream: true,
  temperature: 0.7
});
const t0 = Date.now();
try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  const r = await fetch('http://localhost:20128/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dummy-key-for-shape-test' },
    body, signal: ctrl.signal
  });
  clearTimeout(t);
  console.log(`HTTP ${r.status} in ${Date.now() - t0}ms`);
  console.log('body:', (await r.text()).slice(0, 300));
} catch (e) {
  console.log(`FETCH ERROR after ${Date.now() - t0}ms:`, e.name, e.message);
}
process.exit(0);
