import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {connectRuntime, stopRuntime, descriptors} from '../../cli/runtime_connection.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-cli-desktop-'));
process.env.OHMYT_RUNTIME_DIR = path.join(root, 'control');
const child = spawn('xvfb-run', ['-a', 'node_modules/.bin/electron', '--no-sandbox', '--ozone-platform=x11', 'test/cli/desktop_fixture.cjs'], {env: {...process.env, OHMYT_CLI_TEST_ROOT: root}, stdio: ['pipe', 'pipe', 'pipe']});
let output = '', errors = '', exited = false;
child.stdout.on('data', data => {output += data;}); child.stderr.on('data', data => {errors += data;});
const exit = new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', code => {exited = true; resolve(code);});});
try {
  for (let i = 0; i < 200 && !output.includes('FIXTURE_READY'); i++) {
    if (exited) throw new Error(errors);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert(output.includes('FIXTURE_READY'), errors);
  const {client, descriptor} = await connectRuntime({dataDir: path.join(root, 'desktop-data')}, {start: false});
  assert.equal(descriptor.ownerKind, 'desktop');
  assert.equal((await client.handshake()).capabilities.nativeBrowser, true);
  assert.equal((await fetch(client.base + '/runtime')).status, 401);
  await assert.rejects(stopRuntime(descriptor), /desktop/);
  child.stdin.write('shutdown\n');
  const code = await Promise.race([exit, new Promise((_, reject) => setTimeout(() => reject(new Error('Desktop cleanup timed out')), 10000).unref())]);
  assert.equal(code, 0, errors); assert.equal(descriptors().length, 0);
  console.log('PASS Electron utility runtime: shared token, CLI discovery/attach, owner fence and shutdown cleanup');
} finally {if (!exited) child.kill('SIGTERM'); fs.rmSync(root, {recursive: true, force: true});}
