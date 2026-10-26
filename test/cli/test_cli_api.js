import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
import {Client} from '../../cli/client.js';
import {submit} from '../../cli/run.js';

const daemon = await harnessFixture({stream: async options => {
  options.onChunk('Xin chào từ CLI');
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
  daemon.db.createSession('child', 'fixture', 'Child'); daemon.db.createRun('child-run', 'child');
  daemon.db.db.prepare('INSERT INTO harness_children(session_id,parent_session_id,parent_run_id,child_id) VALUES(?,?,?,?)').run('child', 'cli', submission.runId, 'child-fixture');
  const childApproval = daemon.permissions.requestApproval({runId: 'child-run', toolName: 'child_action', target: 'child', input: {}});
  const childPending = await get(`/runs/${submission.runId}/approvals`);
  assert.equal(childPending.body.requests[0].requestId, childApproval.requestId);
  daemon.permissions.cancelForRun('child-run'); daemon.db.updateRunStatus('child-run', 'aborted');
  assert.equal((await get('/runs/missing/approvals')).status, 404);
  const collision = await fetch(base + '/sessions/cli/inbox', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...payload, content: 'different'})});
  assert.equal(collision.status, 409);
  daemon.db.createSession('lost-response', 'fixture', 'Lost response');
  const client = new Client(`http://127.0.0.1:${port}`), request = client.request.bind(client);
  let dropped = false;
  client.request = async (route, options) => {
    const result = await request(route, options);
    if (options?.method === 'POST' && !dropped) {dropped = true; throw new Error('response lost after commit');}
    return result;
  };
  const recovered = await submit(client, 'lost-response', 'Do once');
  assert(recovered);
  assert.equal(daemon.db.db.prepare('SELECT COUNT(*) AS n FROM harness_inbox WHERE session_id=?').get('lost-response').n, 1);
  console.log('PASS CLI runtime, scoped submission, settlement, approval snapshot, idempotency');
} finally {await daemon.closeFixture();}
