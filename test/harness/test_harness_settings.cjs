const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'harness-settings-'));
app.setPath('userData',path.join(temp,'user'));
app.whenReady().then(async()=>{
  const {createDaemon}=await import('../../server/index.js');
  const daemon=createDaemon({dbPath:':memory:',port:0,dataDir:temp,plugins:[{
    name:'fixture/extension',manifest:{id:'fixture/extension',version:1,requires:[],capabilities:[],name:'Fixture extension',description:'Local fixture'},apply(){}
  }]});
  const {port}=await daemon.start();
  const w=new BrowserWindow({width:1280,height:800,show:false});
  try{
    await w.loadURL(`http://127.0.0.1:${port}/#settings/extensions`);
    const deadline=Date.now()+20000;
    while(!await w.webContents.executeJavaScript(`!!document.querySelector('.settings-page')`)){
      if(Date.now()>deadline)throw new Error('Settings did not load: '+await w.webContents.executeJavaScript('document.body.innerText.slice(0,500)'));
      await new Promise(r=>setTimeout(r,30));
    }
    const actual=await w.webContents.executeJavaScript(`({title:document.querySelector('#settings-section-title')?.textContent,nav:[...document.querySelectorAll('.settings-nav-item')].map(e=>e.textContent),rows:document.querySelectorAll('[data-extension-id]').length,text:document.body.innerText})`);
    assert.match(actual.title,/Giao diện|Appearance/,'Old extension links fall back to normal settings');
    assert.equal(actual.rows,0);
    assert(!actual.nav.some(label=>/Tiện ích|Extensions/.test(label)));
    assert(!actual.text.includes('Fixture extension'));
    assert(daemon.harness.list().some(plugin=>plugin.name==='fixture/extension'&&plugin.state===2),'Hiding internal settings does not disable plugins');
    console.log('PASS settings: internal extensions hidden, old links fall back, runtime plugins stay active');
  }finally{w.close();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
  app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
