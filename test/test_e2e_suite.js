import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createDaemon } from '../server/index.js';

async function runSelfContainedE2eTests() {
  console.log('🚀 Running Self-Contained E2E Protocol & Permission Suite (No mock tests)...');

  const tempDir = path.resolve(process.cwd(), '.test_e2e_env_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  const testDbPath = path.join(tempDir, 'e2e.db');
  const port = 3988;

  const daemon = createDaemon({
    dbPath: testDbPath,
    workspaceRoot: tempDir,
    port
  });

  const BASE_URL = `http://localhost:${port}`;

  function fetchJson(endpoint, options = {}) {
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

  try {
    await daemon.start();
    console.log(`    ✓ Ephemeral test daemon listening on port ${port}`);

    // 1. Status Check
    console.log('  ▶ Test 1: GET /api/status...');
    const statusRes = await fetchJson('/api/status');
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.data.status, 'online');
    assert.strictEqual(statusRes.data.db, 'sqlite-wal');
    console.log('    ✓ API status online, SQLite WAL active.');

    // 2. Session Creation
    console.log('  ▶ Test 2: POST /api/sessions...');
    const sessRes = await fetchJson('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Self Contained Session' })
    });
    assert.strictEqual(sessRes.status, 201);
    const sessionId = sessRes.data.id;
    assert.ok(sessionId);
    console.log(`    ✓ Session created: ${sessionId}`);

    // Stub ở biên model để kiểm thử protocol/permission deterministically;
    // HTTP, SSE, DB, tools, permissions đều chạy thật.
    let e2eCalls = 0;
    daemon.gateway.streamChat = async ({ onChunk, onToolCall }) => {
      e2eCalls++;
      if (e2eCalls === 1) onToolCall({ id: 'call_e2e_1', name: 'fs_list', arguments: { path: '.' } });
      onChunk('Xong.');
      return { latencyMs: 1 };
    };

    for (const responseLanguage of ['invalid', null, 17, {}, ['vi']]) {
      const rejected = await fetchJson('/api/runs', {
        method: 'POST', body: JSON.stringify({ sessionId, prompt: 'Do not run.', responseLanguage })
      });
      assert.strictEqual(rejected.status, 400);
    }
    assert.deepStrictEqual((await fetchJson(`/api/sessions/${sessionId}/messages`)).data, []);

    // 3. Runs & SSE Stream
    console.log('  ▶ Test 3: POST /api/runs & SSE Streaming...');
    const runRes = await fetchJson('/api/runs', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        prompt: 'Liệt kê danh sách file',
        responseLanguage: 'en'
      })
    });
    assert.strictEqual(runRes.status, 202);
    const runId = runRes.data.runId;

    const sseEvents = [];
    await new Promise((resolve, reject) => {
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
      }, 5000);
    });

    assert.ok(sseEvents.includes('RunStarted'), 'Phải nhận được RunStarted');
    assert.ok(sseEvents.includes('ToolCallStarted'), 'Phải nhận được ToolCallStarted');
    assert.ok(sseEvents.includes('ToolCallCompleted'), 'Phải nhận được ToolCallCompleted');
    assert.ok(sseEvents.includes('RunCompleted'), 'Phải nhận được RunCompleted');
    console.log('    ✓ SSE stream hoàn thành đầy đủ chuỗi sự kiện.');

    // 4. Interactive Permission Approval
    // Stub riêng cho run này: gọi shell_exec (policy ASK) để kích hoạt Human-in-the-loop.
    let permCalls = 0;
    daemon.gateway.streamChat = async ({ onChunk, onToolCall }) => {
      permCalls++;
      if (permCalls === 1) onToolCall({ id: 'call_e2e_perm', name: 'shell_exec', arguments: { command: 'echo "PermissionGranted"' } });
      onChunk('Xong.');
      return { latencyMs: 1 };
    };
    console.log('  ▶ Test 4: Interactive Permission Approval Flow (Human-in-the-loop)...');
    const permRun = await fetchJson('/api/runs', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        prompt: 'Chạy lệnh shell: echo "PermissionGranted"'
      })
    });
    const permRunId = permRun.data.runId;

    let receivedPermReq = false;
    let receivedToolCompleted = false;

    await new Promise((resolve, reject) => {
      const sseReq = http.get(`${BASE_URL}/api/runs/${permRunId}/stream`, res => {
        let buffer = '';
        res.on('data', async chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const evt = JSON.parse(line.substring(6));
                if (evt.type === 'PermissionRequired') {
                  receivedPermReq = true;
                  const reqId = evt.payload.requestId;
                  await fetchJson(`/api/runs/${permRunId}/permission`, {
                    method: 'POST',
                    body: JSON.stringify({
                      requestId: reqId,
                      decision: 'ALLOW_ONCE'
                    })
                  });
                }

                if (evt.type === 'ToolCallCompleted') {
                  receivedToolCompleted = true;
                  sseReq.destroy();
                  resolve();
                }

                if (evt.type === 'RunCompleted' || evt.type === 'RunFailed') {
                  sseReq.destroy();
                  resolve();
                }
              } catch {}
            }
          }
        });
      });

      sseReq.on('error', reject);
      setTimeout(() => {
        sseReq.destroy();
        resolve();
      }, 6000);
    });

    assert.ok(receivedPermReq, 'Phải nhận được sự kiện PermissionRequired');
    assert.ok(receivedToolCompleted, 'Tool phải thực thi sau khi được User chấp thuận');
    console.log('    ✓ Human-in-the-loop permission flow thành công 100%.');
    console.log('\n🎉 ALL E2E PROTOCOL & PERMISSION TESTS PASSED!');
  } finally {
    await new Promise(r => setTimeout(r, 600));
    await daemon.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

runSelfContainedE2eTests().catch(err => {
  console.error('\n❌ Self-contained test suite failed:', err);
  process.exit(1);
});
