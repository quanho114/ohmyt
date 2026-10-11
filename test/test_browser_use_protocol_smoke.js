import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { BrowserEgress } from '../server/browser_egress.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { BrowserUseRuntime, browserUseConfig } from '../server/browser_use.js';

const fixture = fileURLToPath(new URL('./fixtures/browser_use_real.py', import.meta.url));
let slowStarted;
const slowRequest = new Promise(resolve => { slowStarted = resolve; });
const server = http.createServer((req, res) => {
  if (req.url === '/slow') { slowStarted(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><title>Protocol fixture</title><h1>Ready</h1><input placeholder="Message"><button onclick="document.querySelector(\'h1\').textContent=\'Saved \'+document.querySelector(\'input\').value">Save</button>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const config = { ...browserUseConfig(), mode: 'standalone', enabled: true, domains: ['fixture.example.test'], headless: true };
let processId;
const runtime = new BrowserUseRuntime(config, { createEgress:()=>new BrowserEgress({lookup:async host=>host==='fixture.example.test'?[{address:'93.184.216.34',family:4}]:[{address:'127.0.0.1',family:4}],connect:options=>net.connect({...options,host:'127.0.0.1',hostname:'127.0.0.1'})}),spawnProcess: (python, _args, options) => {
  const child = spawn(python, ['-u', fixture], options);
  processId = child.pid;
  return child;
} });
const context = { runId: 'real-protocol-smoke', sessionId: 'test', scopeId: 'standalone:test' };
let root;
try {
  const first = await runtime.execute('navigate', { url: `http://fixture.example.test:${server.address().port}/` }, context);
  root = runtime.runs.get(context.runId).root;
  assert.ok(first.dom.includes('Ready'), JSON.stringify(first).slice(0, 1000));
  const input = first.elements.find(element => element.tag === 'input');
  assert.ok(input);
  const typed = await runtime.execute('type', { index: input.index, snapshotId: first.snapshotId, text: 'protocol' }, context);
  const button = typed.elements.find(element => element.tag === 'button');
  const clicked = await runtime.execute('click', { index: button.index, snapshotId: typed.snapshotId }, context);
  assert.ok(clicked.dom.includes('Saved protocol'));
  const controller = new AbortController();
  const stopped = runtime.execute('navigate', { url: `http://fixture.example.test:${server.address().port}/slow` }, { ...context, signal: controller.signal });
  const stoppedCheck = assert.rejects(stopped, /stopped/);
  await Promise.race([slowRequest, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Slow fixture not reached')), 15000); timer.unref(); })]);
  controller.abort();
  await stoppedCheck;
  await runtime.releaseRun(context.runId);
  assert.equal(fs.existsSync(root), false);
  assert.equal(runtime.runs.size, 0);
  assert.throws(() => process.kill(processId, 0), /ESRCH/);
  console.log('PASS real Node/Python/Browser Use/Chromium protocol: navigate, DOM, type, click, verified result, in-flight cancellation and process/profile cleanup');
} finally {
  await runtime.close();
  await new Promise(resolve => server.close(resolve));
}
