const {app, BrowserWindow, nativeImage} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {desktopName, iconPath, getWindowIcon, configureDesktopBranding} = require('../../electron/branding.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-native-icon-'));
app.setPath('userData', root);
app.setName('sky');
configureDesktopBranding(app);
app.whenReady().then(async () => {
  let window;
  try {
    assert.equal(desktopName, 'io.sky.Desktop.desktop');
    const icon = nativeImage.createFromPath(iconPath);
    assert(!icon.isEmpty());
    assert.deepEqual(icon.getSize(), {width:512, height:512});
    const pixels = icon.toBitmap();
    assert.equal(pixels[3], 0, 'Outer corners must be transparent, not an opaque wrapper');
    assert.equal(pixels[((256 * 512 + 256) * 4) + 3], 255, 'Galaxy center remains opaque');
    assert.deepEqual(getWindowIcon().getSize(), {width:256, height:256});
    assert.equal(getWindowIcon().toBitmap()[3], 0, 'Native resizing preserves transparent corners');
    window = new BrowserWindow({width:200, height:200, show:true, icon:getWindowIcon()});
    await window.loadURL('data:text/html,<title>sky icon fixture</title>');
    const handle = window.getNativeWindowHandle();
    const id = '0x' + handle.readUInt32LE(0).toString(16);
    const identity = execFileSync('xprop', ['-id', id, 'WM_CLASS'], {encoding:'utf8'});
    assert.match(identity, /io\.sky\.Desktop/i, 'The OS window identity must match the installed launcher');
    const property = execFileSync('xprop', ['-id', id, '-f', '_NET_WM_ICON', '32c', '_NET_WM_ICON'], {encoding:'utf8', maxBuffer:32*1024*1024});
    assert.match(property, /= 256, 256,/, 'Electron must publish a native window icon to X11');
    assert.match(property, /= 256, 256, 0,/, 'Native icon must publish transparent corner pixels');
    console.log('PASS native desktop branding: PNG decodes, X11 icon published, window identity matches sky launcher');
  } finally {
    window?.destroy();
    fs.rmSync(root, {recursive:true, force:true});
  }
  app.quit();
}).catch(error => {console.error(error); app.exit(1);});
