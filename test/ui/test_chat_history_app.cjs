const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-history-'));app.setPath('userData',path.join(temp,'electron'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',dataDir:temp,port:0});
 daemon.db.createSession('history',daemon.db.getAgents()[0].id,'Lịch sử hội thoại');
 for(let i=0;i<12;i++){
  daemon.db.addMessage(`u${i}`,'history','user',`Câu hỏi ${i+1}: Kiểm tra tài liệu giúp tui`);
  daemon.db.addMessage(`a${i}`,'history','agent','Đây là nội dung kiểm tra.\n\n'+('Thông tin cần xem lại trong tài liệu. '.repeat(25)));
 }
 const {port}=await daemon.start();const window=new BrowserWindow({width:1400,height:920,show:true});
 const ui=code=>window.webContents.executeJavaScript(code);
 const wait=async(code)=>{const until=Date.now()+12000;while(!await ui(code)){if(Date.now()>until)throw Error('UI condition failed: '+code);await new Promise(r=>setTimeout(r,40));}};
 try{
  await window.loadURL(`http://127.0.0.1:${port}/#session/history`);
  await wait(`document.querySelectorAll('.chat-history-mark').length===12`);
  await ui(`document.querySelector('.chat-history-mark').focus()`);
  await wait(`!!document.querySelector('.chat-history-preview')`);
  await ui(`document.querySelector('.chat-history-mark').click()`);
  await wait(`document.querySelector('.chat-scroller').scrollTop<30`);
  const bounds=await ui(`(()=>{const a=document.querySelector('.chat-history').getBoundingClientRect(),b=document.querySelector('.chat-composer-region').getBoundingClientRect();return {end:a.bottom,composer:b.top};})()`);
  assert(bounds.end<bounds.composer,'Rail must stay above composer');
  assert.equal(await ui(`document.querySelectorAll('.chat-history-return').length`),0);
  const jumpBounds=await ui(`(()=>{const a=document.querySelector('.chat-jump-bottom').getBoundingClientRect(),b=document.querySelector('.chat-composer-region').getBoundingClientRect();return {gap:b.top-a.bottom,center:Math.abs((a.left+a.right)/2-(b.left+b.right)/2)};})()`);
  assert(jumpBounds.gap>=0 && jumpBounds.gap<=16,'Latest arrow must sit just above composer');
  assert(jumpBounds.center<2,'Latest arrow must be centered above composer');
  await ui(`document.querySelector('button[aria-controls="document-workspace"]').click()`);
  await wait(`document.querySelector('#document-workspace')?.getBoundingClientRect().width>100`);
  await new Promise(r=>setTimeout(r,350));
  await ui(`document.activeElement?.blur()`);
  await ui(`document.querySelector('.chat-history-mark').focus()`);
  await wait(`!!document.querySelector('.chat-history-preview')`);
  const fits=await ui(`(()=>{const a=document.querySelector('.chat-history-preview').getBoundingClientRect(),b=document.querySelector('.chat-scroller').getBoundingClientRect();return a.right<=b.right;})()`);
  assert(fits,'Preview must stay inside chat when Files is open');
  await new Promise(r=>setTimeout(r,250));
  fs.writeFileSync('/tmp/ohmyt-chat-history-app.png',(await window.webContents.capturePage()).toPNG());
  console.log('PASS actual chat: turn targets, preview, jump, composer clearance and Files layout');
 }finally{window.destroy();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
