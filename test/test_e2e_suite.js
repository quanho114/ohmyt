import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createDaemon } from '../server/index.js';
import { AppDatabase } from '../server/db.js';
import { createApiServer } from '../server/api.js';
import { EventEmitter } from 'node:events';

async function runSessionRenameTests() {
  const db = new AppDatabase(':memory:');
  const api = createApiServer({ db, agentLoop: new EventEmitter(), port: 0 });
  try {
    const { port } = await api.listen(0);
    const base = `http://127.0.0.1:${port}/api/sessions`;
    const sessionId = 'sess-rename';
    const agentId = 'rename-assistant';
    db.upsertAgent({
      id: agentId, name: 'Rename Assistant', avatar: 'R',
      system_prompt: 'Keep the conversation.', model_provider: 'ollama',
      model_name: 'rename-model', temperature: 0.7
    });
    const created = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId, agentId, title: 'Original title' })
    });
    assert.strictEqual(created.status, 201);
    await created.json();

    const patch = (suffix, body) => fetch(`${base}/${sessionId}${suffix}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const override = { providerId: 'rename-provider', modelId: 'rename-model' };
    const modelResponse = await patch('/model', { override });
    assert.strictEqual(modelResponse.status, 200);
    assert.deepStrictEqual((await modelResponse.json()).override, override);
    db.addMessage('msg-rename-user', sessionId, 'user', 'Keep this question.');
    db.addMessage('msg-rename-agent', sessionId, 'agent', 'Keep this answer.', { source: 'saved' });
    const messagesBefore = db.getMessages(sessionId).map(message => ({ ...message }));
    const sessionBefore = { ...db.getSession(sessionId) };

    const response = await patch('', { title: '  Renamed conversation \n' });
    assert.strictEqual(response.status, 200);
    const renamed = await response.json();
    assert.strictEqual(renamed.id, sessionId);
    assert.strictEqual(renamed.title, 'Renamed conversation');
    assert.strictEqual(renamed.agent_id, agentId);
    assert.strictEqual(renamed.created_at, sessionBefore.created_at);
    assert.deepStrictEqual(JSON.parse(renamed.model_override_json), override);
    const sessions = await fetch(base);
    assert.strictEqual(sessions.status, 200);
    const persisted = (await sessions.json()).find(session => session.id === sessionId);
    assert.strictEqual(persisted.title, 'Renamed conversation');
    assert.strictEqual(persisted.agent_id, agentId);
    assert.deepStrictEqual(JSON.parse(persisted.model_override_json), override);
    const messages = await fetch(`${base}/${sessionId}/messages`);
    assert.strictEqual(messages.status, 200);
    assert.deepStrictEqual(await messages.json(), messagesBefore);

    const maxTitle = 'x'.repeat(200);
    const boundary = await patch('', { title: ` \t${maxTitle}\n ` });
    assert.strictEqual(boundary.status, 200);
    assert.strictEqual((await boundary.json()).title, maxTitle);
    const unchangedSession = { ...db.getSession(sessionId) };
    const unchangedSessions = await (await fetch(base)).json();
    for (const body of [
      null, {}, { title: null }, { title: 17 }, { title: true },
      { title: {} }, { title: [] }, { title: '' },
      { title: ' \n\t ' }, { title: 'x'.repeat(201) }
    ]) {
      const rejected = await patch('', body);
      assert.strictEqual(rejected.status, 400);
      assert.strictEqual(typeof (await rejected.json()).error, 'string');
      assert.deepStrictEqual({ ...db.getSession(sessionId) }, unchangedSession);
      assert.deepStrictEqual(db.getMessages(sessionId).map(message => ({ ...message })), messagesBefore);
    }

    for (const suffix of ['/messages', '/']) {
      const rejected = await patch(suffix, { title: 'Do not rename' });
      assert.strictEqual(rejected.status, 404);
      await rejected.json();
      assert.deepStrictEqual({ ...db.getSession(sessionId) }, unchangedSession);
    }
    const missing = await fetch(`${base}/missing-session`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Missing conversation' })
    });
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(typeof (await missing.json()).error, 'string');
    assert.strictEqual(db.getSession('missing-session'), undefined);
    assert.deepStrictEqual(await (await fetch(base)).json(), unchangedSessions);
    assert.deepStrictEqual(await (await fetch(`${base}/${sessionId}/messages`)).json(), messagesBefore);
    const encodedId = 'sess Đổi tên/#';
    db.createSession(encodedId, agentId, 'Encoded identifier');
    const encodedRename = await fetch(`${base}/${encodeURIComponent(encodedId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Renamed encoded identifier' })
    });
    assert.strictEqual(encodedRename.status, 200);
    assert.strictEqual((await encodedRename.json()).id, encodedId);
    assert.strictEqual(db.getSession(encodedId).title, 'Renamed encoded identifier');
    const malformedId = await fetch(`${base}/%ZZ`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Do not run' })
    });
    assert.strictEqual(malformedId.status, 400);
    console.log('    ✓ Session rename persists, preserves conversation state, and rejects invalid requests without mutation.');
  } finally {
    await api.close();
    db.close();
  }
}

async function runSelfContainedE2eTests() {
  console.log('🚀 Running Self-Contained E2E Protocol & Permission Suite (No mock tests)...');

  const tempDir = path.resolve(process.cwd(), '.test_e2e_env_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'state'));
  const projectRoot = path.join(tempDir, 'project');
  fs.mkdirSync(projectRoot);
  const testDbPath = path.join(tempDir, 'state', 'e2e.db');
  const port = 0;

  const daemon = createDaemon({
    dbPath: testDbPath,
    workspaceRoot: tempDir,
    port
  });

  let BASE_URL;

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
            resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode, text: body, headers: res.headers });
          }
        });
      });

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  try {
    const address = await daemon.start();
    BASE_URL = `http://127.0.0.1:${address.port}`;
    console.log(`    ✓ Ephemeral test daemon listening on port ${address.port}`);
    assert.strictEqual(daemon.apiServer.server.address().address, '127.0.0.1', 'The API daemon must bind only to loopback');

    // 1. Status Check
    console.log('  ▶ Test 1: GET /api/status...');
    const statusRes = await fetchJson('/api/status');
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.data.status, 'online');
    assert.strictEqual(statusRes.data.db, 'sqlite-wal');
    console.log('    ✓ API status online, SQLite WAL active.');
    const localOriginStatus = await fetchJson('/api/status', { headers: { Origin: 'http://localhost:5173' } });
    assert.strictEqual(localOriginStatus.status, 200, 'The configured local Vite origin remains allowed');
    assert.strictEqual(localOriginStatus.headers['access-control-allow-origin'], 'http://localhost:5173');

    const foreignOriginStatus = await fetchJson('/api/status', { headers: { Origin: 'https://evil.example' } });
    assert.strictEqual(foreignOriginStatus.status, 403, 'Foreign browser origins must not read daemon status');
    const noOriginStatuses = await fetchJson('/api/status');
    assert.strictEqual(noOriginStatuses.status, 200, 'Native local clients without a browser Origin remain compatible');
    const foreignOriginSession = await fetchJson('/api/sessions', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: JSON.stringify({ title: 'must not be created' })
    });
    assert.strictEqual(foreignOriginSession.status, 403, 'Foreign browser origins must not mutate sessions');
    assert.ok(!JSON.stringify(foreignOriginSession.data).includes('id'), 'Denied origin receives no new session identity');
    const hostileHostSession = await fetchJson('/api/sessions', {
      method: 'POST',
      headers: { Host: 'attacker.example' },
      body: JSON.stringify({ title: 'must not be created' })
    });
    assert.strictEqual(hostileHostSession.status, 403, 'Foreign Host headers must not reach mutation routes');

    // 2. Session Creation
    console.log('  ▶ Test 2: POST /api/sessions...');
    const projectRes = await fetchJson('/api/projects', {method:'POST',body:JSON.stringify({path:projectRoot})});
    assert.strictEqual(projectRes.status,201);
    const sessRes = await fetchJson('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Self Contained Session', projectId:projectRes.data.id })
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
      return { completed: true, finishReason: e2eCalls === 1 ? 'tool_calls' : 'stop', latencyMs: 1 };
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
    const storedMessages = (await fetchJson(`/api/sessions/${sessionId}/messages`)).data;
    assert.strictEqual(storedMessages.find(message => message.sender === 'user')?.content, 'Liệt kê danh sách file');

    // 4. Interactive Permission Approval
    // Stub riêng cho run này: gọi shell_exec (policy ASK) để kích hoạt Human-in-the-loop.
    let permCalls = 0;
    daemon.gateway.streamChat = async ({ onChunk, onToolCall }) => {
      permCalls++;
      if (permCalls === 1) onToolCall({ id: 'call_e2e_perm', name: 'shell_exec', arguments: { command: 'echo "PermissionGranted"' } });
      onChunk('Xong.');
      return { completed: true, finishReason: permCalls === 1 ? 'tool_calls' : 'stop', latencyMs: 1 };
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

runSessionRenameTests().then(runSelfContainedE2eTests).catch(err => {
  console.error('\n❌ Self-contained test suite failed:', err);
  process.exit(1);
});
