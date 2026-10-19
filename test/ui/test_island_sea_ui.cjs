const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-settings-'));
app.setPath('userData',path.join(temp,'user'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,dataDir:temp});
 const {port}=await daemon.start();
 const w=new BrowserWindow({width:1853,height:1050,show:true});
 const js=source=>w.webContents.executeJavaScript(source);
 try{
  await w.loadURL(`http://127.0.0.1:${port}/`);
  const deadline=Date.now()+25000;
  const wait=async expression=>{while(!await js(expression)){if(Date.now()>deadline)throw new Error('Timeout: '+expression);await new Promise(resolve=>setTimeout(resolve,50));}};
  await wait(`!!document.querySelector('.island-launch')`);
  if(process.env.OHMYT_ISLAND_HOME){w.show();await new Promise(resolve=>setTimeout(resolve,300));fs.writeFileSync(process.env.OHMYT_ISLAND_HOME,(await w.webContents.capturePage()).toPNG());}
  await wait(`document.querySelector('.island-map')?.complete && document.querySelector('.island-map')?.naturalWidth>0`);
  assert.equal(await js(`document.querySelectorAll('.island-game').length`),0);
  const edges=await js(`(()=>{const home=document.querySelector('.home-view').getBoundingClientRect(),image=document.querySelector('.island-map').getBoundingClientRect();return {left:Math.abs(home.left-image.left),right:Math.abs(home.right-image.right)};})()`);
  assert(edges.left<1&&edges.right<1,'sea artwork spans the full Home panel without a scrollbar gap');
  assert.equal(await js(`getComputedStyle(document.querySelector('.island-map')).objectFit`),'fill','image paints the entire box without colored side bars');
  const offsets=await js(`[...document.querySelectorAll('.island-launch,.island-mode-menu>summary')].map(button=>{const b=button.getBoundingClientRect(),icon=button.querySelector('svg').getBoundingClientRect();return {x:Math.abs(b.left+b.width/2-icon.left-icon.width/2),y:Math.abs(b.top+b.height/2-icon.top-icon.height/2)};})`);
  for(const offset of offsets){assert(offset.x<.6&&offset.y<.6,'toolbar icon is centered inside its hit area');}
  await js(`(()=>{const field=document.querySelector('.home-view textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Bản nháp cần giữ');field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await js(`document.querySelector('.island-launch').click()`);
  await wait(`!!document.querySelector('.island-game')`);
  assert.equal(await js(`document.activeElement.className`),'island-game');
  await wait(`document.querySelector('.island-game .island-life')?.dataset.loaded==='true'`);
  await js(`(()=>{const canvas=document.querySelector('.island-game .island-life'),b=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:b.left+b.width*.875,clientY:b.top+b.height*.205,bubbles:true}));})()`);
  await wait(`document.querySelector('.island-game .island-life').dataset.reacting.includes('dinosaur')`);
  assert((await js(`document.querySelector('.island-discovery').textContent`)).includes('Khủng long'),'clicking a creature gives its own response');
  await js(`document.querySelector('[aria-label="Tạm dừng hải trình"]').click()`);
  await new Promise(resolve=>setTimeout(resolve,150));
  const still=await js(`document.querySelector('.island-game .island-life').toDataURL()`);
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(await js(`document.querySelector('.island-game .island-life').toDataURL()`),still,'paused wildlife and water stay still');
  await js(`document.querySelector('.island-pause button').click()`);
  if(process.env.OHMYT_ISLAND_SCREENSHOT){w.show();await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(process.env.OHMYT_ISLAND_SCREENSHOT,(await w.webContents.capturePage()).toPNG());}
  await w.webContents.sendInputEvent({type:'keyDown',keyCode:'D'});
  await new Promise(resolve=>setTimeout(resolve,600));
  await w.webContents.sendInputEvent({type:'keyUp',keyCode:'D'});
  const x=await js(`parseFloat(document.querySelector('.island-game .island-boat').style.left)`);
  assert(x>50,'keyboard moves the boat');
  assert(Number(await js(`document.querySelector('.island-game .island-life').dataset.foam`))>0,'moving boat leaves real foam particles');
  await w.webContents.sendInputEvent({type:'keyDown',keyCode:'W'});
  await new Promise(resolve=>setTimeout(resolve,1400));
  await w.webContents.sendInputEvent({type:'keyUp',keyCode:'W'});
  await w.webContents.sendInputEvent({type:'keyDown',keyCode:'A'});
  await new Promise(resolve=>setTimeout(resolve,300));
  await w.webContents.sendInputEvent({type:'keyUp',keyCode:'A'});
  await w.webContents.sendInputEvent({type:'keyDown',keyCode:'E'});
  await w.webContents.sendInputEvent({type:'keyUp',keyCode:'E'});
  assert((await js(`JSON.parse(localStorage.getItem('ohmyt-island-journal-v1')||'{}').discoveries?.length`))>=1,'sailing and interaction persist a discovery');
  await wait(`document.querySelector('.island-game .island-life').dataset.reacting.includes('birds')`);
  await js(`document.querySelector('.island-game-header nav button').click()`);
  assert(await js(`!!document.querySelector('.island-journal')`));
  await js(`document.querySelector('.island-journal header button').click()`);
  await w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  await wait(`!document.querySelector('.island-game')`);
  await wait(`document.activeElement.classList.contains('island-launch')`);
  assert.equal(await js(`document.querySelector('.home-view textarea').value`),'Bản nháp cần giữ','exit preserves composer draft');
  await js(`document.querySelector('.island-mode-menu').open=true;document.querySelectorAll('.island-mode-options button')[2].click()`);
  await wait(`!document.querySelector('.island-map')`);
  assert(await js(`!!document.querySelector('.home-view')`));
  console.log('PASS Island Sea: real assets, launch, keyboard sailing, journal, exit/focus, disable');
 }finally{w.close();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
