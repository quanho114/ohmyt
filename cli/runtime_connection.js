import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {controlDirectory, defaultDataDirectory} from '../server/runtime/control.js';
import {Client} from './client.js';
import {CliError} from './args.js';

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function readToken(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || process.platform !== 'win32' && (stat.uid !== process.getuid() || stat.mode & 0o077)) throw new CliError('Token file must belong to you and have mode 0600');
  const token = fs.readFileSync(file, 'utf8').trim();
  if (!token || /[\r\n]/.test(token)) throw new CliError('Invalid runtime token file');
  return token;
}
export function descriptors() {
  const directory = controlDirectory();
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(file => file.endsWith('.json')).flatMap(file => {
    try {
      const descriptor = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      if (descriptor.version !== 1 || !/^[a-f0-9]{24}$/.test(descriptor.profileId)) return [];
      return [{...descriptor, tokenFile: path.join(directory, `${descriptor.profileId}.token`)}];
    } catch {return [];}
  });
}
async function attach(descriptor) {
  const client = new Client(descriptor.endpoint, readToken(descriptor.tokenFile), descriptor.instanceId);
  await client.handshake(); return {client, descriptor};
}
export async function connectRuntime(options, {start = true} = {}) {
  if (options.endpoint) {
    if (!options.tokenFile && !options.dev) throw new CliError('Use --token-file PATH, or --dev for an unauthenticated development daemon');
    const client = new Client(options.endpoint, options.tokenFile ? readToken(options.tokenFile) : '');
    await client.handshake(); return {client, descriptor: {ownerKind: 'external', endpoint: options.endpoint}};
  }
  const requested = options.dataDir ? path.resolve(options.dataDir) : null;
  const dataDir = requested ? (fs.existsSync(requested) ? fs.realpathSync(requested) : requested) : null;
  const candidates = descriptors().filter(item => !dataDir || item.dataDir === dataDir);
  const live = [];
  for (const descriptor of candidates) {
    try {live.push(await attach(descriptor));} catch (error) {
      // A live process with a bad handshake/auth must not trigger silent fallback.
      let alive = true;
      try {process.kill(descriptor.pid, 0);} catch (probe) {if (probe.code === 'ESRCH') alive = false;}
      if (alive) throw error;
    }
  }
  if (live.length > 1) throw new CliError('Multiple runtimes found. Select --data-dir PATH or --endpoint URL');
  if (live.length === 1) return live[0];
  if (!start) throw new CliError('No running ohmyt runtime', 4);
  const target = path.resolve(options.dataDir || defaultDataDirectory());
  fs.mkdirSync(target, {recursive: true, mode: 0o700});
  const logPath = path.join(target, 'daemon.log');
  const fd = fs.openSync(logPath, 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./daemon.js', import.meta.url)), target], {detached: true, stdio: ['ignore', fd, fd], env: {...process.env}});
  let spawnError;
  child.once('error', error => {spawnError = error;}); child.unref(); fs.closeSync(fd);
  for (let i = 0; i < 100; i++) {
    if (spawnError) throw new CliError(`Cannot start runtime: ${spawnError.message}`, 4);
    await delay(100);
    for (const descriptor of descriptors().filter(item => item.dataDir === fs.realpathSync(target))) {
      try {return await attach(descriptor);} catch {}
    }
  }
  throw new CliError(`Runtime startup failed. See ${logPath}`, 4);
}

export async function stopRuntime(descriptor) {
  if (descriptor.ownerKind !== 'headless') throw new CliError('This runtime belongs to the desktop app or an external process. Close its owner to stop it.');
  const token = readToken(descriptor.tokenFile);
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({host: '127.0.0.1', port: descriptor.controlPort});
    socket.setTimeout(5000, () => socket.destroy(new Error('Shutdown request timed out')));
    socket.once('error', reject);
    socket.once('connect', () => socket.write(JSON.stringify({action: 'stop', token, instanceId: descriptor.instanceId}) + '\n'));
    socket.once('data', data => {socket.end(); data.toString().startsWith('stopping') ? resolve() : reject(new CliError('Runtime rejected shutdown'));});
  });
  for (let i = 0; i < 100; i++) {
    if (!descriptors().some(item => item.instanceId === descriptor.instanceId)) return;
    await delay(100);
  }
  throw new CliError('Shutdown requested; cleanup has not finished', 4);
}
