import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pty from 'node-pty';
import {connectRuntime, stopRuntime} from '../../cli/runtime_connection.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-cli-zero-args-'));
const project = path.join(root, 'project');
fs.mkdirSync(project);
process.env.OHMYT_RUNTIME_DIR = path.join(root, 'control');
let connection, terminal, exited = false;
try {
  connection = await connectRuntime({dataDir: path.join(root, 'data')});
  // No cwd/endpoint/token/session flags: exactly the executable a global npm
  // bin would invoke, from a project outside the installed package directory.
  terminal = pty.spawn(process.execPath, [fileURLToPath(new URL('../../bin/ohmyt.js', import.meta.url))], {cwd: project, cols: 80, rows: 24, env: {...process.env, TERM: 'xterm-256color'}});
  let output = '';
  terminal.onData(data => {output += data;});
  const exit = new Promise(resolve => terminal.onExit(event => {exited = true; resolve(event);}));
  const wait = async text => {
    for (let i = 0; i < 200; i++) {
      if (output.includes(text)) return;
      if (exited) throw new Error('Early CLI exit: ' + output);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Missing terminal output: ' + text);
  };
  await wait(`Register project ${fs.realpathSync(project)}`);
  terminal.write('y\r'); await wait('Session sess_');
  const projects = await connection.client.request('/projects');
  assert.equal(projects.find(item => item.path === fs.realpathSync(project))?.name, 'project');
  terminal.write('/exit\r');
  const result = await Promise.race([exit, new Promise((_, reject) => setTimeout(() => reject(new Error('CLI did not exit')), 5000).unref())]);
  assert.equal(result.exitCode, 0);
  console.log('PASS zero-argument CLI: cwd project, runtime discovery, first-use registration and chat without desktop');
} finally {
  if (terminal && !exited) terminal.kill();
  if (connection) await stopRuntime(connection.descriptor);
  fs.rmSync(root, {recursive: true, force: true});
}
