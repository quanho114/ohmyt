const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {desktopName, iconPath} = require('../../electron/branding.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-launcher-'));
try {
  const env = {...process.env, XDG_DATA_HOME:root};
  const install = () => execFileSync(process.execPath, ['scripts/install-desktop-launcher.cjs'], {env});
  const source = fs.readFileSync(iconPath);
  const version = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
  const expected = path.join(root, 'icons/hicolor/512x512/apps', `io.sky.Desktop-${version}.png`);
  install();
  const entry = path.join(root, 'applications', desktopName);
  const contents = fs.readFileSync(entry, 'utf8');
  assert(contents.includes(`Icon=${expected}\n`), 'Launcher must use the content-addressed icon');
  assert(contents.includes('StartupWMClass=io.sky.Desktop\n'));
  assert.deepEqual(fs.readFileSync(expected), source);
  // A stale copy from an earlier installation must be repaired by reinstalling.
  fs.writeFileSync(expected, 'stale');
  install();
  assert.deepEqual(fs.readFileSync(expected), source);
  assert.equal(fs.readFileSync(entry, 'utf8'), contents);
  console.log('PASS sky launcher: content-addressed icon, preserved RGBA bytes, matching identity and repeatable installation');
} finally {fs.rmSync(root, {recursive:true, force:true});}
