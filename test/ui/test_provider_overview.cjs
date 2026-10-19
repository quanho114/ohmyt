const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,workspaceRoot:process.cwd()});
 daemon.db.createProvider({id:'local-test',name:'Local test',type:'openai-compatible',base_url:'http://127.0.0.1:1234'});
 const {port}=await daemon.start();
 const host=new BrowserWindow({width:1200,height:800,show:true});
 try {
  await host.loadURL(`http://127.0.0.1:${port}/#settings/providers`);
  for(let attempt=0;attempt<150;attempt++){
   if(await host.webContents.executeJavaScript("Boolean(document.querySelector('.settings-page'))"))break;
   await new Promise(r=>setTimeout(r,20));
  }
  const result=await host.webContents.executeJavaScript(`(async()=>{
    const pause=()=>new Promise(r=>setTimeout(r,150));
    await pause();
    if(!document.querySelector('.provider-overview')) throw Error('Overview missing');
    const search=document.querySelector('.provider-sidebar input');
    const setSearch=value=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,value);search.dispatchEvent(new Event('input',{bubbles:true}));};
    setSearch('Gemini'); await pause();
    if(document.querySelectorAll('.provider-catalog-row').length!==1) throw Error('Catalog search failed');
    document.querySelector('.provider-catalog-row').click(); await pause();
    if(!document.querySelector('#provider-add-title')) throw Error('Setup form missing');
    if(document.querySelector('#provider-add-name')?.value==='') throw Error('Catalog did not prefill name');
    document.querySelector('.provider-add button[aria-label]').click(); await pause();
    setSearch('no-provider-matches'); await pause();
    if(document.querySelectorAll('.provider-catalog-row').length) throw Error('Search empty state failed');
    setSearch(''); await pause();
    document.querySelector('.provider-row-link').click(); await pause();
    if(!document.querySelector('#provider-detail-base')) throw Error('Configure failed');
    return true;
  })()`);
  assert(result);
  await host.webContents.executeJavaScript("document.querySelector('.provider-sidebar > div:last-child > button').click()");
  await new Promise(r=>setTimeout(r,300));
  if(process.env.OHMYT_PROVIDER_SCREENSHOT) require('node:fs').writeFileSync(process.env.OHMYT_PROVIDER_SCREENSHOT,(await host.webContents.capturePage()).toPNG());
  host.setSize(620,800);
  await new Promise(r=>setTimeout(r,200));
  assert(await host.webContents.executeJavaScript("document.querySelector('.provider-overview').scrollWidth <= document.querySelector('.provider-main').clientWidth"));
  console.log('PASS provider overview search, empty state, catalog setup, configure and narrow layout');
 } finally {host.close();await daemon.stop();}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
