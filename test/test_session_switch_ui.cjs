const {app,BrowserWindow}=require('electron');const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-switch-ui-'));app.setPath('userData',path.join(data,'electron'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../server/index.js');const daemon=createDaemon({dbPath:':memory:',port:0,workspaceRoot:process.cwd(),dataDir:path.join(data,'data')});
 const agent=daemon.db.getAgents()[0].id;for(const id of ['switch-a','switch-b','switch-c','switch-d']){daemon.db.createSession(id,agent,id);for(let n=0;n<12;n++)daemon.db.addMessage(id+'-'+n,id,n%2?'agent':'user','History '+id+' '+n+' '+('example content '.repeat(12)));}
 const {port}=await daemon.start();const w=new BrowserWindow({width:1100,height:700,show:true});
 try{await w.loadURL(`http://127.0.0.1:${port}/#session/switch-a`);await new Promise(r=>setTimeout(r,1200));
 const result=await w.webContents.executeJavaScript(`(async()=>{
 const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/messages'))await new Promise(r=>setTimeout(r,300));return original(...args);};
 let blank=0,frames=0,running=true;function sample(){if(!running)return;frames++;if(!document.querySelector('.message-row'))blank++;requestAnimationFrame(sample);}requestAnimationFrame(sample);
 for(const id of ['switch-b','switch-c','switch-a','switch-b']){const name=[...document.querySelectorAll('.sidebar-session-name')].find(el=>el.textContent===id);if(!name)throw Error('Missing session '+id);name.closest('button').click();await new Promise(r=>setTimeout(r,500));}
 const choose=id=>[...document.querySelectorAll('.sidebar-session-name')].find(el=>el.textContent===id).closest('button').click();choose('switch-d');await new Promise(r=>setTimeout(r,30));choose('switch-a');await new Promise(r=>setTimeout(r,600));const raceSession=location.hash;choose('switch-b');await new Promise(r=>setTimeout(r,400));running=false;
 const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const paneOpen=()=>document.querySelector('.integrated-browser-pane')?.dataset.open==='true';
 choose('switch-a');await frame();window.dispatchEvent(new Event('ohmyt-browser-toggle'));await frame();const browserA=paneOpen();
 choose('switch-b');await frame();const browserB=paneOpen();
 choose('switch-a');await frame();const restoredA=paneOpen();
 document.querySelector('button[aria-label="Trang chủ"]').click();await frame();const browserHome=paneOpen();
 choose('switch-b');await frame();
 return {blank,frames,session:location.hash,raceSession,browserA,browserB,restoredA,browserHome};})()`);
 assert.equal(result.browserHome,false,'home must not inherit the previous chat browser pane');assert.equal(result.browserA,true,'chat A opens its browser pane');assert.equal(result.browserB,false,'chat B must not inherit an empty browser pane');assert.equal(result.restoredA,true,'returning to A restores its pane');assert.equal(result.blank,0,JSON.stringify(result));assert.equal(result.session,'#session/switch-b');assert.equal(result.raceSession,'#session/switch-a');console.log('PASS actual app session switching: cold/warm history, delayed API, no blank rendered frames',result);
 }finally{w.close();await daemon.stop();fs.rmSync(data,{recursive:true,force:true});}app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
