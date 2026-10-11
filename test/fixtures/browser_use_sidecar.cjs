// Protocol fixture: real child process, no Python/Chromium dependency.
const readline = require('node:readline');
let snapshot = 0;
readline.createInterface({ input: process.stdin }).on('line', line => {
  const { id, action, args } = JSON.parse(line);
  if (args.url?.includes('/hang')) return;
  if (args.url?.includes('/crash')) return process.exit(9);
  if (args.url?.includes('/invalid')) return process.stdout.write('not-json\n');
  if (args.url?.includes('/huge')) return process.stdout.write('x'.repeat(1100000));
  if (args.url?.includes('/error')) return process.stdout.write(JSON.stringify({ id, error: 'private content must never be forwarded' }) + '\n');
  if (['type', 'click'].includes(action) && args.snapshotId !== String(snapshot)) return process.stdout.write(JSON.stringify({ id, error: 'stale' }) + '\n');
  snapshot++;
  process.stdout.write(JSON.stringify({ id, result: { success: true, url: args.url || 'https://example.com/', snapshotId: String(snapshot), dom: '[1] input [2] button', index: args.index, root: process.env.OHMYT_BU_ROOT } }) + '\n');
});
