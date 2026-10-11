const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,workspaceRoot:process.cwd()});
 const {port}=await daemon.start();
 const host=new BrowserWindow({width:1200,height:800,show:true});
 try {
  await host.loadURL(`http://127.0.0.1:${port}/#settings/timeline`);
  for(let attempt=0;attempt<150;attempt++){
   if(await host.webContents.executeJavaScript("Boolean(document.querySelector('.settings-page'))"))break;
   await new Promise(r=>setTimeout(r,20));
  }
  const result=await host.webContents.executeJavaScript(`(async()=>{
   const names=[...document.querySelectorAll('.settings-nav-item')].map(button=>button.textContent);
   if(names.length!==6)throw Error('Settings failed to render: '+names);
   for(const name of names){
    [...document.querySelectorAll('.settings-nav-item')].find(button=>button.textContent===name).click();
    await new Promise(r=>setTimeout(r,100));
    if(!document.querySelector('.settings-page'))throw Error('Settings crashed on '+name);
   }
   return names;
  })()`);
  assert.equal(result.length,6);
  assert(!result.includes('Timeline'));
  console.log('PASS desktop settings: legacy Timeline URL recovers, all six settings pages render');
 } finally {host.close();await daemon.stop();}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
