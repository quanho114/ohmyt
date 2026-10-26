import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

export function controlDirectory() {
  return process.env.OHMYT_RUNTIME_DIR || path.join(os.homedir(), '.ohmyt', 'runtimes');
}
export function defaultDataDirectory() {
  return path.join(os.homedir(), '.ohmyt', 'data');
}
export function profileKey(dataDir) {return createHash('sha256').update(fs.realpathSync(dataDir)).digest('hex').slice(0, 24);}

// An OS-owned loopback listener is the cooperative profile lock. Process death
// releases it without stale PID-file recovery races. Hash collisions fail closed.
export async function acquireRuntimeControl({dataDir, ownerKind = 'headless', directory = controlDirectory(), authToken = null}) {
  fs.mkdirSync(dataDir, {recursive: true, mode: 0o700});
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const profileId = profileKey(dataDir), token = authToken || randomBytes(32).toString('hex');
  const lockPort = 20000 + parseInt(profileId.slice(0, 8), 16) % 40000;
  let shutdown = null, published = null;
  const server = net.createServer(socket => {
    socket.setTimeout(2000, () => socket.destroy());
    let data = '';
    socket.on('error', () => {});
    socket.on('data', chunk => {
      data += chunk.toString();
      if (data.length > 1024) {socket.destroy(); return;}
      if (!data.includes('\n')) return;
      let request;
      try {request = JSON.parse(data.split('\n')[0]);} catch {socket.destroy(); return;}
      const candidate = Buffer.from(String(request.token || ''));
      const allowed = candidate.length === token.length && timingSafeEqual(candidate, Buffer.from(token));
      if (!allowed || request.instanceId !== published?.instanceId || request.action !== 'stop' || ownerKind !== 'headless') {socket.end('denied\n'); return;}
      socket.end('stopping\n');
      Promise.resolve().then(() => shutdown?.()).catch(error => console.error('Runtime shutdown failed:', error.message));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(lockPort, '127.0.0.1', resolve);
  }).catch(error => {throw new Error(`Runtime profile is already locked (or control port ${lockPort} is occupied): ${error.code}`);});
  const descriptorPath = path.join(directory, `${profileId}.json`);
  const tokenPath = path.join(directory, `${profileId}.token`);
  return {
    token, profileId,
    publish({endpoint, instanceId, onStop}) {
      shutdown = onStop;
      published = {version: 1, protocolVersion: 1, profileId, instanceId, pid: process.pid, dataDir: fs.realpathSync(dataDir), ownerKind, endpoint, controlPort: lockPort};
      fs.writeFileSync(tokenPath, token, {mode: 0o600}); fs.chmodSync(tokenPath, 0o600);
      const temp = `${descriptorPath}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(published), {mode: 0o600}); fs.renameSync(temp, descriptorPath);
      return published;
    },
    async close() {
      try {
        if (published && JSON.parse(fs.readFileSync(descriptorPath, 'utf8')).instanceId === published.instanceId) {
          fs.rmSync(descriptorPath, {force: true}); fs.rmSync(tokenPath, {force: true});
        }
      } catch (error) {if (error.code !== 'ENOENT') console.error('Runtime descriptor cleanup failed:', error.message);}
      await new Promise(resolve => server.close(resolve));
    }
  };
}
