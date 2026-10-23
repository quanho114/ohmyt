import fs from 'node:fs';
import { spawn } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function expandScript(scriptName, out = [], depth = 0) {
  if (depth > 6) throw new Error(`Recursive script chain at ${scriptName}`);
  const raw = pkg.scripts[scriptName];
  if (!raw) throw new Error(`Unknown npm script: ${scriptName}`);
  for (const part of raw.split('&&').map((s) => s.trim()).filter(Boolean)) {
    const nodeMatch = part.match(/^node\s+(test\/[\w./-]+)$/);
    if (nodeMatch) {
      out.push({ suite: scriptName, file: nodeMatch[1] });
      continue;
    }
    const npmMatch = part.match(/^npm\s+run\s+([\w:-]+)$/);
    if (npmMatch) {
      expandScript(npmMatch[1], out, depth + 1);
      continue;
    }
    throw new Error(`Unsupported command in ${scriptName}: ${part}`);
  }
  return out;
}

const SUITE_MAP = {
  all: 'test',
  ci: 'test',
  core: 'test',
  harness: 'test:harness',
  'harness:upgrade': 'test:harness:upgrade',
  goal: 'test:goal',
  tasks: 'test:tasks',
  sandbox: 'test:sandbox',
  approvals: 'test:approvals',
  'web-search': 'test:web-search'
};

function runSingleTest(file, timeoutMs = 90_000) {
  const { promise, resolve } = Promise.withResolvers();
  const started = Date.now();
  let output = '';
  const child = spawn(process.execPath, [file], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });

  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-12_000);
  });
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-12_000);
  });

  const timer = setTimeout(() => {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch {}
    resolve({ file, passed: false, durationMs: Date.now() - started, output: output + '\n[TIMEOUT]' });
  }, timeoutMs);

  child.once('close', (code) => {
    clearTimeout(timer);
    const failedPattern = /AssertionError|test suite failed|UncaughtException/i.test(output);
    const passed = code === 0 && !failedPattern;
    resolve({ file, passed, durationMs: Date.now() - started, output });
  });

  return promise;
}

const target = process.argv[2] || 'all';
const scriptKey = SUITE_MAP[target] || target;
const entries = expandScript(scriptKey);

console.log(`▶ Running suite "${target}" (${entries.length} test files)...`);
const suiteStart = Date.now();
let failedCount = 0;

for (const [idx, entry] of entries.entries()) {
  const label = `[${String(idx + 1).padStart(2, '0')}/${String(entries.length).padStart(2, '0')}]`;
  const res = await runSingleTest(entry.file);
  const status = res.passed ? 'PASS' : 'FAIL';
  console.log(`${status} ${label} ${entry.file} (${res.durationMs}ms)`);
  if (!res.passed) {
    failedCount++;
    console.error(res.output.trim().split('\n').slice(-25).join('\n'));
    if (process.env.FAIL_FAST === '1') break;
  }
}

const totalMs = Date.now() - suiteStart;
console.log(`\nSummary: ${entries.length - failedCount}/${entries.length} passed in ${(totalMs / 1000).toFixed(1)}s`);
if (failedCount > 0) process.exit(1);
