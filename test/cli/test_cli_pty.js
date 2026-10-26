import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pty from 'node-pty';
import {harnessFixture} from '../harness_fixture.js';

let askApproval = false, effects = 0;
const daemon = await harnessFixture({tools: [{name: 'fixture_pty_action', scopes: ['project'], parameters: {type: 'object', properties: {}, additionalProperties: false}, execute: () => {effects++; return {ok: true};}}], stream: async options => {
  if (askApproval && !options.messages.some(message => message.role === 'tool')) options.onToolCall({id: 'effect', name: 'fixture_pty_action', arguments: {}});
  else options.onChunk('PTY answer tiếng Việt 👋');
  return {completed: true};
}});
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-cli-pty-'));
let terminal;
try {
  const {port} = await daemon.start();
  daemon.db.addProject('pty-project', 'PTY project', root);
  daemon.db.createSession('pty-session', 'fixture', 'PTY fixture', 'pty-project');
  terminal = pty.spawn(process.execPath, ['bin/ohmyt.js', '--endpoint', `http://127.0.0.1:${port}`, '--dev', '-C', root, '--session', 'pty-session'], {cwd: process.cwd(), cols: 80, rows: 24, env: {...process.env, TERM: 'xterm-256color'}});
  let output = '', exited;
  terminal.onData(data => {output += data;});
  const exit = new Promise(resolve => terminal.onExit(event => {exited = event; resolve(event);}));
  const wait = async text => {
    for (let i = 0; i < 200; i++) {if (output.includes(text)) return; if (exited) throw new Error('Early terminal exit: ' + output); await new Promise(resolve => setTimeout(resolve, 25));}
    throw new Error('Missing PTY output ' + text + ': ' + output.slice(-1500));
  };
  await wait('Session pty-session');
  terminal.write('\x1b[200~hello\nsecond line\x1b[201~');
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(daemon.db.db.prepare('SELECT COUNT(*) AS n FROM runs WHERE session_id=?').get('pty-session').n, 0);
  terminal.write('\r'); await wait('PTY answer tiếng Việt 👋'); await wait('completed · completed');
  terminal.resize(50, 20); terminal.write('/exit\r');
  const result = await Promise.race([exit, new Promise((_, reject) => setTimeout(() => reject(new Error('PTY failed to exit')), 5000).unref())]);
  assert.equal(result.exitCode, 0); assert(output.includes('\x1b[?2004l'));
  assert.equal(daemon.db.getMessages('pty-session')[0].content, 'hello\nsecond line');
  askApproval = true;
  daemon.permissions.evaluate = name => ({action: name === 'fixture_pty_action' ? 'ASK' : 'ALLOW'});
  daemon.db.createSession('pty-approval', 'fixture', 'PTY approval', 'pty-project');
  daemon.db.db.prepare("UPDATE sessions SET approval_mode='ask' WHERE id=?").run('pty-approval');
  output = ''; exited = null;
  terminal = pty.spawn(process.execPath, ['bin/ohmyt.js', '--endpoint', `http://127.0.0.1:${port}`, '--dev', '-C', root, '--session', 'pty-approval'], {cwd: process.cwd(), cols: 80, rows: 24, env: {...process.env, TERM: 'xterm-256color'}});
  terminal.onData(data => {output += data;});
  const secondExit = new Promise(resolve => terminal.onExit(event => {exited = event; resolve(event);}));
  await wait('Session pty-approval');
  terminal.write('/model\r'); await wait('Choose a model'); terminal.write('fixture\r'); await wait('Model: fixture/fixture');
  terminal.write('/permissions\r'); await wait('Approval mode for next run'); terminal.write('\r'); await wait('Approval mode: ask');
  terminal.write('Run action\r');
  await wait('Allow this action once?');
  const request = daemon.permissions.getPendingRequests()[0];
  assert(request); assert.equal(effects, 0);
  // Simulate the desktop resolving an approval while the terminal dialog is open.
  daemon.permissions.resolveApproval(request.requestId, 'ALLOW_ONCE');
  await wait('completed ·'); assert.equal(effects, 1);
  terminal.write('/resume\r'); await wait('Resume a project chat'); terminal.write('PTY fixture\r'); await wait('Session pty-session');
  const beforeFork = daemon.db.getSessions().length;
  terminal.write('/fork\r');
  for (let i = 0; i < 100 && daemon.db.getSessions().length === beforeFork; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const fork = daemon.db.getSessions().find(item => item.title === 'Terminal fork');
  assert(fork); assert.equal(fork.project_id, 'pty-project');
  await wait(`Session ${fork.id}`);
  terminal.write('/exit\r');
  assert.equal((await Promise.race([secondExit, new Promise((_, reject) => setTimeout(() => reject(new Error('Approval terminal stuck')), 5000).unref())])).exitCode, 0);
  console.log('PASS real PTY: chat, bracketed paste without accidental send, Unicode stream, resize and terminal restoration');
} finally {if (terminal) try {terminal.kill();} catch {} await daemon.closeFixture(); fs.rmSync(root, {recursive: true, force: true});}
