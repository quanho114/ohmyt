const assert=require('node:assert/strict');
const {app,BrowserWindow,nativeTheme}=require('electron');
const fs=require('node:fs');
const http=require('node:http');
const {IntegratedBrowser}=require('../electron/browser.cjs');
app.whenReady().then(async()=>{
 const browser=new IntegratedBrowser(),host=new BrowserWindow({width:1000,height:600,show:true});
 browser.attach(host,{x:0,y:0,width:816,height:500});
 const id=browser.active;
 await browser.tabs.get(id).webContents.loadURL('about:blank');
 const controls=browser.controls.webContents;
 const actions=browser.actions.webContents;
 if(actions.isLoading())await new Promise(r=>actions.once('did-finish-load',r));
 if(controls.isLoading())await new Promise(r=>controls.once('did-finish-load',r));
 browser.features={enabled:true,installed:true,canFiles:true};browser.publish();
 let opened=false;const send=host.webContents.send.bind(host.webContents);
 host.webContents.send=(channel,...args)=>{if(channel==='browser-files-open')opened=true;else send(channel,...args);};
 const inspect=()=>controls.executeJavaScript(`({height:document.querySelector('form').getBoundingClientRect().bottom,files:!document.querySelector('#browser-files').hidden,ready:document.querySelector('#browser-files').dataset.ready,stop:!document.querySelector('#stop-computer').hidden,text:document.querySelector('#stop-computer').textContent.trim(),overflow:document.documentElement.scrollWidth>innerWidth})`);
 await new Promise(r=>setTimeout(r,100));
 await controls.executeJavaScript("window.previousTab=document.querySelector('.select-tab');window.previousExpandIcon=document.querySelector('#expand svg')");
 browser.publish();await new Promise(r=>setTimeout(r,50));
 assert.equal(await controls.executeJavaScript("window.previousTab===document.querySelector('.select-tab')"),true,'unchanged tab DOM must survive status/session refresh');
 assert.equal(await controls.executeJavaScript("window.previousExpandIcon===document.querySelector('#expand svg')"),true,'unchanged expand icon must survive status/session refresh');
 const actionPixels=(await actions.capturePage()).toBitmap();
 const actionBounds=browser.actions.getBounds();
 for(const positions of [[0,48,96,144,192],[192,144,96,48,0]]){
  for(const x of positions){
   browser.attach(host,{x,y:0,width:816-x,height:500});
   const icon=await actions.executeJavaScript("(()=>{const r=document.querySelector('#expand svg').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
   assert.equal(browser.actions.getBounds().x+icon.x,784,'right toolbar icon must remain anchored during native resize');
   assert.equal(icon.y,11.5,'native resize must not move toolbar icon vertically');
   assert.equal(icon.width,16);assert.equal(icon.height,16);
   assert.deepEqual(browser.actions.getBounds(),actionBounds,'right actions native surface must not resize or move during pane animation');
   assert.deepEqual((await actions.capturePage()).toBitmap(),actionPixels,'right toolbar pixels must remain unchanged across pane resize');
  }
 }
 browser.attach(host,{x:0,y:0,width:816,height:500});
 console.log('PASS native toolbar motion: fixed button surface, stable icon pixels and coordinates in both directions');
 assert.deepEqual(await inspect(),{height:84,files:true,ready:'true',stop:false,text:'',overflow:false});
 await actions.executeJavaScript("browserUI.command('files')");assert.equal(opened,true);
 browser.computer.externalOwners.set(id,'ui-fixture');browser.publish();await new Promise(r=>setTimeout(r,50));
 assert.equal((await inspect()).stop,true);
 nativeTheme.themeSource='light';await new Promise(r=>setTimeout(r,50));
 fs.writeFileSync('/tmp/ohmyt-chrome-compact-light.png',(await controls.capturePage()).toPNG());
 browser.attach(host,{x:0,y:0,width:420,height:500});
 nativeTheme.themeSource='dark';await new Promise(r=>setTimeout(r,100));
 assert.equal((await inspect()).overflow,false);
 fs.writeFileSync('/tmp/ohmyt-chrome-compact-dark.png',(await controls.capturePage()).toPNG());
 await actions.executeJavaScript("browserUI.command('stop')");assert.equal(browser.computer.haltedOwners.has('ui-fixture'),true);
 const server=http.createServer((_req,res)=>res.end('<title>Address input verified</title>'));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  browser.setChat('empty-chat');
  assert.equal(browser.active,null);
  await new Promise(r=>setTimeout(r,50));
  host.focus();controls.focus();
  const point=await controls.executeJavaScript("(()=>{const r=document.querySelector('#address').getBoundingClientRect();return {x:Math.round(r.x+30),y:Math.round(r.y+15)};})()");
  controls.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
  controls.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
  const target=`http://127.0.0.1:${server.address().port}/typed`;
  await controls.insertText(target);
  assert.equal(await controls.executeJavaScript("document.querySelector('#address').value"),target);
  controls.sendInputEvent({type:'keyDown',keyCode:'Return'});
  controls.sendInputEvent({type:'char',keyCode:'\r'});
  controls.sendInputEvent({type:'keyUp',keyCode:'Return'});
  for(let attempt=0;attempt<100;attempt++){
   if(browser.active!==null && browser.tabs.get(browser.active).webContents.getTitle()==='Address input verified')break;
   await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(browser.tabs.get(browser.active)?.chatId,'empty-chat');
  assert.equal(browser.tabs.get(browser.active).webContents.getURL(),target);
  assert.equal(browser.tabs.get(browser.active).webContents.getTitle(),'Address input verified');
 } finally {server.close();}
 console.log('PASS native address input: typing and Enter create a tab in an empty chat');
 console.log('PASS compact Chrome UI: 84px toolbar, file event, status tooltip/dot, stop state, narrow width, light/dark screenshots');
 host.close();app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
