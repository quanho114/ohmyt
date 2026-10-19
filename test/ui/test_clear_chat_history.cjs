const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,workspaceRoot:process.cwd()});
 const {port}=await daemon.start();
 const host=new BrowserWindow({width:1200,height:800,show:true});
 try {
  await host.loadURL(`http://127.0.0.1:${port}/#settings/timeline`);
  for(let attempt=0;attempt<150;attempt++){
   if(await host.webContents.executeJavaScript("Boolean(document.querySelector('.settings-page'))"))break;
   await new Promise(r=>setTimeout(r,20));
  }
  daemon.db.createSession('clear-one', 'default-assistant', 'First');
  daemon.db.createSession('clear-two', 'default-assistant', 'Second');
  await host.webContents.executeJavaScript(`(async()=>{
    location.hash = '#settings/profile';
    await new Promise(r=>setTimeout(r,200));
    const button = [...document.querySelectorAll('button')].find(b=>b.textContent==='Xóa toàn bộ lịch sử chat');
    if(!button) throw Error('Missing clear history button');
    window.confirm=()=>{ throw Error("Native confirm must not be used"); };
    const rows=[...document.querySelectorAll('.profile-row, .profile-history-section')];
    if(rows.some(row=>getComputedStyle(row).borderTopWidth!=='0px')) throw Error('Profile has dividing lines');
    button.click();
  })()`);
  assert.equal(daemon.db.getSessions().length,2);
  assert(await host.webContents.executeJavaScript("Boolean(document.querySelector('.profile-history-dialog[open]'))"));
  assert.equal(await host.webContents.executeJavaScript("document.activeElement.className"),'profile-history-cancel');
  if (process.env.OHMYT_HISTORY_SCREENSHOT) {
    await new Promise(r=>setTimeout(r,200));
    require('node:fs').writeFileSync(process.env.OHMYT_HISTORY_SCREENSHOT, (await host.webContents.capturePage()).toPNG());
  }
  await host.webContents.executeJavaScript("document.querySelector('.profile-history-cancel').click()");
  assert.equal(daemon.db.getSessions().length,2);
  assert.equal(await host.webContents.executeJavaScript("Boolean(document.querySelector('.profile-history-dialog[open]'))"),false);
  if (process.env.OHMYT_PROFILE_SCREENSHOT) {
    await new Promise(r=>setTimeout(r,200));
    require('node:fs').writeFileSync(process.env.OHMYT_PROFILE_SCREENSHOT, (await host.webContents.capturePage()).toPNG());
  }
  await host.webContents.executeJavaScript("document.querySelector('.profile-clear-history').click()");
  host.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  host.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await host.webContents.executeJavaScript("Boolean(document.querySelector('.profile-history-dialog[open]'))"),false);
  assert.equal(daemon.db.getSessions().length,2);
  await host.webContents.executeJavaScript(`document.querySelector('.profile-clear-history').click(); document.querySelector('.profile-history-confirm').click()`);
  for(let i=0;i<200 && daemon.db.getSessions().length;i++) await new Promise(r=>setTimeout(r,20));
  assert.equal(daemon.db.getSessions().length,0);
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await host.webContents.executeJavaScript("localStorage.getItem('ohmyt_cached_sessions')"),'[]');
  daemon.db.createSession('retry-one', 'default-assistant', 'Retry first');
  daemon.db.createSession('retry-two', 'default-assistant', 'Retry second');
  await host.webContents.executeJavaScript(`
    window.originalFetch=window.fetch;
    let deletes=0;
    window.fetch=(input,init)=> {
      if(init?.method==='DELETE' && ++deletes===2) return Promise.resolve(new Response(JSON.stringify({error:'Test failure'}),{status:500}));
      return window.originalFetch(input,init);
    };
    document.querySelector('.profile-clear-history').click();
    document.querySelector('.profile-history-confirm').click();
  `);
  for(let i=0;i<200;i++) {
    if(await host.webContents.executeJavaScript("Boolean(document.querySelector('.profile-error'))")) break;
    await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(daemon.db.getSessions().length,1);
  assert(await host.webContents.executeJavaScript("Boolean(document.querySelector('.profile-error'))"));
  await host.webContents.executeJavaScript(`window.fetch=window.originalFetch; document.querySelector('.profile-clear-history').click(); document.querySelector('.profile-history-confirm').click()`);
  for(let i=0;i<200 && daemon.db.getSessions().length;i++) await new Promise(r=>setTimeout(r,20));
  assert.equal(daemon.db.getSessions().length,0);
  console.log('PASS cancel, confirm, partial failure and retry clearing chat history');
 } finally {host.close();await daemon.stop();}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
