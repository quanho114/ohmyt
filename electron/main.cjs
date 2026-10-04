const { app, BrowserWindow, ipcMain, utilityProcess } = require('electron');
const http = require('http');
const path = require('path');

let mainWindow = null;
let localRuntime = null;
let runtimePort;
const runtimeToken = require('crypto').randomBytes(32).toString('hex');

const DEV_URL = 'http://localhost:5173';
const PROD_URL = 'http://localhost:3188';

function probe(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== null && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false, // Frameless: no OS title bar!
    backgroundColor: '#fafafa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      additionalArguments: [`--ohmyt-runtime-port=${runtimePort}`, `--ohmyt-runtime-token=${runtimeToken}`]
    }
  });

  mainWindow.loadURL(app.isPackaged ? `http://127.0.0.1:${runtimePort}` : DEV_URL);

  // Vite dev chưa chạy (trắng trang + ERR_CONNECTION_REFUSED) thì rớt về bản build ở :3188.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, validatedURL) => {
    if (validatedURL.startsWith(DEV_URL) && errorCode !== -3) {
      probe(`http://127.0.0.1:${runtimePort}`).then((ok) => {
        if (ok && mainWindow) mainWindow.loadURL(`http://127.0.0.1:${runtimePort}`);
      });
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });
}

// Apparmor / Ubuntu 24.04+ sandbox flag handled via CLI or appendSwitch
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  const fs = require('fs');
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = app.isPackaged ? path.join(app.getPath('userData'), 'runtime') : path.join(appRoot, 'data');
  const workspaceRoot = process.env.OHMYT_WORKSPACE || (app.isPackaged ? path.join(app.getPath('documents'), 'ohmyt') : appRoot);
  fs.mkdirSync(workspaceRoot, {recursive:true});
  await new Promise((resolve, reject) => {
    localRuntime = utilityProcess.fork(path.join(appRoot, 'server/desktop_runtime.js'), [], {
      env: {...process.env, OHMYT_LOCAL_RUNTIME_CONFIG: JSON.stringify({appRoot,dataDir,workspaceRoot,authToken:runtimeToken})},
      stdio: 'pipe', serviceName: 'ohmyt local runtime'
    });
    const timer = setTimeout(() => reject(new Error('Local runtime startup timed out')), 15000);
    localRuntime.on('message', message => { if(message.type === 'ready') {clearTimeout(timer);runtimePort=message.port;resolve();} });
    localRuntime.on('exit', code => { clearTimeout(timer); if(!runtimePort) reject(new Error(`Local runtime exited: ${code}`)); else if(mainWindow && !app.isQuitting) require('electron').dialog.showErrorBox('Dịch vụ cục bộ đã dừng', 'Khởi động lại ohmyt để tiếp tục.'); });
    localRuntime.stderr.on('data', chunk => process.stderr.write(chunk));
  });
  console.log(`ohmyt desktop local runtime ready at 127.0.0.1:${runtimePort}`);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => { require('electron').dialog.showErrorBox('Không thể khởi động dịch vụ cục bộ', error.message); app.quit(); });

app.on('before-quit', () => { app.isQuitting = true; localRuntime?.postMessage({type:'shutdown'}); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
