const path = require('node:path');

const desktopName = 'io.sky.Desktop.desktop';
const iconPath = path.join(__dirname, '..', 'public', 'sky-icon.png');

function getWindowIcon() {
  // Bound native icon dimensions while preserving the original artwork on disk.
  const {nativeImage} = require('electron');
  return nativeImage.createFromPath(iconPath).resize({width:256, height:256});
}

function configureDesktopBranding(app) {
  if (process.platform === 'linux') app.setDesktopName(desktopName);
  if (process.platform === 'win32') app.setAppUserModelId('io.sky.Desktop');
  app.whenReady().then(() => app.dock?.setIcon(iconPath));
}

module.exports = {desktopName, iconPath, getWindowIcon, configureDesktopBranding};
