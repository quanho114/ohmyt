const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'harness-controls-ui-'));app.setPath('userData',path.join(temp,'electron'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');let release,entered=false;const waiting=new Promise(r=>release=r);
 const daemon=createDaemon({dbPath:':memory:',port:0,dataDir:temp,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async({messages,onToolCall,onChunk})=>{const user=[...messages].reverse().find(m=>m.role==='user');if(user?.content==='Initial request'&&!messages.some(m=>m.role==='tool'))onToolCall({id:'slow',name:'fixture_slow',arguments:{}});else onChunk('Result for '+user?.content);return {completed:true};}});}}},plugins:[{name:'fixture/slow',inject:['tools'],apply(ctx){ctx.effect(()=>ctx.tools.register({name:'fixture_slow',scopes:['standalone'],description:'Wait for fixture',parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{entered=true;await waiting;return 'observed';}}));}}]});
 daemon.db.createSession('controls',daemon.db.getAgents()[0].id,'Controls');daemon.db.setPolicy('fixture_slow:*','ALLOW');const {port}=await daemon.start();const w=new BrowserWindow({width:1280,height:800,show:true});
 const wait=async predicate=>{const deadline=Date.now()+10000;while(!await predicate()){if(Date.now()>deadline)throw new Error('UI condition timed out; inbox='+JSON.stringify(daemon.harness.inbox.list('controls'))+'; '+await w.webContents.executeJavaScript('document.body.innerText'));await new Promise(r=>setTimeout(r,30));}};
 const ui=async code=>{try{return await w.webContents.executeJavaScript(code);}catch(error){console.error('Renderer expression failed:',code);throw error;}};
 const send=async text=>{await wait(()=>ui(`document.querySelector('textarea')?.value===''`));await ui(`(()=>{const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(text)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(()=>ui(`!!document.querySelector('button[aria-label="Gửi tin nhắn tiếp theo"]:not(:disabled)')`));await ui(`document.querySelector('button[aria-label="Gửi tin nhắn tiếp theo"]').click()`);await wait(()=>Promise.resolve(daemon.harness.inbox.list('controls').some(x=>x.content===text)));};
 try{
  const response=await fetch(`http://127.0.0.1:${port}/api/runs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'controls',prompt:'Initial request'})});assert(response.ok);const initial=await response.json();
  await wait(()=>Promise.resolve(entered));await w.loadURL(`http://127.0.0.1:${port}/#session/controls`);await wait(()=>ui(`!!document.querySelector('textarea')`));
  assert.doesNotMatch(await ui('document.body.innerText'),/Send after this reply|Gửi khi trả lời xong/);
  await send('Queued request');await send('Immediate instruction');await send('Delete this request');
  await wait(()=>ui(`document.querySelectorAll('.harness-pending-row').length===3`));
  assert.equal(await ui(`document.querySelectorAll('.harness-pending-actions button').length`),9);
  await ui(`document.querySelectorAll('.harness-pending-row')[2].querySelector('button[aria-label="Xóa tác vụ chờ"],button[aria-label="Delete pending task"]').click()`);
  await wait(()=>Promise.resolve(!daemon.harness.inbox.list('controls').some(x=>x.content==='Delete this request')));
  await ui(`document.querySelector('.harness-pending-row button[aria-label="Chờ tác vụ hoàn tất"],button[aria-label="Wait until task finishes"]').click()`);
  assert.equal(daemon.harness.inbox.list('controls')[0].kind,'queued');
  for(const width of [1280,720,480]){
   w.setSize(width,800);await new Promise(r=>setTimeout(r,150));
   const layout=await ui(`(()=>{const shell=document.querySelector('.composer-shell'),toolbar=document.querySelector('.composer-toolbar'),bounds=shell.getBoundingClientRect();return {overflow:toolbar.scrollWidth>toolbar.clientWidth+1,outside:[...toolbar.querySelectorAll('button')].filter(el=>el.getClientRects().length).some(el=>{const r=el.getBoundingClientRect();return r.right>bounds.right+1||r.left<bounds.left-1;})};})()`);
   assert.equal(layout.overflow,false,`Toolbar overflow at ${width}`);assert.equal(layout.outside,false,`Controls outside composer at ${width}`);
  }
  await ui(`document.querySelectorAll('.harness-pending-row')[1].querySelector('button[aria-label="Gửi ngay"],button[aria-label="Send now"]').click()`);
  await wait(()=>Promise.resolve([...daemon.agentLoop.activeRuns.values()].some(x=>x.abortController?.signal.aborted || x.signal?.aborted)||daemon.db.db.prepare("SELECT status FROM runs WHERE id=?").get(initial.runId)?.status==='aborted'));
  assert(!daemon.db.getMessages('controls').some(x=>x.sender==='user'&&x.content==='Immediate instruction'),'replacement waits for old body to drain');
  release();await wait(()=>Promise.resolve(daemon.db.getMessages('controls').some(x=>x.sender==='agent'&&x.content==='Result for Queued request')));
  await Promise.allSettled([...daemon.agentLoop.pendingRuns]);
  assert(!daemon.db.getMessages('controls').some(x=>x.content==='Delete this request'));assert.equal(daemon.harness.inbox.list('controls').length,0);
  assert.equal(daemon.harness.sessions.get(initial.runId).status,'superseded');
  console.log('Busy composer, responsive queue, deletion and send-now replacement after body drain passed');
 }finally{release();w.close();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
