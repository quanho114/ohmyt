const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
const {IntegratedBrowser}=require('../electron/browser.cjs');
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,workspaceRoot:process.cwd()});
 const agent=daemon.db.getAgents()[0].id;
 daemon.db.createSession('preview-chat',agent,'Preview test');
 daemon.db.addMessage('preview-message','preview-chat','agent','```html\n<!doctype html><title>Game preview</title><canvas id="game"></canvas><script>const c=document.querySelector("canvas").getContext("2d");c.fillStyle="purple";c.fillRect(0,0,100,100);</script>\n```');
 const {port}=await daemon.start();
 const browser=new IntegratedBrowser();
 const host=new BrowserWindow({width:1200,height:800,show:true,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),backgroundThrottling:false,additionalArguments:[`--ohmyt-runtime-port=${port}`]}});
 ipcMain.handle('browser-chat',(_e,id)=>browser.setChat(id));
 ipcMain.handle('browser-bounds',(_e,bounds,open)=>browser.attach(host,bounds,open));
 ipcMain.handle('browser-features',()=>{});
 ipcMain.handle('html-preview-open',(_e,content,chatId)=>browser.openPreview(content,chatId));
 try {
  await host.loadURL(`http://127.0.0.1:${port}/#session/preview-chat`);
  for(let attempt=0;attempt<150;attempt++){
   if(browser.chatId==='preview-chat' && await host.webContents.executeJavaScript("Boolean(document.querySelector('.html-artifact'))"))break;
   await new Promise(r=>setTimeout(r,20));
  }
  await host.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.html-artifact button')].find(b=>b.textContent==='Mở Chrome');if(!b)throw Error('Missing preview button');b.click();})()`);
  for(let attempt=0;attempt<150;attempt++){
   const active=browser.tabs.get(browser.active);
   if(active?.browserPreview && active.getBounds().width>200 && active.webContents.getTitle()==='Game preview')break;
   await new Promise(r=>setTimeout(r,20));
  }
  assert(browser.active!==null,'preview tab must be active');
  const view=browser.tabs.get(browser.active);
  assert.equal(view.browserPreview,true);
  assert.equal(view.chatId,'preview-chat');
  assert.equal(view.getVisible(),true);
  assert(view.getBounds().width>200);
  assert.equal(view.webContents.getTitle(),'Game preview');
  assert.deepEqual(await view.webContents.executeJavaScript('Array.from(document.querySelector("canvas").getContext("2d").getImageData(10,10,1,1).data)'),[128,0,128,255]);
  await new Promise(r=>setTimeout(r,400));
  assert.equal(await host.webContents.executeJavaScript("getComputedStyle(document.querySelector('.sidebar-panel')).transitionDuration"),'0s');
  await view.webContents.executeJavaScript("document.body.style.background='rgb(32,100,180)';document.documentElement.style.background='rgb(32,100,180)'");
  let resizeWrites=0;
  const originalBounds=view.setBounds.bind(view);
  view.setBounds=bounds=>{resizeWrites++;return originalBounds(bounds);};
  browser.layout();browser.layout();
  assert.equal(resizeWrites,0,'unchanged layouts must not resize native content');
  const edges=[],layouts=[];
  const fixedFrame=browser.frame.getBounds();
  const fixedControls=browser.controls.getBounds();
  const fixedPage=view.getBounds();
  let containerWrites=0,toolbarWrites=0;
  const originalFrameBounds=browser.frame.setBounds.bind(browser.frame);
  const originalToolbarBounds=browser.controls.setBounds.bind(browser.controls);
  browser.frame.setBounds=b=>{containerWrites++;return originalFrameBounds(b);};
  browser.controls.setBounds=b=>{toolbarWrites++;return originalToolbarBounds(b);};
  let visibilityWrites=0;
  const originalVisible=view.setVisible.bind(view);
  view.setVisible=(visible)=>{visibilityWrites++;return originalVisible(visible);};
  const originalAttach=browser.attach.bind(browser);
  browser.attach=(...args)=>{const result=originalAttach(...args);if(browser.bounds){const b=browser.controls.getBounds();edges.push(browser.frame.getBounds().x+b.width);layouts.push({controls:b,page:view.getBounds()});}return result;};
  for(const title of ['Thu gọn thanh bên','Mở thanh bên','Thu gọn thanh bên','Mở thanh bên']){
   const start=layouts.length;
   await host.webContents.executeJavaScript(`(()=>{const button=document.querySelector('button[title="${title}"]');if(!button)throw Error('Missing sidebar toggle');button.click();})()`);
   for(let frame=0;frame<8;frame++){
    const shot=await view.webContents.capturePage();
    const pixel=shot.toBitmap();
    assert.deepEqual([...pixel.subarray(pixel.length-4,pixel.length-1)],[180,100,32],'browser content must remain painted during sidebar toggle');
    await new Promise(r=>setTimeout(r,20));
   }
   await new Promise(r=>setTimeout(r,150));
   const changes=layouts.slice(start);
   const sizes=new Set(changes.map(item=>JSON.stringify(item.controls)));
   assert.equal(sizes.size,0,'sidebar must not send any native browser layout updates');
   assert.deepEqual(browser.frame.getBounds(),fixedFrame);
   assert.deepEqual(browser.controls.getBounds(),fixedControls);
   assert.deepEqual(view.getBounds(),fixedPage);
   for(const {controls,page} of changes){
    assert.equal(controls.x,page.x);
    assert.equal(controls.width,page.width);
    assert.equal(page.y,controls.y+84);
   }
  }
  assert.equal(resizeWrites,0,'sidebar must not resize the web page');
  assert.equal(toolbarWrites,0,'sidebar must not resize the toolbar');
  assert.equal(containerWrites,0,'sidebar must not move or resize the native frame');
  browser.frame.setBounds=originalFrameBounds;
  browser.controls.setBounds=originalToolbarBounds;
  assert.equal(visibilityWrites,0,'resizing must not show/hide an already visible Chromium view');
  view.setVisible=originalVisible;
  view.setBounds=originalBounds;
  assert.equal(edges.length,0,'no native relayouts while toggling sidebar');
  browser.attach=originalAttach;
  for(const width of [900,1440]){
   host.setContentSize(width,800);
   await new Promise(r=>setTimeout(r,250));
   const before=browser.frame.getBounds();
   for(const title of ['Thu gọn thanh bên','Mở thanh bên']){
    await host.webContents.executeJavaScript(`document.querySelector('button[title="${title}"]').click()`);
    await new Promise(r=>setTimeout(r,250));
    assert.deepEqual(browser.frame.getBounds(),before,`native browser must stay fixed at window width ${width}`);
   }
  }
  const beforeToggle=browser.frame.getBounds();
  const togglePositions=[];
  const toggleSet=browser.frame.setBounds.bind(browser.frame);
  browser.frame.setBounds=b=>{togglePositions.push({...b});return toggleSet(b);};
  const pageBeforeToggle=view.getBounds();
  let togglePageResizes=0;
  view.setBounds=b=>{togglePageResizes++;return originalBounds(b);};
  const movementLatencies=[];
  for(const visible of [false,true,false,true]){
   const startPositions=togglePositions.length;
   const samples=await host.webContents.executeJavaScript(`(()=>{
    const chat=document.querySelector('.chat-themed-stage');
    const pane=document.querySelector('.integrated-browser-pane');
    const surface=document.querySelector('.integrated-browser-surface');
    const start=performance.now(),before=chat.getBoundingClientRect().width;
    document.querySelector('.chrome-access-trigger').click();
    return new Promise(resolve=>{
     const samples=[];
     const frame=()=>{
      const r=chat.getBoundingClientRect(),p=pane.getBoundingClientRect(),s=surface.getBoundingClientRect();
      samples.push({time:performance.now()-start,chat:r.width,pane:p.width,surface:s.width,before});
      if(performance.now()-start<340)requestAnimationFrame(frame);else resolve(samples);
     };
     requestAnimationFrame(frame);
    });
   })()`);
   const movement=samples.find(sample=>Math.abs(sample.chat-sample.before)>1);
   assert(movement && movement.time<100,'layout should start moving promptly after clicking');
   movementLatencies.push(Math.round(movement.time));
   assert(new Set(samples.map(sample=>Math.round(sample.chat))).size>5,'chat must change width gradually instead of jumping to final split');
   for(let i=1;i<samples.length;i++){
    const delta=samples[i].chat-samples[i-1].chat;
    assert(visible ? delta<=1 : delta>=-1,'chat must move monotonically without bouncing');
   }
   assert.equal(new Set(samples.map(sample=>Math.round(sample.surface))).size,1,'native surface must retain full viewport width while sliding');
   assert.equal(browser.frame.getVisible(),visible);
   assert.deepEqual(view.getBounds(),pageBeforeToggle);
   const positions=togglePositions.slice(startPositions);
   assert(positions.length>5,'native frame must follow the animated split');
   assert(positions.every(b=>b.width===beforeToggle.width && b.height===beforeToggle.height),'native frame slides without resizing its web page');
   if(visible)assert.deepEqual(browser.frame.getBounds(),beforeToggle);
  }
  assert.equal(togglePageResizes,0,'opening/closing must never resize Chromium during the slide');
  console.log(`PASS split slide: starts in ${movementLatencies.join('/')}ms, gradual chat allocation, zero Chromium resizes`);
  // Reverse before the slide finishes; the CSS transition must continue from
  // its current allocation, with no stale closing callback hiding the reopen.
  await host.webContents.executeJavaScript(`(async()=>{
   document.querySelector('.chrome-access-trigger').click();
   await new Promise(r=>setTimeout(r,70));
   document.querySelector('.chrome-access-trigger').click();
  })()`);
  await new Promise(r=>setTimeout(r,350));
  assert.equal(browser.frame.getVisible(),true,'rapid reopen must remain visible');
  assert.deepEqual(browser.frame.getBounds(),beforeToggle);
  assert.equal(togglePageResizes,0);
  // Reduced motion skips the allocation animation entirely.
  host.webContents.debugger.attach('1.3');
  await host.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const visible of [false,true]){
   await host.webContents.executeJavaScript(`(()=>{
    document.querySelector('.chrome-access-trigger').click();
    return new Promise(resolve=>requestAnimationFrame(()=>resolve()));
   })()`);
   for(let attempt=0;attempt<20 && browser.frame.getVisible()!==visible;attempt++)await new Promise(r=>setTimeout(r,5));
   assert.equal(browser.frame.getVisible(),visible,'reduced motion toggles should settle immediately');
   const duration=await host.webContents.executeJavaScript("parseFloat(getComputedStyle(document.querySelector('.integrated-browser-pane')).transitionDuration)");
   assert(duration<=.001,'reduced motion must skip the allocation transition');
  }
  await host.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});
  host.webContents.debugger.detach();
  assert.deepEqual(browser.frame.getBounds(),beforeToggle);
  browser.frame.setBounds=toggleSet;
  view.setBounds=originalBounds;
  browser.setChat('other-chat');
  await host.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.html-artifact button')].find(b=>b.textContent==='Mở Chrome');b.click();})()`);
  for(let attempt=0;attempt<100;attempt++){
   if(browser.chatId==='preview-chat' && browser.active!==view.webContents.id && browser.tabs.get(browser.active)?.webContents.getTitle()==='Game preview')break;
   await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(browser.chatId,'preview-chat');
  assert.notEqual(browser.active,view.webContents.id);
  assert.equal(browser.tabs.get(browser.active).getVisible(),true);
  assert.equal(browser.tabs.get(browser.active).webContents.getTitle(),'Game preview');
  console.log('PASS real app: HTML preview, native paint, zero Chrome resize on sidebar toggles, stable geometry at 900/1200/1440px');
 }finally{host.close();await daemon.stop();}
 app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
