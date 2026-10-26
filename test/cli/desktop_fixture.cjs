const {app, utilityProcess} = require('electron');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const root = process.env.OHMYT_CLI_TEST_ROOT;
  const runtime = utilityProcess.fork(path.resolve('server/desktop_runtime.js'), [], {
    env: {...process.env, OHMYT_LOCAL_RUNTIME_CONFIG: JSON.stringify({appRoot: process.cwd(), dataDir: path.join(root, 'desktop-data'), workspaceRoot: root, authToken: randomBytes(32).toString('hex')})},
    stdio: 'pipe'
  });
  runtime.stderr.on('data', chunk => process.stderr.write(chunk));
  runtime.on('message', message => {if (message.type === 'ready') process.stdout.write('FIXTURE_READY\n');});
  runtime.on('exit', code => {app.exit(code || 0);});
  process.stdin.on('data', () => runtime.postMessage({type: 'shutdown'}));
}).catch(error => {console.error(error); app.exit(1);});
