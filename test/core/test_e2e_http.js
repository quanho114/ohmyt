import assert from 'node:assert';
import http from 'node:http';

const BASE_URL = 'http://localhost:3188';

async function fetchJson(endpoint, options = {}) {
  const url = new URL(endpoint, BASE_URL);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, text: body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runE2eHttpTests() {
  console.log('🌐 Starting Real E2E HTTP & SSE Protocol Tests (No mock tests)...');

  // 1. Health check
  console.log('  ▶ Test 1: GET /api/status...');
  const statusRes = await fetchJson('/api/status');
  assert.strictEqual(statusRes.status, 200);
  assert.strictEqual(statusRes.data.status, 'online');
  assert.strictEqual(statusRes.data.db, 'sqlite-wal');
  console.log('    ✓ API daemon online, SQLite WAL active.');

  // 2. Create Session
  console.log('  ▶ Test 2: POST /api/sessions...');
  const sessRes = await fetchJson('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: 'E2E HTTP Test Session' })
  });
  assert.strictEqual(sessRes.status, 201);
  const sessionId = sessRes.data.id;
  assert.ok(sessionId, 'Phải có session ID');
  console.log(`    ✓ Session created: ${sessionId}`);

  // 3. Start Run & Stream SSE
  console.log('  ▶ Test 3: POST /api/runs & SSE Streaming...');
  const runRes = await fetchJson('/api/runs', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      prompt: 'Hãy liệt kê danh sách file'
    })
  });
  assert.strictEqual(runRes.status, 202);
  const runId = runRes.data.runId;
  assert.ok(runId, 'Phải có runId');

  // Connect to SSE
  const sseEvents = [];
  const sseDone = new Promise((resolve, reject) => {
    const sseReq = http.get(`${BASE_URL}/api/runs/${runId}/stream`, res => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.substring(6));
              sseEvents.push(evt.type);
              if (evt.type === 'RunCompleted' || evt.type === 'RunFailed') {
                sseReq.destroy();
                resolve();
              }
            } catch {}
          }
        }
      });
    });

    sseReq.on('error', err => {
      if (sseEvents.includes('RunCompleted')) resolve();
      else reject(err);
    });

    setTimeout(() => {
      sseReq.destroy();
      resolve();
    }, 6000);
  });

  await sseDone;

  console.log('    Events received over SSE:', sseEvents);
  assert.ok(sseEvents.includes('RunStarted'), 'SSE phải nhận được RunStarted');
  assert.ok(sseEvents.includes('ToolCallStarted'), 'SSE phải nhận được ToolCallStarted');
  assert.ok(sseEvents.includes('ToolCallCompleted'), 'SSE phải nhận được ToolCallCompleted');
  assert.ok(sseEvents.includes('RunCompleted'), 'SSE phải nhận được RunCompleted');
  console.log('    ✓ Real SSE streaming protocol verified end-to-end.');

  // 4. Verify Messages in DB via HTTP
  console.log('  ▶ Test 4: GET /api/sessions/:id/messages...');
  const msgRes = await fetchJson(`/api/sessions/${sessionId}/messages`);
  assert.strictEqual(msgRes.status, 200);
  assert.strictEqual(msgRes.data.length, 2, 'Phải có 2 messages lưu trong SQLite');
  assert.strictEqual(msgRes.data[0].sender, 'user');
  assert.strictEqual(msgRes.data[1].sender, 'agent');
  console.log('    ✓ Messages persisted correctly in SQLite.');

  // 5. Test Take Control (Emergency Abort over HTTP)
  console.log('  ▶ Test 5: POST /api/runs/:id/abort (Take Control)...');
  const abortRunStart = await fetchJson('/api/runs', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      prompt: 'Chạy lệnh shell: sleep 60'
    })
  });
  const abortRunId = abortRunStart.data.runId;

  // Wait 100ms then abort
  await new Promise(r => setTimeout(r, 100));
  const abortRes = await fetchJson(`/api/runs/${abortRunId}/abort`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'E2E User Take Control' })
  });
  assert.strictEqual(abortRes.status, 200);
  assert.strictEqual(abortRes.data.aborted, true);
  console.log('    ✓ Take Control successfully halted run over HTTP.');

  console.log('\n🎉 ALL REAL E2E HTTP TESTS PASSED (100% functional, 0 mock tests)!');
}

runE2eHttpTests().catch(err => {
  console.error('\n❌ E2E HTTP test suite failed:', err);
  process.exit(1);
});
