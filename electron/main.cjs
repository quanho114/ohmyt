const { app, BrowserWindow, ipcMain, session, utilityProcess, clipboard } = require('electron');
const http = require('http');
const path = require('path');

const {IntegratedBrowser}=require('./browser.cjs');
app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy','disable_non_proxied_udp');
let integratedBrowser;
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
      backgroundThrottling: false,
      sandbox: false,
      additionalArguments: [`--ohmyt-runtime-port=${runtimePort}`, `--ohmyt-runtime-token=${runtimeToken}`]
    }
  });

  mainWindow.loadURL(app.isPackaged ? `http://127.0.0.1:${runtimePort}` : DEV_URL);

  const publishMaximized = () => {
    mainWindow.webContents.send('window-maximized-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', publishMaximized);
  mainWindow.on('unmaximize', publishMaximized);
  ipcMain.removeHandler('window-is-maximized');
  ipcMain.handle('window-is-maximized', event => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Unknown window');
    return mainWindow.isMaximized();
  });

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

  ipcMain.removeHandler('html-preview-open');
  ipcMain.handle('html-preview-open', async (event, content, chatId) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Unknown window');
    if (!integratedBrowser.embedded) throw new Error('Trình duyệt chưa sẵn sàng.');
    return integratedBrowser.openPreview(content,chatId);
  });
  ipcMain.removeHandler('clipboard-write-text');
  ipcMain.handle('clipboard-write-text', (event, text) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid clipboard sender');
    if (typeof text !== 'string' || text.length > 5000000) throw new Error('Invalid clipboard text');
    clipboard.writeText(text);
  });
  ipcMain.removeHandler('browser-open-url');
  ipcMain.handle('browser-open-url',(event,url)=>{if(event.sender!==mainWindow?.webContents)throw new Error('Unknown window');const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error('Invalid URL');if(!integratedBrowser.embedded)throw new Error('Trình duyệt chưa sẵn sàng.');return integratedBrowser.add(parsed.href);});
  ipcMain.removeHandler('browser-chat');
  ipcMain.handle('browser-chat',(event,chatId)=>{if(event.sender!==mainWindow?.webContents)throw Error('Unknown window');integratedBrowser.setChat(chatId);});
  ipcMain.removeHandler('browser-features');
  ipcMain.handle('browser-features',(event,features)=>{if(event.sender!==mainWindow?.webContents)throw new Error('Unknown window');if(!features || !['enabled','installed','canFiles'].every(key=>typeof features[key]==='boolean'))throw new Error('Invalid browser features');const next={enabled:features.enabled,installed:features.installed,canFiles:features.canFiles};if(JSON.stringify(integratedBrowser.features)!==JSON.stringify(next)){integratedBrowser.features=next;integratedBrowser.publish();}});
  ipcMain.removeHandler('browser-bounds');
  ipcMain.removeHandler('browser-resize-start');
  ipcMain.handle('browser-resize-start', (event, width) => {
    if(event.sender!==mainWindow?.webContents)throw new Error('Unknown window');
    if(!Number.isInteger(width) || width<1 || width>20000)throw new Error('Invalid browser width');
    return integratedBrowser.beginResize(width);
  });
  ipcMain.removeHandler('browser-resize-finish');
  ipcMain.handle('browser-resize-finish', event => {
    if(event.sender!==mainWindow?.webContents)throw new Error('Unknown window');
    return integratedBrowser.finishResize();
  });
  ipcMain.handle('browser-bounds',(event,bounds,paneOpen)=>{if(event.sender!==mainWindow?.webContents)throw new Error('Unknown window');if(bounds && !['x','y','width','height'].every(key=>Number.isFinite(bounds[key])&&bounds[key]>=0))throw new Error('Invalid bounds');if(paneOpen!==undefined && typeof paneOpen!=='boolean')throw new Error('Invalid pane state');integratedBrowser.attach(mainWindow,bounds,paneOpen); });
  ipcMain.removeHandler('browser-open');
  ipcMain.handle('browser-open', event=>{if(event.sender!==mainWindow?.webContents)throw new Error('Unknown window');integratedBrowser.open();});
  ipcMain.removeHandler('project-select-directory');
  ipcMain.removeHandler('project-open-directory');
  ipcMain.handle('project-open-directory', async (event, directory) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Unknown window');
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Đường dẫn thư mục không hợp lệ.');
    const fs = require('fs');
    if (!fs.statSync(directory).isDirectory()) throw new Error('Thư mục không tồn tại.');
    const error = await require('electron').shell.openPath(fs.realpathSync(directory));
    if (error) throw new Error(error);
  });
  ipcMain.handle('project-select-directory', async (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Unknown window');
    const result = await require('electron').dialog.showOpenDialog(mainWindow, { title: 'Chọn thư mục project', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
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
  ipcMain.on('app-restart', event => {
    if (event.sender !== mainWindow?.webContents) return;
    app.relaunch();
    app.quit();
  });
}

// Apparmor / Ubuntu 24.04+ sandbox flag handled via CLI or appendSwitch
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  const privateRoot=app.getPath('userData');require('node:fs').mkdirSync(privateRoot,{recursive:true,mode:0o700});if(process.platform!=='win32')require('node:fs').chmodSync(privateRoot,0o700);
  // Cho phép dùng micro để nhập giọng nói (mặc định Electron chặn).
  const isAppMicrophoneRequest = (webContents, permission, url) => {
    if (webContents !== mainWindow?.webContents || permission !== 'media') return false;
    try {
      const origin = new URL(url).origin;
      return origin === new URL(DEV_URL).origin || origin === `http://127.0.0.1:${runtimePort}`;
    } catch { return false; }
  };
  session.defaultSession.setPermissionCheckHandler((webContents, permission, origin, details) =>
    isAppMicrophoneRequest(webContents, permission, details.requestingUrl || origin) && details.mediaType !== 'video');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isAppMicrophoneRequest(webContents, permission, details.requestingUrl || webContents.getURL())
      && details.mediaTypes?.includes('audio') === true && !details.mediaTypes.includes('video'));
  });
  integratedBrowser=new IntegratedBrowser();
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
    localRuntime.on('message', message => { if(message.type==='browser-cancel')integratedBrowser.computer.stop(message.tabId); if(message.type==='browser-command'){integratedBrowser.command(message.action,message.args).then(result=>localRuntime.postMessage({type:'browser-result',id:message.id,result}),error=>localRuntime.postMessage({type:'browser-result',id:message.id,error:error.message}));} if(message.type === 'ready') {clearTimeout(timer);runtimePort=message.port;resolve();} });
    integratedBrowser.cdp.events=event=>localRuntime?.postMessage({type:'browser-cdp-event',event});
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
