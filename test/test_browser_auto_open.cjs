const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-auto-open-'));
app.setPath('userData',profile);
const {IntegratedBrowser}=require('../electron/browser.cjs');
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../server/index.js');
 const {AgentLoop}=await import('../server/agent_loop.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,workspaceRoot:process.cwd()});
 const browser=new IntegratedBrowser();
 const site=http.createServer((_req,res)=>res.end('<title>Automatic open fixture</title><button>Ready</button>'));
 await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${site.address().port}/`;
 const agent=daemon.db.getAgents()[0].id;
 const getAgent=daemon.db.getAgent.bind(daemon.db);
 daemon.db.getAgent=id=>({...getAgent(id),policy_json:JSON.stringify({execution:'LOCAL_ONLY'})});
 daemon.db.createSession('auto-chat',agent,'Automatic browser');
 daemon.db.db.prepare("UPDATE sessions SET approval_mode='full' WHERE id='auto-chat'").run();
 // Desktop registers native tools after attaching its runtime transport.
 assert.equal(daemon.tools.get('browser_open'),undefined);
 daemon.browserBridge.nativeCommand=(action,args)=>browser.command(action,args);
 daemon.browserBridge.registerNativeTools(daemon.tools);
 const {port}=await daemon.start();
 const host=new BrowserWindow({width:1200,height:800,show:true,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),additionalArguments:[`--ohmyt-runtime-port=${port}`]}});
 ipcMain.handle('browser-chat',(_e,id)=>browser.setChat(id));
 ipcMain.handle('browser-bounds',(_e,bounds,open)=>browser.attach(host,bounds,open));
 ipcMain.handle('browser-features',()=>{});
 ipcMain.handle('window-is-maximized',()=>false);
 const waitFor=async(check)=>{for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for browser UI');};
 try {
  await host.loadURL(`http://127.0.0.1:${port}/#session/auto-chat`);
  await waitFor(()=>browser.embedded && browser.chatId==='auto-chat');
  assert.equal(browser.tabs.size,0);
  assert.equal(await host.webContents.executeJavaScript("document.querySelector('.integrated-browser-pane').dataset.open"),'false');
  let turns=0,tabId;const events=[];
  const loop=new AgentLoop({db:daemon.db,tools:daemon.tools,permissions:daemon.permissions,skills:{},llm:{streamChat:async opts=>{
   turns++;
   if(turns===1){
    assert(opts.tools.some(t=>t.name==='browser_open'));
    assert(opts.messages[0].content.includes('Use browser_open'));
    opts.onToolCall({id:'open',name:'browser_open',arguments:{url}});
   }else if(turns===2){
    tabId=browser.active;
    assert.equal(browser.tabs.get(tabId).webContents.getTitle(),'Automatic open fixture');
    opts.onToolCall({id:'read',name:'browser_read',arguments:{tabId}});
   }else opts.onChunk('Opened and verified the page.');
   return {completed:true};
  }}});
  loop.on('event',event=>events.push(event));
  await loop.run({runId:'auto-open-run',sessionId:'auto-chat',prompt:'Open the fixture website and read it'});
  assert.equal(turns,3);
  assert(events.some(e=>e.type==='ToolCallCompleted' && e.payload.toolName==='browser_open' && e.payload.success));
  assert(events.some(e=>e.type==='ToolCallCompleted' && e.payload.toolName==='browser_read' && e.payload.success));
  await waitFor(async()=>browser.paneOpen && browser.tabs.get(tabId).getVisible() && await host.webContents.executeJavaScript("document.querySelector('.integrated-browser-pane').dataset.open==='true'"));
  assert(browser.tabs.get(tabId).getBounds().width>200);
  assert.equal(browser.tabs.size,1,'auto opening must not create an extra Google tab');
  await assert.rejects(browser.command('open',{chatId:'other-chat',url}),/cuộc trò chuyện/);
  await assert.rejects(daemon.browserBridge.execute('auto-chat','open',{url:'file:///etc/passwd'}),/HTTP/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(daemon.browserBridge.execute('auto-chat','open',{url},controller.signal),/Đã dừng/);
  assert.equal(browser.tabs.size,1);
  // An explicit navigation deny must also block opening a new tab.
  daemon.db.setPolicy('browser_navigate:*','DENY');
  assert.equal(daemon.permissions.evaluate('browser_open',url,{scopeId:'standalone:auto-chat',approvalMode:'full'}).action,'DENY');
  assert.notEqual(daemon.permissions.evaluate('browser_open',url,{projectId:'p',scopeId:'project:p',approvalMode:'full'}).matchedPolicy,'project-boundary');
  console.log('PASS automatic browser open: real agent loop from empty chat, native registration, visible React pane, page read, chat isolation, invalid URL, abort and navigation denial');
 }finally{
  host.destroy();await daemon.stop();await new Promise(resolve=>site.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true});
 }
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
