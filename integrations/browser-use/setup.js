import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
if (process.platform === 'win32') throw new Error('Browser Use integration currently supports Linux/macOS only.');
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false });
  child.once('error', () => reject(new Error(`Cannot run ${command}. Install uv first: https://docs.astral.sh/uv/getting-started/installation/`)));
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} failed with exit code ${code}`)));
});
await run('uv', ['venv', '--python', '3.12', '--allow-existing', path.join(root, '.venv')]);
await run('uv', ['pip', 'install', '--python', path.join(root, '.venv/bin/python'), '-r', path.join(root, 'requirements.txt')]);
await run(path.join(root, '.venv/bin/python'), ['-c', 'from importlib.metadata import version; from browser_use import BrowserSession; assert version("browser-use") == "0.13.11"; print("Browser Use 0.13.11 ready")']);
console.log('Setup complete. Configure allowed domains and enable explicitly; see docs/browser-use.md. Chromium/Chrome must be installed separately.');
