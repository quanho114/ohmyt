const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'chat-stop-drain-'));app.setPath('userData',path.join(temp,'electron'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const gate=Promise.withResolvers(),entered=Promise.withResolvers();let bodies=0,streams=0;
 const daemon=createDaemon({dbPath:':memory:',dataDir:temp,port:0,plugins:[{name:'fixture/write',inject:['tools'],apply(ctx){ctx.effect(()=>ctx.tools.register({name:'fixture_write',scopes:['standalone'],description:'Write fixture',parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{bodies++;entered.resolve();await gate.promise;return {saved:true};}}));}}],pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async options=>{const user=options.messages.findLast(message=>message.role==='user');if(user?.content==='Initial request')options.onToolCall({id:'write',name:'fixture_write',arguments:{}});else options.onChunk('NEXT-RESULT');return {completed:true};}});}}}});
 daemon.db.createSession('stopping',daemon.db.getAgents()[0].id,'Stopping regression');daemon.db.setPolicy('fixture_write:*','ALLOW');
 const {port}=await daemon.start();daemon.apiServer.server.on('request',req=>{if(/^\/api\/runs\/[^/]+\/stream/.test(req.url))streams++;});
 const window=new BrowserWindow({width:1000,height:800,show:true});
 const ui=code=>window.webContents.executeJavaScript(code);
 const wait=async predicate=>{const deadline=Date.now()+10000;while(!await predicate()){if(Date.now()>deadline)throw Error('Chat condition timed out: '+await ui('document.body.innerText'));await new Promise(resolve=>setTimeout(resolve,30));}};
 try{
  const response=await fetch(`http://127.0.0.1:${port}/api/runs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'stopping',prompt:'Initial request'})});assert(response.ok);const {runId}=await response.json();
  await entered.promise;await window.loadURL(`http://127.0.0.1:${port}/#session/stopping`);
  await wait(()=>ui(`!!document.querySelector('button[aria-label="Dừng tác vụ"]')`));
  await wait(()=>Promise.resolve(streams===1));
  await ui(`document.querySelector('button[aria-label="Dừng tác vụ"]').click()`);
  await wait(()=>ui(`!!document.querySelector('.trace-tool[data-status="unknown"]')`));
  await new Promise(resolve=>setTimeout(resolve,2200));
  assert.equal(streams,1,'Control polling must not reattach a run whose body is draining after cancellation');
  assert.equal(daemon.db.db.prepare('SELECT status FROM runs WHERE id=?').get(runId).status,'aborted');
  await wait(()=>ui(`!!document.querySelector('button[aria-label="Đang dừng tác vụ"]:disabled')`));
  await ui(`(()=>{const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Next request');field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(()=>ui(`!!document.querySelector('button[aria-label="Gửi tin nhắn tiếp theo"]:not(:disabled)')`));
  await ui(`document.querySelector('button[aria-label="Gửi tin nhắn tiếp theo"]').click()`);
  await wait(()=>Promise.resolve(daemon.harness.inbox.list('stopping').some(item=>item.content==='Next request')));
  assert(!daemon.db.getMessages('stopping').some(message=>message.sender==='user'&&message.content==='Next request'),'The next message waits for physical tool drain');
  gate.resolve();await wait(()=>Promise.resolve(daemon.db.getMessages('stopping').some(message=>message.sender==='agent'&&message.content==='NEXT-RESULT')));
  await wait(()=>ui(`document.body.innerText.includes('NEXT-RESULT')`));assert.equal(bodies,1);
  console.log('PASS actual chat: stop does not resurrect the old stream; new input queues until body drain');
 }finally{gate.resolve();window.close();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
