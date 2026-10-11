const {app,BrowserWindow}=require('electron');
const http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-bu-pane-')));
app.commandLine.appendSwitch('host-resolver-rules','MAP fixture.example.test 127.0.0.1,MAP frame.example.org 127.0.0.1');
app.commandLine.appendSwitch('no-proxy-server');
const {IntegratedBrowser}=require('../electron/browser.cjs');
app.whenReady().then(async()=>{
 const {BrowserBridge}=await import('../server/browser_bridge.js');
 const {AppDatabase}=await import('../server/db.js');
 const {BrowserFiles}=await import('../server/browser_files.js');
 const db=new AppDatabase(':memory:');db.createSession('test',db.getAgents()[0].id,'Browser files');db.createSession('other',db.getAgents()[0].id,'Other');
 const fileRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-bu-files-'));
 const {BrowserUseRuntime,browserUseConfig}=await import('../server/browser_use.js');
 const startedAt=performance.now();const actionMetrics=[];let privateRequests=0;
 let slowStarted;const slowRequest=new Promise(resolve=>{slowStarted=resolve;});
 const server=http.createServer(async(req,res)=>{
 if(req.url==='/worker.js'){res.setHeader('Content-Type','application/javascript');return res.end(`onmessage=()=>fetch('http://127.0.0.1:${server.address().port}/private-probe').then(()=>postMessage('unsafe'),()=>postMessage('blocked'));`);}
 if(req.url==='/frame')return res.end(`<button onclick="this.textContent='Cross frame clicked'">Cross frame action</button>`);
 if(req.url==='/login'){let body='';for await(const chunk of req)body+=chunk;if(body!=='password=fixture-secret'){res.writeHead(403);return res.end('Denied');}res.setHeader('Set-Cookie','login=authenticated; HttpOnly; SameSite=Lax');return res.end('Authenticated');}
 if(req.url==='/private-probe'){privateRequests++;return res.end('private');}
 if(req.url==='/slow-file'){res.writeHead(200,{'Content-Disposition':'attachment; filename=slow.txt','Content-Type':'text/plain','Content-Length':1048576});res.write(Buffer.alloc(4096));slowStarted();const timer=setInterval(()=>res.write(Buffer.alloc(4096)),50);res.once('close',()=>clearInterval(timer));return;}
 if(req.url==='/file'){if(!req.headers.cookie?.includes('download=allowed')){res.writeHead(403);return res.end('no cookie');}res.writeHead(200,{'Content-Disposition':'attachment; filename=download.txt','Content-Type':'text/plain'});return res.end('Authenticated download');}
 res.setHeader('Set-Cookie','download=allowed; SameSite=Lax');res.end(`<!doctype html><title>Pane fixture</title><h1>Ready</h1><div id=shadow-host></div><script>document.querySelector('#shadow-host').attachShadow({mode:'open'}).innerHTML='<button>Shadow action</button>';</script><iframe title='Frame fixture' srcdoc='<button>Frame action</button>'></iframe><iframe title="Cross-origin fixture" src="http://frame.example.org:${server.address().port}/frame"></iframe><select aria-label="Choice"><option>One</option><option>Two</option></select><input id="upload" type="file" aria-label="Document" onchange="this.files[0].text().then(t=>document.querySelector('#uploaded').textContent=t)"><div id="uploaded"></div><button id="blob-download" onclick="const a=document.createElement('a');a.href=window.URL.createObjectURL(new window.Blob(['Dynamic CSV'],{type:'text/csv'}));a.download='dynamic.csv';a.click()">Download CSV</button><input type="password" name="password" value="fixture-secret"><input placeholder="Message"><button onclick="document.querySelector(\'h1\').textContent=\'Saved \'+document.querySelector(\'input[placeholder]\').value">Save</button>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=new IntegratedBrowser();
 // Test-only DNS mapping: the fixture is deliberately hosted on loopback.
 const {createNetworkPolicy}=require('../electron/browser-network-policy.cjs');
 browser.cdp.networkPolicy=createNetworkPolicy({lookup:async host=>['fixture.example.test','frame.example.org'].includes(host)?[{address:'93.184.216.34'}]:[{address:'127.0.0.1'}]});
 const host=new BrowserWindow({width:1000,height:800,show:true});
 browser.attach(host,{x:200,y:0,width:650,height:700});
 browser.setChat('test');
 const id=browser.add(`http://fixture.example.test:${server.address().port}`),wc=browser.tabs.get(id).webContents;
 await new Promise(r=>wc.once('did-finish-load',r));
 const bridge=new BrowserBridge();bridge.nativeCommand=(action,args,signal)=>{const request=browser.command(action,args);if(!signal)return request;let abort;const stopped=new Promise((_,reject)=>{abort=()=>{browser.computer.stop(args.tabId);reject(new Error('Browser action stopped.'));};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});return Promise.race([request,stopped]).finally(()=>signal.removeEventListener('abort',abort));};browser.cdp.events=event=>{for(const listener of bridge.cdpListeners)listener(event);};
 const {BrowserEgress}=await import('../server/browser_egress.js');
 const egressFactory=()=>new BrowserEgress({lookup:async host=>['fixture.example.test','frame.example.org'].includes(host)?[{address:'93.184.216.34',family:4}]:[{address:'127.0.0.1',family:4}],connect:options=>require('node:net').connect({...options,host:'127.0.0.1',hostname:'127.0.0.1'})});
 const runtime=new BrowserUseRuntime({...browserUseConfig(),enabled:true,mode:'integrated',domains:['fixture.example.test','frame.example.org']},{createEgress:egressFactory});runtime.browserBridge=bridge;runtime.files=new BrowserFiles(db,fileRoot);runtime.gateway={streamChat:async options=>{assert.equal(options.modelId,'fixture-model');assert.deepEqual(options.tools,[]);options.onChunk(JSON.stringify({heading:'Ready'}));return {usage:{inputTokens:10,outputTokens:5}};}};
 const execute=runtime.execute.bind(runtime);runtime.execute=async(...args)=>{const start=performance.now();try{const result=await execute(...args);actionMetrics.push({action:args[0],ok:true,ms:Math.round(performance.now()-start)});return result;}catch(error){actionMetrics.push({action:args[0],ok:false,ms:Math.round(performance.now()-start)});throw error;}};
 const context={runId:'pane-test',sessionId:'test',scopeId:'standalone:test'};
 try {
  // A permission dialog hides native views; the pane itself stays open.
  browser.attach(host,null,true);
  assert.equal(browser.tabs.get(id).getVisible(),false);
  const suspendedPdf=await runtime.execute('pdf',{name:'permission-dialog.pdf'},{...context,runId:'modal-pdf'});
  assert.match((await runtime.files.read('test',suspendedPdf.artifact.fileId)).bytes.toString('ascii',0,5),/%PDF-/);
  await runtime.releaseRun('modal-pdf');
  // Actually closing the pane must still block background browser control.
  browser.attach(host,null,false);
  await assert.rejects(runtime.execute('pdf',{name:'closed.pdf'},{...context,runId:'closed-pdf'}),/Open the browser pane/);
  await runtime.releaseRun('closed-pdf');
  browser.attach(host,{x:200,y:0,width:650,height:700});
  let s=await runtime.execute('read',{},context);assert.ok(s.dom.includes('Ready'),JSON.stringify(s));
  assert(!JSON.stringify(s).includes('fixture-secret'),'Sensitive DOM values are redacted');
  const ax=await runtime.execute('accessibility',{},context);assert(ax.nodes.some(n=>n.role==='button'));assert(!JSON.stringify(ax).includes('fixture-secret'));
  assert.deepEqual((await runtime.execute('evaluate',{expression:'page.elements.filter(e => e.tag === "select").map(e => e.tag)'},context)).value,['select']);
  const screenshot=await runtime.execute('screenshot',{},context);assert.equal((await runtime.files.read('test',screenshot.artifact.fileId)).bytes[0],137);
  await runtime.execute('keypress',{key:'Escape'},context);
  s=await runtime.execute('wait',{milliseconds:10},context);
  await runtime.control(context.runId,'test','authentication');
  assert.equal(runtime.status('test')[0].state,'paused');
  const manualLogin=await wc.executeJavaScript("fetch('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password='+encodeURIComponent(document.querySelector('input[type=password]').value)}).then(r=>r.text())");assert.equal(manualLogin,'Authenticated');
  browser.computer.input(id,{type:'keyDown',key:'Tab'});
  let resumed=false;const waiting=runtime.execute('read',{},context).then(result=>{resumed=true;return result;});await new Promise(r=>setTimeout(r,20));assert.equal(resumed,false);await runtime.control(context.runId,'test','resume');s=await waiting;
  assert((await wc.session.cookies.get({name:'login'})).some(cookie=>cookie.value==='authenticated'));
  browser.setChat('other');const otherId=browser.add(`http://fixture.example.test:${server.address().port}/`),otherWc=browser.tabs.get(otherId).webContents;await new Promise(r=>otherWc.once('did-finish-load',r));assert.notEqual(wc.session,otherWc.session);assert.equal((await otherWc.session.cookies.get({name:'login'})).length,0);await bridge.prepareSession('other');assert(!bridge.status('other').tabs.some(t=>t.id===id));await assert.rejects(browser.command('cdp.attach',{tabId:id,owner:'other:run',chatId:'other'}),/another chat/);browser.remove(otherId);browser.setChat('test');
  assert.ok(s.dom.includes('Shadow action'),'Open Shadow DOM is perceived');
  assert.ok(s.dom.includes('Frame action'),'Same-origin srcdoc iframe is perceived');
  const blocked=await wc.executeJavaScript(`fetch('http://127.0.0.1:${server.address().port}/private-probe').then(()=>false,()=>true)`);
  assert.equal(blocked,true);assert.equal(privateRequests,0,'Private destination blocked before request reaches server');
  const workerBlocked=await wc.executeJavaScript("new Promise((resolve,reject)=>{const w=new Worker('/worker.js');w.onmessage=e=>{w.terminate();resolve(e.data)};w.onerror=()=>{w.terminate();reject(Error('worker fixture failed'))};w.postMessage('probe')})");assert.equal(workerBlocked,'blocked');assert.equal(privateRequests,0,'Worker cannot bypass session egress');
  const cdp=runtime.runs.get(context.runId).cdp;
  const targets=await cdp.command('Target.getTargets',{});assert.equal(targets.targetInfos.filter(t=>t.type==='page').length,1);assert.equal(targets.targetInfos.find(t=>t.type==='page').targetId,String(id));
  await assert.rejects(cdp.command('Target.attachToTarget',{targetId:String(host.webContents.id)}));
  await assert.rejects(browser.command('cdp.attach',{tabId:browser.controls.webContents.id,owner:'bad'}));
  const previewId=browser.addPreview('<h1>Preview</h1>');await assert.rejects(browser.command('cdp.attach',{tabId:previewId,owner:'bad'}));browser.remove(previewId);browser.select(id);
  await assert.rejects(cdp.command('Page.navigate',{url:'https://denied.example/'}));
  s=await runtime.execute('type',{index:s.elements.find(e=>e.tag==='input' && e.index===s.elements.filter(e=>e.tag==='input').at(-1).index).index,snapshotId:s.snapshotId,text:'embedded'},context);
  s=await runtime.execute('click',{index:s.elements.find(e=>e.tag==='button' && e.text==='Save').index,snapshotId:s.snapshotId},context);
  assert.ok(s.dom.includes('Saved embedded'));
  assert.equal(await wc.executeJavaScript("document.querySelector('h1').textContent"),'Saved embedded');
  s=await runtime.execute('dropdown_options',{index:s.elements.find(e=>e.tag==='select').index,snapshotId:s.snapshotId},context);assert.ok(s.options);
  s=await runtime.execute('select_dropdown',{index:s.elements.find(e=>e.tag==='select').index,snapshotId:s.snapshotId,text:'Two'},context);
  assert.equal(await wc.executeJavaScript("document.querySelector('select').value"),'Two');
  const image=await bridge.execute(context.sessionId,'observe',{tabId:id},undefined,context.runId);assert.match(image.image.dataUrl,/^data:image\/jpeg;base64,/);
  s=await runtime.execute('reload',{},context);assert.ok(s.dom.includes('Ready'));
  for(let attempt=0;attempt<20&&!s.dom.includes('Cross frame action');attempt++){await new Promise(r=>setTimeout(r,100));s=await runtime.execute('read',{},context);}
  assert.ok(s.dom.includes('Cross frame action'),'Cross-origin iframe is perceived');
  s=await runtime.execute('click',{index:s.elements.find(e=>e.text==='Cross frame action').index,snapshotId:s.snapshotId},context);assert.ok(s.dom.includes('Cross frame clicked'),'Cross-origin action is observed');
  const chosen=await runtime.files.add('test','note.txt',Buffer.from('Uploaded content'),'text/plain');
  const uploadIndex=s.elements.filter(e=>e.tag==='input')[0].index;
  s=await runtime.execute('upload_file',{fileId:chosen.fileId,index:uploadIndex,snapshotId:s.snapshotId},context);
  assert.equal(await wc.executeJavaScript("document.querySelector('#upload').files[0].name"),'note.txt');
  assert.equal(await wc.executeJavaScript("document.querySelector('#upload').files[0].text()"),'Uploaded content');
  await assert.rejects(runtime.execute('upload_file',{fileId:chosen.fileId,index:uploadIndex,snapshotId:s.snapshotId},{...context,sessionId:'other'}));
  const pdf=await runtime.execute('pdf',{name:'page.pdf'},context);assert.equal(pdf.artifact.kind,'pdf');assert.match((await runtime.files.read('test',pdf.artifact.fileId)).bytes.toString('ascii',0,5),/%PDF-/);
  const downloaded=await runtime.execute('download',{url:`http://fixture.example.test:${server.address().port}/file`},context);assert.equal((await runtime.files.read('test',downloaded.artifact.fileId)).bytes.toString(),'Authenticated download');
  const downloadState=await runtime.execute('read',{},context);
  const blob=await runtime.execute('download_click',{index:downloadState.elements.find(e=>e.text==='Download CSV').index,snapshotId:downloadState.snapshotId},context);
  assert.equal((await runtime.files.read('test',blob.artifact.fileId)).bytes.toString(),'Dynamic CSV');assert.equal(blob.artifact.name,'dynamic.csv');
  s=await runtime.execute('read',{},context);
  const schema={type:'object' ,properties:{heading:{type:'string'}},required:['heading'],additionalProperties:false};
  const extracted=await runtime.execute('extract',{query:'Get heading',schema},{...context,model:{providerId:'fixture-provider',modelId:'fixture-model'}});assert.deepEqual(extracted.data,{heading:'Ready'});assert.equal(extracted.artifact.kind,'extraction');
  s=await runtime.execute('read',{},context);const old=s;await wc.executeJavaScript("document.querySelector('h1').textContent='Updated';[...document.querySelectorAll('button')].find(b=>b.textContent==='Save').textContent='Changed'");await assert.rejects(runtime.execute('click',{index:s.elements.find(e=>e.tag==='button' && e.text==='Save').index,snapshotId:old.snapshotId},context),error=>['STALE_SNAPSHOT','PAGE_CHANGED'].includes(error.code));
  const recovered=await runtime.execute('recover',{},context);assert.ok(recovered.dom.includes('Updated'));assert.equal(recovered.recovery.mutationOutcomeUnknown,false);
  const entry=runtime.runs.get(context.runId);runtime.kill(entry,'SIGKILL');await entry.exited;await new Promise(r=>setTimeout(r,50));
  await assert.rejects(runtime.execute('recover',{}, {...context,sessionId:'other'}),/another chat/);
  const reconnected=await runtime.execute('recover',{},context);assert.equal(reconnected.recovery.reconnected,true);assert.ok(reconnected.dom.includes('Updated'));assert.equal(wc.isDestroyed(),false);assert.equal(await wc.executeJavaScript("document.querySelector('#upload').files[0].text()"),'Uploaded content');
  const newPage=await runtime.execute('new_tab',{url:`http://fixture.example.test:${server.address().port}/second`},context);assert.ok(newPage.dom.includes('Ready'),JSON.stringify(newPage).slice(0,2000));
  const list=await runtime.execute('tabs',{},context);assert.equal(list.tabs.length,2);
  const newId=list.tabs.find(t=>t.targetId!==String(id)).targetId;
  await runtime.execute('switch',{targetId:String(id)},context);
  await runtime.execute('close_tab',{targetId:newId},context);
  browser.computer.input(id,{type:'mouseDown',x:999,y:999});await assert.rejects(runtime.execute('read',{},context));
  await runtime.releaseRun(context.runId);assert.equal(wc.isDestroyed(),false);assert.equal(wc.debugger.isAttached(),false);assert.equal(bridge.computerLeases.size,0);assert.equal((await runtime.files.read('test',pdf.artifact.fileId)).metadata.name,'page.pdf');assert.equal(await wc.executeJavaScript("document.querySelector('#upload').files[0].text()"),'Uploaded content');
  const beforeCancel=runtime.files.list('test').length;
  const cancelContext={...context,runId:'cancel-download'};const controller=new AbortController();
  const cancelled=runtime.execute('download',{url:`http://fixture.example.test:${server.address().port}/slow-file`},{...cancelContext,signal:controller.signal});
  const stopped=assert.rejects(cancelled,/stopped|dừng/);await slowRequest;
  for(let attempt=0;attempt<100 && !browser.files.requests.get(id)?.item;attempt++)await new Promise(r=>setTimeout(r,20));
  assert.ok(browser.files.requests.get(id)?.item);controller.abort();await stopped;await runtime.releaseRun(cancelContext.runId);
  assert.equal(browser.files.requests.size,0);assert.equal(runtime.files.list('test').length,beforeCancel);assert.ok(fs.readdirSync(fileRoot).every(name=>!name.includes('.part')));
  const timings=actionMetrics.filter(a=>a.ok).map(a=>a.ms).sort((a,b)=>a-b);
  console.log('MEASUREMENTS '+JSON.stringify({p50ActionMs:timings[Math.floor(timings.length*.5)],p95ActionMs:timings[Math.floor(timings.length*.95)],wallMs:Math.round(performance.now()-startedAt),electronRssBytes:process.memoryUsage().rss,actions:actionMetrics,paidModelCalls:0,extractionModel:'fixture',network:runtime.egressProfiles.get('test')?.stats}));
  console.log('PASS real Browser Use in Electron pane: DOM/type/click, dropdowns, visual state, tabs, upload name/content, authenticated/blob download, verified PDF under modal occlusion, closed-pane rejection, extraction, stale/crash recovery, app isolation, user takeover, durable files, cancelled download cleanup');
 }finally{await runtime.close();host.close();server.close();db.close();fs.rmSync(fileRoot,{recursive:true,force:true});app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
