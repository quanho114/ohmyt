import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';

const daemon = await harnessFixture({stream: async (_messages, options) => {
  options.onToken?.('Xin chào từ CLI');
  return {completed: true};
}});
try {
  const {port} = await daemon.start();
  const base = `http://127.0.0.1:${port}/api`;
  const get = async url => {const res = await fetch(base + url); return {status: res.status, body: await res.json()};};
  const runtime = await get('/runtime');
  assert.equal(runtime.status, 200);
  assert.equal(runtime.body.protocolVersion, 1);
  assert.equal(typeof runtime.body.instanceId, 'string');
  daemon.db.createSession('cli', 'fixture', 'CLI fixture');
  const payload = {clientMessageId: 'cli-message', kind: 'queued', content: 'Hello'};
  const post = () => fetch(base + '/sessions/cli/inbox', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  const item = await (await post()).json();
  assert.equal((await (await post()).json()).id, item.id);
  let submission;
  for (let i = 0; i < 100; i++) {
    const response = await get('/sessions/cli/submissions/cli-message');
    assert.equal(response.status, 200);
    submission = response.body;
    if (submission.settled) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(submission.status, 'completed');
  assert.equal(submission.settled, true);
  assert.equal(submission.answer, 'Xin chào từ CLI');
  assert.equal(daemon.db.db.prepare('SELECT COUNT(*) AS n FROM runs WHERE session_id=?').get('cli').n, 1);
  daemon.db.createSession('other', 'fixture', 'Other');
  assert.equal((await get('/sessions/other/submissions/cli-message')).status, 404);
  const approval = daemon.permissions.requestApproval({runId: submission.runId, toolName: 'example', target: 'file', input: {}, scope: {scopeId: 'secret'}});
  const pending = await get(`/runs/${submission.runId}/approvals`);
  assert.equal(pending.body.requests[0].requestId, approval.requestId);
  assert.equal('resolve' in pending.body.requests[0], false);
  daemon.permissions.cancelForRun(submission.runId);
  assert.equal((await get('/runs/missing/approvals')).status, 404);
  const collision = await fetch(base + '/sessions/cli/inbox', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...payload, content: 'different'})});
  assert.equal(collision.status, 409);
  console.log('PASS CLI runtime, scoped submission, settlement, approval snapshot, idempotency');
} finally {await daemon.closeFixture();}
