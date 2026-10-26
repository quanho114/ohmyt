import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquireRuntimeControl} from '../server/runtime/control.js';

const dataDir = process.argv[2];
let control, daemon;
let stopping;
const stop = () => stopping ||= (async () => {
  try {await daemon?.stop();} finally {await control?.close();}
})();
try {
  control = await acquireRuntimeControl({dataDir});
  const {createDaemon} = await import('../server/index.js');
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  daemon = createDaemon({dataDir, workspaceRoot: appRoot, port: 0, authToken: control.token, hostEnabled: false});
  process.once('SIGTERM', () => void stop()); process.once('SIGINT', () => void stop());
  const {port} = await daemon.start();
  control.publish({endpoint: `http://127.0.0.1:${port}`, instanceId: daemon.apiServer.runtimeIdentity.instanceId, onStop: stop});
} catch (error) {
  console.error(error.message);
  await stop().catch(() => {});
  process.exitCode = 1;
}
