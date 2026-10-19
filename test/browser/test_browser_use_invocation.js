import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BrowserUseRuntime } from '../../server/browser_use.js';
import { BrowserBridge } from '../../server/browser_bridge.js';
import { ToolRegistry } from '../../server/tools.js';
import { AppDatabase } from '../../server/db.js';
import { ToolInvocationService } from '../../server/harness/tool_invocation.js';
import { taskOutcome } from '../../server/harness/outcomes.js';

// Exercise the actual browser runtime through canonical receipts and the
// uncertainty fence. No Python/Chromium or external network is required.
const db = new AppDatabase(':memory:');
const fixture = fileURLToPath(new URL('../fixtures/browser_use_sidecar.cjs', import.meta.url));
const egress = () => ({ url: 'http://127.0.0.1:1', async start() {}, async close() {} });
const config = { enabled: true, domains: ['example.com'], timeoutMs: 1000 };
const runtimes = [], bridges = [];
function invocation(runtime, bridge, id) {
  runtime.browserBridge = bridge;
  const registry = new ToolRegistry(db);
  bridge.registerTools(registry);
  runtime.registerTools(registry);
  const run = { runId: id, sessionId: id, agentId: 'test', scope: { scopeId: `standalone:${id}` }, signal: new AbortController().signal, runTools: registry, capabilities: registry.getAllDefinitions().map(tool => tool.name) };
  const service = new ToolInvocationService({ resolveRun: () => run, authorize: async () => ({ action: 'ALLOW' }) });
  return { run, invoke: (id, name, args) => service.invoke({ call: { id, name, arguments: args }, context: { runId: run.runId } }) };
}
try {
  // A command dispatched to a sidecar that dies remains unknown; opening another
  // browser tab must stay fenced until a human-directed recovery turn.
  const dispatched = new BrowserUseRuntime({ ...config, mode: 'standalone' }, { createEgress: egress, spawnProcess: (_python, _args, options) => spawn(process.execPath, [fixture], options) });
  runtimes.push(dispatched);
  const standaloneBridge = new BrowserBridge(); bridges.push(standaloneBridge);
  const dispatchedCall = invocation(dispatched, standaloneBridge, 'dispatched');
  const uncertain = await dispatchedCall.invoke('crash', 'browser_use_navigate', { url: 'https://example.com/crash' });
  assert.equal(uncertain.status, 'unknown');
  assert.deepEqual(taskOutcome({ results: [{ ...uncertain, name: 'browser_use_navigate' }, { callId: 'fabricated-success', name: 'browser_use_navigate', status: 'success' }] }).unresolvedCallIds, ['crash'], 'later success cannot erase an actually unknown mutation');
  assert.equal((await dispatchedCall.invoke('blocked', 'browser_tabs', {})).output.code, 'RUN_UNCERTAIN');

  let sidecarSpawns = 0, opens = 0;
  const bridge = new BrowserBridge(); bridges.push(bridge);
  let tabs = [];
  bridge.nativeCommand = async (action, args) => {
    if (action === 'tabs') return tabs;
    if (action === 'cdp.active') return { tabId: tabs[0]?.id };
    if (action === 'open') { opens++; tabs = [{ id: 7, url: args.url }]; return { tabId: 7 }; }
    if (action === 'cdp.attach' || action === 'cdp.check') return { targetId: String(args.tabId), url: tabs[0].url };
    if (['cdp.detach', 'cdp.release', 'files.cancel'].includes(action)) return {};
    throw Error(`Unexpected desktop action: ${action}`);
  };
  const runtime = new BrowserUseRuntime({ ...config, mode: 'integrated' }, { createEgress: egress, spawnProcess: (_python, _args, options) => { sidecarSpawns++; return spawn(process.execPath, [fixture], options); } });
  runtimes.push(runtime);
  // Restore only the old registration behavior in this test registry. This
  // proves the original bug with the correctly wired real runtime and bridge.
  const legacy = invocation(runtime, bridge, 'legacy-no-tab');
  legacy.run.runTools.get('browser_use_navigate').execute = (args, context) => runtime.execute('navigate', args, context);
  const legacyResult = await legacy.invoke('legacy-navigate', 'browser_use_navigate', { url: 'https://example.com/' });
  assert.equal(legacyResult.status, 'unknown', 'legacy registration reproduces the startup misclassification');
  assert.equal(sidecarSpawns, 0);
  assert.equal((await legacy.invoke('legacy-open', 'browser_open', { url: 'https://example.com/' })).output.code, 'RUN_UNCERTAIN');
  const { run, invoke } = invocation(runtime, bridge, 'no-tab');
  const result = await invoke('navigate', 'browser_use_navigate', { url: 'https://example.com/' });
  assert.equal(sidecarSpawns, 0);
  assert.equal(result.status, 'error', 'missing tab is a known startup failure, not an unknown navigation outcome');
  assert.equal(result.output.code, 'NO_ALLOWED_TAB');
  assert.equal(result.output.recovery.mutationOutcomeUnknown, false);
  assert.doesNotMatch(result.output.error, /PDF/);
  assert.equal(runtime.runs.has(run.runId), false, 'failed startup must release the runtime slot');
  assert.equal(run.uncertainToolCallIds?.size || 0, 0);
  const recovered = await invoke('open', 'browser_open', { url: 'https://example.com/' });
  assert.equal(recovered.status, 'success', 'known startup failure must allow browser_open recovery in the same run');
  assert.equal(opens, 1);
  const failedNavigation = { ...result, name: 'browser_use_navigate' };
  const opened = { ...recovered, name: 'browser_open' };
  assert.deepEqual(taskOutcome({ results: [failedNavigation, opened] }).unresolvedCallIds, ['navigate'], 'opening a tab alone does not finish navigation');
  const navigated = await invoke('navigate-after-open', 'browser_use_navigate', { url: 'https://example.com/' });
  assert.equal(navigated.status, 'success', 'browser_open must allow a fresh Browser Use session in the same run');
  assert.equal(sidecarSpawns, 1);
  assert.deepEqual(taskOutcome({ results: [failedNavigation, opened, { ...navigated, name: 'browser_use_navigate' }] }).unresolvedCallIds, [], 'successful same-tool retry resolves a known no-tab startup failure');
  console.log('PASS Browser Use canonical startup recovery and dispatched mutation uncertainty');
} finally {
  for (const runtime of runtimes) await runtime.close();
  for (const bridge of bridges) await bridge.close();
  db.close();
}
