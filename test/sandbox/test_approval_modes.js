import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AppDatabase } from '../../server/db.js';
import { PermissionEngine } from '../../server/permissions.js';
import { AgentLoop } from '../../server/agent_loop.js';
import { createApiServer } from '../../server/api.js';
import { reviewAction } from '../../server/approval_modes.js';
import { collectReviewContext } from '../../server/approval_modes.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const db = new AppDatabase(':memory:');
const permissions = new PermissionEngine(db);
const projectScope = { projectId: 'project', scopeId: 'project:project', approvalMode: 'ask' };
assert.equal(permissions.evaluate('fs_write', 'src/main.ts', projectScope).action, 'ALLOW');
assert.equal(permissions.evaluate('shell_host', 'ls /tmp', projectScope).action, 'DENY');
assert.equal(permissions.evaluate('shell_exec', 'ls /tmp', projectScope).action, 'ASK');
assert.equal(permissions.evaluate('web_search', 'public docs', { scopeId: 'standalone:A', approvalMode: 'ask' }).action, 'ASK');
assert.equal(permissions.evaluate('web_search', 'public docs', projectScope).action, 'ASK');
assert.equal(permissions.evaluate('web_search', 'public docs', { ...projectScope, approvalMode: 'auto' }).action, 'ASK');
assert.equal(permissions.evaluate('shell_host', 'ls /tmp', { ...projectScope, approvalMode: 'full' }).action, 'DENY');
assert.equal(permissions.evaluate('shell_exec', 'ls /tmp', { ...projectScope, approvalMode: 'full' }).action, 'ALLOW');
db.setPolicy('shell_exec:forbidden', 'DENY');
assert.equal(permissions.evaluate('shell_exec', 'forbidden', { ...projectScope, approvalMode: 'full' }).action, 'DENY');
assert.equal(permissions.evaluate('web_search', 'docs', { ...projectScope, approvalMode: 'full' }).action, 'ALLOW');

const waiting = permissions.requestApproval({ runId: 'waiting', toolName: 'shell_exec', target: 'pwd', input: {}, scope: projectScope, policyTarget: 'pwd · {"cwd":"a"}' });
assert.equal(permissions.pendingRequests.get(waiting.requestId).timeout, undefined);
permissions.resolveApproval(waiting.requestId, 'ALLOW_ALWAYS');
assert.equal((await waiting.promise).allowed, true);
assert.equal(permissions.evaluate('shell_exec', 'pwd · {"cwd":"a"}', projectScope).action, 'ALLOW');
assert.equal(permissions.evaluate('shell_exec', 'pwd · {"cwd":"b"}', projectScope).action, 'ASK');
const cancelled = permissions.requestApproval({ runId: 'cancelled', toolName: 'shell_host', target: 'pwd', input: {}, scope: projectScope });
permissions.cancelForRun('cancelled');
assert.equal((await cancelled.promise).allowed, false);
assert.equal(permissions.getPendingRequests('cancelled').length, 0);
const standaloneScope = { scopeId: 'standalone:test', approvalMode: 'ask' };
const remembered = permissions.requestApproval({ runId: 'remembered', toolName: 'shell_exec', target: 'pwd', input: {}, scope: standaloneScope, policyTarget: 'pwd · {}' });
permissions.resolveApproval(remembered.requestId, 'ALLOW_ALWAYS');
await remembered.promise;
assert.equal(permissions.evaluate('shell_exec', 'pwd', standaloneScope, 'pwd · {}').action, 'ALLOW');
assert.equal(permissions.evaluate('shell_exec', 'pwd', standaloneScope, 'pwd · {"cwd":"elsewhere"}').action, 'ASK');
db.setPolicy('shell_exec:pwd', 'DENY');
assert.equal(permissions.evaluate('shell_exec', 'pwd', standaloneScope, 'pwd · {}').action, 'DENY');

const contextRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-review-')));
try {
  fs.writeFileSync(path.join(contextRoot, 'file.txt'), 'private content');
  fs.writeFileSync(path.join(contextRoot, '.env'), 'SECRET=hidden');
  fs.symlinkSync(path.join(contextRoot, 'file.txt'), path.join(contextRoot, 'link'));
  const scope = { canonicalRoot: contextRoot };
  assert.equal(collectReviewContext(scope, { path: 'file.txt' }).kind, 'file');
  assert.equal(collectReviewContext(scope, { path: 'file.txt' }).content, undefined);
  assert.equal(collectReviewContext(scope, { path: '.env' }).available, false);
  assert.equal(collectReviewContext(scope, { path: '../outside' }).available, false);
  assert.equal(collectReviewContext(scope, { path: 'link' }).available, false);
  assert.equal(collectReviewContext(scope, { path: 'new.txt' }).exists, false);
} finally { fs.rmSync(contextRoot, { recursive: true, force: true }); }

const reviewBase = { prompt: 'Xem thông tin máy', history: [], toolName: 'shell_host', input: { command: 'uname' }, scope: {}, signal: new AbortController().signal };
for (const answer of ['garbage', '{"decision":"allow","risk":"high","reason":"Xóa dữ liệu"}']) {
  const result = await reviewAction({ ...reviewBase, llm: { streamChat: async opts => { assert.deepEqual(opts.tools, []); opts.onChunk(answer); } } });
  assert.equal(result.decision, 'ask');
}
assert.equal((await reviewAction({ ...reviewBase, timeoutMs: 10, llm: { streamChat: () => new Promise(() => {}) } })).decision, 'ask');
assert.equal((await reviewAction({ ...reviewBase, llm: { streamChat: async () => { throw Error('offline'); } } })).decision, 'ask');
assert.equal((await reviewAction({ ...reviewBase, llm: { streamChat: async opts => opts.onChunk('x'.repeat(16001)) } })).decision, 'ask');
const cancellation = new AbortController();
const pendingReview = reviewAction({ ...reviewBase, signal: cancellation.signal, llm: { streamChat: () => new Promise(() => {}) } });
cancellation.abort();
assert.equal((await pendingReview).decision, 'ask');

db.upsertAgent({ id: 'test-agent', name: 'Test', avatar: 'T', system_prompt: 'Test', model_provider: 'test', model_name: 'test', temperature: .7 });
const networkRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-network-approval-')));
db.addProject('network-project', 'Network test', networkRoot);
async function runCase(id, mode, reviewDecision = 'allow', userDecision = 'ALLOW_ONCE', network = false) {
  db.createSession(id, 'test-agent', 'Kiểm tra máy', network ? 'network-project' : null);
  db.updateSession(id, 'Kiểm tra máy'); // Disable title generation for this test.
  db.db.prepare('UPDATE sessions SET approval_mode = ? WHERE id = ?').run(mode, id);
  let executed = 0, turns = 0;
  const events = [];
  const tool = { name: network ? 'web_search' : 'shell_host', parameters: { type: 'object', properties: { command: { type: 'string' } } }, execute: async () => { executed++; return { success: true, stdout: 'test machine' }; } };
  const registry = { get: name => name === tool.name ? tool : undefined, getAllDefinitions: () => [tool], validateCall: call => ({ tool, arguments: call.arguments }), killProcessesForRun: () => {} };
  registry.forStandalone = () => registry;
  registry.forWorkspace = () => registry;
  registry.resolveWorkspacePath = () => networkRoot;
  const llm = { streamChat: async options => {
    if (options.messages[0].content.startsWith('You are an independent approval reviewer')) {
      options.onChunk(JSON.stringify({ decision: reviewDecision, risk: reviewDecision === 'allow' ? 'low' : 'high', reason: 'Kết quả kiểm tra' }));
    } else if (turns++ === 0) options.onToolCall({ id: 'tool-1', name: tool.name, arguments: network ? { query: 'public docs' } : { command: 'uname' } });
    else options.onChunk('Kết quả: máy đã được kiểm tra.');
    return { completed: true };
  } };
  const loop = new AgentLoop({ db, permissions, tools: registry, skills: {}, llm });
  loop.on('event', event => {
    events.push(event);
    if (event.type === 'PermissionRequired') permissions.resolveApproval(event.payload.requestId, userDecision);
  });
  await loop.run({ runId: `run-${id}`, sessionId: id, prompt: 'Xem thông tin máy' });
  if (executed) assert(!events.some(event => event.type === 'RunFailed'));
  return { executed, events };
}
const manual = await runCase('manual', 'ask');
assert.equal(manual.executed, 1);
assert(manual.events.some(event => event.type === 'PermissionRequired'));
const auto = await runCase('auto', 'auto');
assert.equal(auto.executed, 1);
assert(auto.events.some(event => event.type === 'ApprovalReviewed'));
assert(!auto.events.some(event => event.type === 'PermissionRequired'));
const fallback = await runCase('fallback', 'auto', 'ask', 'DENY');
assert.equal(fallback.executed, 0);
assert(fallback.events.some(event => event.type === 'PermissionRequired'));
assert.equal((await runCase('denied', 'auto', 'deny')).executed, 0);
const full = await runCase('full', 'full');
assert.equal(full.executed, 1);
assert(!full.events.some(event => event.type === 'PermissionRequired' || event.type === 'ApprovalReviewed'));
const [parallelAuto, parallelFull] = await Promise.all([runCase('parallel-auto', 'auto'), runCase('parallel-full', 'full')]);
assert(parallelAuto.events.some(event => event.type === 'ApprovalReviewed'));
assert(!parallelFull.events.some(event => event.type === 'ApprovalReviewed'));
for (const mode of ['ask', 'auto', 'full']) {
  const result = await runCase(`network-${mode}`, mode, 'allow', 'ALLOW_ONCE', true);
  assert.equal(result.executed, 1);
  assert.equal(result.events.some(event => event.type === 'PermissionRequired'), mode === 'ask');
  assert.equal(result.events.some(event => event.type === 'ApprovalReviewed'), mode === 'auto');
}
assert.equal((await runCase('network-denied', 'auto', 'deny', 'DENY', true)).executed, 0);

// Exercise the HTTP boundary while the real driver is awaiting the model or a
// permission. A preference change must not grant/revoke the active run's tools.
db.createSession('next-mode', 'test-agent', 'Permission snapshot');
db.updateSession('next-mode', 'Permission snapshot');
let current, executed = 0;
const snapshotTool = { name: 'shell_host', parameters: { type: 'object', properties: {} }, execute: async () => { executed++; return { success: true }; } };
const snapshotTools = { get: name => name === snapshotTool.name ? snapshotTool : undefined, getAllDefinitions: () => [snapshotTool], validateCall: call => ({ tool: snapshotTool, arguments: call.arguments }), killProcessesForRun: () => {} };
snapshotTools.forStandalone = () => snapshotTools;
const snapshotLoop = new AgentLoop({ db, permissions, tools: snapshotTools, skills: {}, llm: { streamChat: async options => {
  if (current.step++ === 0) {
    current.started.resolve();
    await current.resume.promise;
    options.onToolCall({ id: 'snapshot-tool', name: 'shell_host', arguments: {} });
  } else options.onChunk('Finished permission snapshot test.');
  return { completed: true };
} } });
snapshotLoop.on('event', event => {
  if (event.type === 'PermissionRequired') {
    current.approvals++;
    current.approval.resolve(event.payload.requestId);
    if (!current.asks) permissions.resolveApproval(event.payload.requestId, 'DENY');
  }
});
const snapshotApi = createApiServer({ db, tools: snapshotTools, permissions, skills: {}, llm: {}, agentLoop: snapshotLoop });
try {
  const address = await snapshotApi.listen(0);
  const setMode = mode => fetch(`http://127.0.0.1:${address.port}/api/sessions/next-mode/approval-mode`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
  for (const [index, initial, next, asks] of [[0, 'ask', 'full', true], [1, 'full', 'ask', false], [2, 'ask', 'ask', true]]) {
    current = { step: 0, asks, approvals: 0, started: Promise.withResolvers(), resume: Promise.withResolvers(), approval: Promise.withResolvers() };
    const runId = `snapshot-${index}`, before = executed;
    const finished = snapshotLoop.run({ runId, sessionId: 'next-mode', prompt: 'Test current permissions' });
    const endedEarly = finished.then(() => { throw Error('Run ended before reaching the expected permission boundary'); });
    await Promise.race([current.started.promise, endedEarly]);
    assert.equal(snapshotLoop.activeRuns.get(runId).scope.approvalMode, initial);
    assert.equal((await setMode(next)).status, 200);
    assert.equal(db.getSession('next-mode').approval_mode, next);
    current.resume.resolve();
    if (asks) {
      const requestId = await Promise.race([current.approval.promise, endedEarly]);
      assert.equal((await setMode(next)).status, 200);
      assert(permissions.getPendingRequests(runId).some(request => request.requestId === requestId), 'Saving a mode must leave pending approvals intact');
      permissions.resolveApproval(requestId, 'DENY');
    }
    await finished;
    // Consume the rejection produced by endedEarly after a successful boundary.
    await endedEarly.catch(() => {});
    assert.equal(current.approvals, asks ? 1 : 0);
    assert.equal(executed - before, asks ? 0 : 1);
  }
} finally {
  current?.resume.resolve();
  await snapshotLoop.drain();
  await snapshotApi.close();
}

// Validate server persistence, session separation and changes during active runs.
const apiLoop = Object.assign(new EventEmitter(), { activeRuns: new Map() });
const api = createApiServer({ db, tools: {}, permissions, skills: {}, llm: {}, agentLoop: apiLoop });
try {
  const address = await api.listen(0);
  const setMode = (id, mode) => fetch(`http://127.0.0.1:${address.port}/api/sessions/${id}/approval-mode`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
  assert.equal((await setMode('manual', 'bad')).status, 400);
  assert.equal((await setMode('missing', 'ask')).status, 404);
  assert.equal((await setMode('manual', 'auto')).status, 200);
  assert.equal(db.getSession('manual').approval_mode, 'auto');
  assert.equal(db.getSession('full').approval_mode, 'full');
  apiLoop.activeRuns.set('running', { sessionId: 'manual' });
  assert.equal((await setMode('manual', 'full')).status, 200);
  assert.equal(db.getSession('manual').approval_mode, 'full');
  let finishQueued;
  apiLoop.run = () => new Promise(resolve => { finishQueued = resolve; });
  const runResponse = await fetch(`http://127.0.0.1:${address.port}/api/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'full', prompt: 'Kiểm tra hàng đợi' }) });
  assert.equal(runResponse.status, 202);
  assert.equal((await setMode('full', 'ask')).status, 200);
  assert.equal(db.getSession('full').approval_mode, 'ask');
  finishQueued();
} finally { await api.close(); db.close(); fs.rmSync(networkRoot, { recursive: true, force: true }); }
console.log('✓ Approval modes: human prompts, independent review, deny, failure fallback, full access and saving during active/queued runs');
