import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {harnessFixture} from '../harness_fixture.js';

let mode = 'answer';
let effects = 0;
const daemon = await harnessFixture({tools: [{name: 'fixture_cli_effect', scopes: ['project'], parameters: {type: 'object', properties: {}, additionalProperties: false}, execute: () => {effects++; return {ok: true};}}], stream: async options => {
  if (mode === 'question' && !options.messages.some(message => message.role === 'tool')) options.onToolCall({id: 'ask', name: 'request_user_input', arguments: {questions: [{id: 'name', question: 'Your name?'}]}});
  else if (mode === 'permission' && !options.messages.some(message => message.role === 'tool')) options.onToolCall({id: 'effect', name: 'fixture_cli_effect', arguments: {}});
  else if (mode === 'slow') {options.onChunk('Waiting'); await new Promise(resolve => options.signal.aborted ? resolve() : options.signal.addEventListener('abort', resolve, {once: true}));}
  else options.onChunk('Xin chào 👋 từ CLI');
  return {completed: true};
}});
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-cli-project-'));
try {
  const {port} = await daemon.start();
  const project = daemon.db.addProject('cli-project', 'CLI project', root);
  const session = id => {daemon.db.createSession(id, 'fixture', 'CLI test', project.id); daemon.db.db.prepare("UPDATE sessions SET approval_mode='ask' WHERE id=?").run(id);};
  const baseArgs = ['bin/ohmyt.js', 'exec', '--endpoint', `http://127.0.0.1:${port}`, '--dev', '-C', root];
  const invoke = (args, input = '', interrupt = false) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...baseArgs, ...args], {stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    let sentInterrupt = false;
    child.stdout.on('data', data => {stdout += data; if (interrupt && !sentInterrupt && stdout.includes('run.started')) {sentInterrupt = true; child.kill('SIGINT');}}); child.stderr.on('data', data => {stderr += data;});
    child.on('error', reject); child.on('close', code => {clearTimeout(timer); resolve({code, stdout, stderr});});
    const timer = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('CLI timeout: ' + stderr));}, 20000);
    child.stdin.end(input);
  });
  session('cli-text');
  const text = await invoke(['--session', 'cli-text', 'Hello']);
  assert.equal(text.code, 0, text.stderr); assert.equal(text.stdout, 'Xin chào 👋 từ CLI\n');
  session('cli-json');
  const json = await invoke(['--session', 'cli-json', '--json', 'Hello']);
  assert.equal(json.code, 0, json.stderr);
  const events = json.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert(events.every(event => event.v === 1));
  assert.equal(events.at(-1).type, 'run.completed');
  assert.equal(events.at(-1).answer, 'Xin chào 👋 từ CLI');
  session('cli-stdin');
  assert.equal((await invoke(['--session', 'cli-stdin', '-'], 'Piped prompt')).code, 0);
  const mismatch = await invoke(['--session', 'cli-text', '-C', os.tmpdir(), 'Wrong scope']);
  assert.equal(mismatch.code, 2); assert.match(mismatch.stderr, /project/);
  mode = 'question'; session('cli-question');
  const question = await invoke(['--session', 'cli-question', '--json', 'Ask me']);
  assert.equal(question.code, 3, question.stderr);
  assert(question.stdout.includes('interaction.required'));
  assert.equal(daemon.harness.userInputs.list('cli-question').length, 0);
  assert.equal(daemon.harness.agents.list().filter(handle => handle.sessionId === 'cli-question').length, 0);
  mode = 'permission'; session('cli-permission');
  daemon.permissions.evaluate = name => ({action: name === 'fixture_cli_effect' ? 'ASK' : 'ALLOW'});
  const permission = await invoke(['--session', 'cli-permission', '--json', 'Perform action']);
  assert.equal(permission.code, 3, permission.stderr); assert.equal(effects, 0);
  assert.equal(daemon.permissions.getPendingRequests().length, 0);
  mode = 'slow'; session('cli-signal');
  const cancelled = await invoke(['--session', 'cli-signal', '--json', 'Wait'], '', true);
  assert.equal(cancelled.code, 130, cancelled.stderr);
  assert.equal(daemon.harness.agents.list().filter(handle => handle.sessionId === 'cli-signal').length, 0);
  console.log('PASS CLI process: text, JSONL, stdin, scope mismatch, required input cancels and drains');
} finally {await daemon.closeFixture(); fs.rmSync(root, {recursive: true, force: true});}
