const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-cursor-'));app.setPath('userData',profile);
const {IntegratedBrowser}=require('../electron/browser.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const server=http.createServer((_req,res)=>res.end(`<style>body{margin:0;background:#f6f5f9;font:15px system-ui;color:#252332}main{margin:48px;background:white;border:1px solid #e8e5ef;border-radius:18px;padding:28px}h1{font-size:24px;margin:0 0 8px}p{color:#747083}button{margin-top:24px;padding:12px 24px;border:0;border-radius:10px;background:#6d28d9;color:white;font:600 14px system-ui}input{display:block;margin-top:20px;padding:12px;border:1px solid #dedbe7;border-radius:8px}</style><main><h1>Browser workspace</h1><p>Your AI is working alongside you</p><input placeholder="Task name"><button onclick="window.clicks=(window.clicks||0)+1">Continue</button></main>`));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=new IntegratedBrowser(),host=new BrowserWindow({width:900,height:700,show:true});browser.attach(host,{x:0,y:0,width:760,height:600});
 const id=browser.add(`http://127.0.0.1:${server.address().port}/`),wc=browser.tabs.get(id).webContents;await new Promise(resolve=>wc.once('did-finish-load',resolve));
 const state=()=>wc.executeJavaScriptInIsolatedWorld(998,[{code:'JSON.parse(JSON.stringify(globalThis.__ohmytAgentCursor?.state||null))'}]);
 try{
  await browser.cursor.move(wc,{x:80,y:80});const observed=await browser.computer.pageState(wc);
  await browser.cursor.move(wc,{x:420,y:240});assert.equal((await state()).x,420);assert.deepEqual(await browser.computer.pageState(wc),observed,'Overlay motion must not invalidate DOM snapshots');
  assert.equal(await wc.executeJavaScript("document.getElementById('__ohmyt_cursor').shadowRoot"),null);assert.equal(await wc.executeJavaScript("document.getElementById('__ohmyt_cursor').getAttribute('aria-hidden')"),'true');
  assert.equal(await wc.executeJavaScript("getComputedStyle(document.getElementById('__ohmyt_cursor')).pointerEvents"),'none');
  assert(!((await browser.command('read',{tabId:id})).text.includes('AI ·')),'Cursor badge must not enter page observations');
  await browser.cursor.move(wc,{x:180,y:220,kind:'down',instant:true});await sleep(50);const visible=await wc.capturePage();const hidden=await browser.cursor.hidden(wc,()=>wc.capturePage());assert(!visible.toPNG().equals(hidden.toPNG()),'Screenshot hide must actually remove visible cursor pixels');assert.equal((await state()).visible,true);
  const read=await browser.command('read',{tabId:id});const button=read.elements.find(e=>e.tag==='button');
  await browser.command('click',{tabId:id,elementId:button.id,computerOwner:'dom'});assert.equal(await wc.executeJavaScript('window.clicks'),1);assert.equal((await state()).kind,'down');
  const read2=await browser.command('read',{tabId:id});await browser.command('type',{tabId:id,elementId:read2.elements.find(e=>e.tag==='input').id,text:'Design review',computerOwner:'dom'});assert.equal((await state()).kind,'typing');
  const snapshot=await browser.computer.observe(id,'visual');await browser.cursor.move(wc,{x:320,y:120});await browser.computer.act({tabId:id,snapshotId:snapshot.snapshotId,action:'move',x:300,y:100},'visual');
  const read3=await browser.command('read',{tabId:id});const pending=browser.command('click',{tabId:id,elementId:read3.elements.find(e=>e.tag==='button').id,computerOwner:'cancelled'});const stopped=assert.rejects(pending,/dừng/);setTimeout(()=>browser.computer.stop(id),40);await stopped;assert.equal(await wc.executeJavaScript('window.clicks'),1);assert.equal(await state(),null,'Takeover must remove the cursor');
  await browser.cdp.attach(id,'cdp');await browser.cdp.command({tabId:id,owner:'cdp',method:'Input.dispatchMouseEvent',params:{type:'mouseMoved',x:90,y:90}});assert.equal((await state()).visible,true);await browser.cdp.command({tabId:id,owner:'cdp',method:'Input.dispatchMouseEvent',params:{type:'mousePressed',x:90,y:90,button:'left',clickCount:1}});const release=browser.cdp.command({tabId:id,owner:'cdp',method:'Input.dispatchMouseEvent',params:{type:'mouseReleased',x:90,y:90,button:'left',clickCount:1}});let timer;try{await Promise.race([release,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cursor must not block CDP mouse release')),1500);})]);}finally{clearTimeout(timer);}await browser.cdp.pause(id,'cdp');await sleep(30);assert.equal(await state(),null);browser.cdp.resume(id,'cdp',['127.0.0.1']);await browser.cdp.release('cdp');
  await wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});const started=Date.now();await browser.cursor.move(wc,{x:600,y:400});assert(Date.now()-started<140,'Reduced motion skips decorative travel wait');await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});wc.debugger.detach();
  await browser.cursor.move(wc,{x:242,y:236,kind:'down',instant:true});await sleep(100);fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/browser-ai-cursor.png',(await wc.capturePage()).toPNG());
  await sleep(1900);assert.equal((await state()).visible,false,'Idle cursor fades away');await browser.cursor.clear(wc);assert.equal(browser.cursor.positions.size,0);
  console.log('PASS cursor UX: movement, pass-through, DOM/visual/CDP, screenshot masking, stable snapshots, takeover, pause, reduced motion and idle cleanup');
 }finally{host.destroy();await new Promise(resolve=>server.close(resolve));app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
