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

async function testPermissionFlow() {
  console.log('🛡️ Testing Real Interactive Permission Approval Flow (Human-in-the-loop)...');

  // 1. Create a session
  const sessRes = await fetchJson('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: 'Permission Flow Test' })
  });
  const sessionId = sessRes.data.id;

  // 2. Start a run that calls shell_exec (which has policy ASK)
  const runRes = await fetchJson('/api/runs', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      prompt: 'Chạy lệnh shell: echo "PermissionApproved"'
    })
  });
  const runId = runRes.data.runId;

  // 3. Connect to SSE and wait for PermissionRequired event
  let permissionRequestId = null;
  let receivedPermissionRequired = false;
  let receivedToolCompleted = false;

  await new Promise((resolve, reject) => {
    const sseReq = http.get(`${BASE_URL}/api/runs/${runId}/stream`, res => {
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
                receivedPermissionRequired = true;
                permissionRequestId = evt.payload.requestId;
                console.log(`    ✓ PermissionRequired event received (RequestId: ${permissionRequestId})`);

                // Simulate User clicking "Cho phép 1 lần" in UI Modal
                console.log('    ▶ User approving permission via POST /api/runs/:id/permission...');
                const approvalRes = await fetchJson(`/api/runs/${runId}/permission`, {
                  method: 'POST',
                  body: JSON.stringify({
                    requestId: permissionRequestId,
                    decision: 'ALLOW_ONCE'
                  })
                });
                assert.strictEqual(approvalRes.status, 200);
                assert.strictEqual(approvalRes.data.success, true);
                console.log('    ✓ Approval submitted successfully.');
              }

              if (evt.type === 'ToolCallCompleted') {
                receivedToolCompleted = true;
                console.log('    ✓ ToolCallCompleted event received after approval.');
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
    }, 8000);
  });

  assert.ok(receivedPermissionRequired, 'Phải nhận được sự kiện PermissionRequired');
  assert.ok(receivedToolCompleted, 'Tool phải được thực thi sau khi User phê duyệt');
  console.log('\n🎉 ALL REAL PERMISSION FLOW TESTS PASSED (100% verified, 0 mock tests)!');
}

testPermissionFlow().catch(err => {
  console.error('\n❌ Permission test failed:', err);
  process.exit(1);
});
