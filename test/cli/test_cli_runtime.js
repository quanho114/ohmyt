import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {acquireRuntimeControl} from '../../server/runtime/control.js';
import {connectRuntime, stopRuntime, readToken} from '../../cli/runtime_connection.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-cli-runtime-'));
process.env.OHMYT_RUNTIME_DIR = path.join(root, 'control');
let connection;
try {
  const dataDir = path.join(root, 'data');
  const lock = await acquireRuntimeControl({dataDir});
  try {await assert.rejects(acquireRuntimeControl({dataDir}), /locked/);} finally {await lock.close();}
  const concurrent = await Promise.all([connectRuntime({dataDir}), connectRuntime({dataDir})]);
  connection = concurrent[0];
  assert.equal(concurrent[0].descriptor.instanceId, concurrent[1].descriptor.instanceId, 'Concurrent bootstrap must share one owner');
  assert.equal(connection.descriptor.ownerKind, 'headless');
  const same = await connectRuntime({dataDir}, {start: false});
  assert.equal(same.descriptor.instanceId, connection.descriptor.instanceId);
  assert.equal((await same.client.handshake()).instanceId, connection.descriptor.instanceId);
  const unauthenticated = await fetch(same.client.base + '/runtime');
  assert.equal(unauthenticated.status, 401);
  if (process.platform !== 'win32') {
    fs.chmodSync(connection.descriptor.tokenFile, 0o644);
    assert.throws(() => readToken(connection.descriptor.tokenFile), /0600/);
    fs.chmodSync(connection.descriptor.tokenFile, 0o600);
  }
  await assert.rejects(stopRuntime({...connection.descriptor, ownerKind: 'desktop'}), /desktop/);
  await stopRuntime(connection.descriptor); connection = null;
  await assert.rejects(connectRuntime({dataDir}, {start: false}), /No running/);
  console.log('PASS CLI lifecycle: profile lock, auto-start, auth, token permissions, attach, stop and cleanup');
} finally {
  if (connection) await stopRuntime(connection.descriptor).catch(() => {});
  fs.rmSync(root, {recursive: true, force: true});
}
