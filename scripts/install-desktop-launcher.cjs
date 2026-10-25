const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {desktopName, iconPath} = require('../electron/branding.cjs');

if (process.platform !== 'linux') throw new Error('This launcher installer is for Linux.');
const root = path.resolve(__dirname, '..');
const electronPath = require('electron');
const quote = value => '"' + value.replace(/[\\"`$]/g, '\\$&').replace(/%/g, '%%') + '"';
const entryValue = value => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
const dataRoot = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const directory = path.join(dataRoot, 'applications');
// A content-addressed path prevents the desktop shell from reusing an old pixbuf.
const icon = fs.readFileSync(iconPath);
const version = crypto.createHash('sha256').update(icon).digest('hex').slice(0, 12);
const iconDirectory = path.join(dataRoot, 'icons', 'hicolor', '512x512', 'apps');
fs.mkdirSync(iconDirectory, {recursive:true});
const installedIcon = path.join(iconDirectory, `io.sky.Desktop-${version}.png`);
fs.writeFileSync(installedIcon, icon);
fs.mkdirSync(directory, {recursive:true});
const file = path.join(directory, desktopName);
fs.writeFileSync(file, `[Desktop Entry]
Version=1.0
Type=Application
Name=sky
Comment=Local-first AI workspace
Exec=${quote(electronPath)} --no-sandbox ${quote(path.join(root, 'electron', 'main.cjs'))}
Path=${entryValue(root)}
Icon=${entryValue(installedIcon)}
Terminal=false
Categories=Development;
StartupWMClass=io.sky.Desktop
StartupNotify=true
`);
console.log(`Installed sky launcher: ${file}`);
