import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BrowserUseRuntime, browserUseConfig } from '../server/browser_use.js';
import { BrowserUseCDP } from '../server/browser_use_cdp.js';
import { BrowserBridge } from '../server/browser_bridge.js';
import { ToolRegistry } from '../server/tools.js';
import { AppDatabase } from '../server/db.js';
import { PermissionEngine } from '../server/permissions.js';
import { AgentLoop } from '../server/agent_loop.js';

const fixture = fileURLToPath(new URL('./fixtures/browser_use_sidecar.cjs', import.meta.url));
const config = { enabled: true, python: process.execPath, domains: ['example.com'], headless: true, timeoutMs: 1000, maxRuns: 2 };
let spawns = 0;
const spawnProcess = (_python, _args, options) => {
  spawns++;
  assert.equal(options.shell, false);
  assert.equal(options.env.OPENAI_API_KEY, undefined);
  assert.equal(options.env.OHMYT_LOCAL_RUNTIME_CONFIG, undefined);
  assert.equal(options.env.ANONYMIZED_TELEMETRY, 'false');
  return spawn(process.execPath, [fixture], options);
};
const runtime = new BrowserUseRuntime(config, { spawnProcess });
const db = new AppDatabase(':memory:');
const registry = new ToolRegistry(db);
const bridge = new BrowserBridge(); bridge.registerTools(registry);
runtime.registerTools(registry);
const ctx = runId => ({ runId, sessionId: 'chat', scopeId: 'standalone:chat' });
const navigate = (runId, route = '/') => runtime.execute('navigate', { url: 'https://example.com' + route }, ctx(runId));
try {
  const noAllowedBridge=new BrowserBridge();
  noAllowedBridge.nativeCommand=async action=>action==='tabs'?[{id:5,url:'https://www.google.com/'}]:action==='cdp.active'?{tabId:5}:{};
  const noAllowed=new BrowserUseCDP(noAllowedBridge,{runId:'no-tab',sessionId:'chat',domains:['github.com']});
  await assert.rejects(noAllowed.start(),error=>error.code==='NO_ALLOWED_TAB' && error.message.includes('5:www.google.com') && error.message.includes('github.com') && error.recovery.nextAction==='browser_tabs');
  assert.equal(noAllowed.targets.size,0);await noAllowed.close();await noAllowedBridge.close();
  assert.equal(browserUseConfig({}).enabled, false);
  const disabled = new BrowserUseRuntime({ enabled: false });
  const empty = { register() { throw Error('Disabled backend registered tools'); } };
  disabled.registerTools(empty);
  await assert.rejects(disabled.execute('read', {}, ctx('disabled')), /disabled/);
  assert.throws(() => new BrowserUseRuntime({ ...config, domains: [] }), /exact public/);
  for (const domain of ['localhost', '127.0.0.1', '*.example.com', 'https://example.com', 'service.local']) assert.throws(() => new BrowserUseRuntime({ ...config, domains: [domain] }), /exact public/);
  assert.equal(registry.getAllDefinitions().filter(tool => tool.name.startsWith('browser_use_')).length, 27);
  assert.ok(registry.forStandalone({}).get('browser_use_navigate'));
  assert.equal(registry.forWorkspace(process.cwd(), { projectId: 'p', scopeId: 'project:p' }).get('browser_use_read'), undefined);
  const permissions = new PermissionEngine(db);
  assert.equal(permissions.evaluate('browser_use_click', '', { scopeId: 'standalone:chat', approvalMode: 'ask' }).action, 'ASK');
  assert.equal(permissions.evaluate('browser_use_read', '', { projectId: 'p', scopeId: 'project:p', approvalMode: 'full' }).action, 'DENY');
  for (const url of ['file:///etc/passwd', 'https://other.example/', 'https://u:p@example.com/', 'http://127.0.0.1/']) await assert.rejects(runtime.execute('navigate', { url }, ctx('bad')), /domain policy/);
  await assert.rejects(runtime.execute('read', {}, { ...ctx('bad'), scopeId: 'project:p' }), /standalone/);
  assert.equal(spawns, 0);
  assert.throws(() => registry.validateCall({ name: 'browser_use_click', arguments: { index: 1 } }), /snapshotId/);
  assert.throws(() => registry.validateCall({ name: 'browser_use_read', arguments: { evaluate: 'alert(1)' } }), /Unknown/);

  const a = await navigate('a'); const b = await navigate('b');
  assert.notEqual(a.root, b.root);
  assert.equal(fs.statSync(a.root).mode & 0o777, 0o700);
  await assert.rejects(navigate('c'), /concurrent/);
  await assert.rejects(runtime.execute('read', {}, { ...ctx('a'), sessionId: 'other' }), /another chat/);
  const typed = await runtime.execute('type', { index: 1, snapshotId: a.snapshotId, text: 'hello' }, ctx('a'));
  await assert.rejects(runtime.execute('click', { index: 2, snapshotId: a.snapshotId }, ctx('a')), /action failed/);
  assert.notEqual(typed.snapshotId, a.snapshotId);
  await runtime.releaseRun('a'); await runtime.releaseRun('b');
  assert.equal(fs.existsSync(a.root), false); assert.equal(runtime.runs.size, 0);

  for (const [route, pattern] of [['/invalid', /protocol/], ['/huge', /too large/], ['/crash', /exited/], ['/hang', /timed out/], ['/error', /action failed/]]) {
    await assert.rejects(navigate('failure', route), error => pattern.test(error.message) && !error.message.includes('private content'));
    await runtime.releaseRun('failure');
  }
  const controller = new AbortController();
  const action = runtime.execute('navigate', { url: 'https://example.com/hang' }, { ...ctx('abort'), signal: controller.signal });
  const check = assert.rejects(action, /stopped/);
  controller.abort(); await check; await runtime.releaseRun('abort');
  const simultaneous = navigate('busy', '/hang');
  const timeoutCheck = assert.rejects(simultaneous, /timed out/);
  await assert.rejects(navigate('busy'), /busy/);
  await timeoutCheck; await runtime.releaseRun('busy');
  const absent = new BrowserUseRuntime({ ...config, python: '/missing/ohmyt-python' });
  await assert.rejects(absent.execute('read', {}, ctx('missing')), /Cannot start|exited/); await absent.close();

  // Real agent loop: default policy and explicit Chrome sharing cannot authorize this separate browser.
  db.upsertAgent({ id: 'bu-agent', name: 'BU', avatar: 'B', system_prompt: 'Test', model_provider: 'test', model_name: 'test', temperature: .7, policy: JSON.stringify({ execution: 'APPROVAL_CONTROLLED' }) });
  const agent = db.getAgent('bu-agent');
  const runAgent = async ({ id, policy, decision }) => {
    db.createSession(id, 'bu-agent', 'Browser test');
    db.addMessage(id+'-old',id,'agent','Chrome extension cannot export PDF.');
    let modelCalls = 0;
    const policyDb = Object.create(db);
    policyDb.getAgent = () => ({ ...agent, policy_json: JSON.stringify({ execution: policy }) });
    const loop = new AgentLoop({ db: policyDb, tools: registry, permissions, skills: {}, llm: { streamChat: async ({ onToolCall, onChunk, messages, tools }) => {
      assert.ok(messages[0].content.includes('## BROWSER USE'));
      assert.ok(tools.some(tool => tool.name === 'browser_use_pdf'));
      if (runtime.config.mode === 'integrated') assert.ok(messages.some(message => message.role === 'system' && message.content.includes('supersede old assistant claims')));
      if (!modelCalls++) onToolCall({ id: 'bu', name: 'browser_use_navigate', arguments: { url: 'https://example.com/' } });
      else onChunk('Result observed.');
      return { completed: true };
    } } });
    loop.on('event', event => {
      if (event.type === 'PermissionRequired') permissions.resolveApproval(event.payload.requestId, decision);
    });
    const before = spawns;
    bridge.grants.set(id, [{ id: 7, url: 'https://example.com/' }]);
    await loop.run({ runId: id + '-run', sessionId: id, prompt: 'Use Browser Use to read example.com' });
    assert.equal(runtime.runs.size, 0);
    return spawns - before;
  };
  runtime.config.mode = 'integrated';
  assert.equal(await runAgent({ id: 'local', policy: 'LOCAL_ONLY', decision: 'ALLOW_ONCE' }), 0);
  runtime.config.mode = 'standalone';
  db.setPolicy('browser_use_*', 'DENY');
  assert.equal(await runAgent({ id: 'deny', policy: 'APPROVAL_CONTROLLED', decision: 'ALLOW_ONCE' }), 0);
  db.db.prepare('DELETE FROM tool_policies WHERE pattern = ?').run('browser_use_*');
  assert.equal(await runAgent({ id: 'reject', policy: 'APPROVAL_CONTROLLED', decision: 'DENY' }), 0);
  assert.equal(await runAgent({ id: 'allow', policy: 'APPROVAL_CONTROLLED', decision: 'ALLOW_ONCE' }), 1);

  const daemonCheck = spawnSync(process.execPath, ['--input-type=module', '-e', "import {createDaemon} from './server/index.js'; const d=createDaemon({dbPath:':memory:',port:0,browserUse:{enabled:false}}); if(d.tools.get('browser_use_read')) process.exit(1); await d.stop();"], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 10000 });
  assert.equal(daemonCheck.status, 0, daemonCheck.stderr);
  console.log('PASS Browser Use: opt-in, schemas, domains, project boundary, per-run isolation, approvals, LOCAL_ONLY, protocol failures, timeout, abort and cleanup');
} finally { await runtime.close(); await bridge.close(); db.close(); }
