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
  await wait(`document.querySelector('.home-view .island-life')?.dataset.waterLoaded==='true'`);
  await js(`(()=>{window.__seaPreparations=0;const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...args){if(args[2]===960&&args[3]===640)window.__seaPreparations++;return read.apply(this,args);};})()`);
  const homeTime=await js(`Number(document.querySelector('.home-view .island-life').dataset.time)`);
  await js(`(()=>{const field=document.querySelector('.home-view textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Bản nháp cần giữ');field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await js(`document.querySelector('.island-launch').click()`);
  const firstDetail=await js(`new Promise(resolve=>requestAnimationFrame(()=>{const c=document.querySelector('.island-game .island-life');resolve(c?{loaded:c.dataset.loaded,water:c.dataset.waterLoaded,time:Number(c.dataset.time)}:null);}))`);
  assert(firstDetail?.loaded==='true'&&firstDetail?.water==='true','detail paints decoded wildlife and prepared waves on its first frame');
  assert(firstDetail.time>=homeTime,'detail continues the existing wave phase');
  await wait(`!!document.querySelector('.island-game')`);
  assert.equal(await js(`document.activeElement.className`),'island-game');
  await wait(`document.querySelector('.island-game .island-life')?.dataset.loaded==='true'`);
  await wait(`document.querySelector('.island-game .island-life')?.dataset.waterLoaded==='true'`);
  assert.equal(await js(`window.__seaPreparations`),0,'opening detail reuses the prepared ocean instead of scanning the map on the click path');
  const waterPatch=`(()=>{const c=document.querySelector('.island-game .island-life');return [...c.getContext('2d').getImageData(Math.floor(c.width*.52),Math.floor(c.height*.70),40,20).data].join(',');})()`;
  const waterBefore=await js(waterPatch);
  let waterChanged=false;
  for(let i=0;i<40&&!waterChanged;i++){
   await new Promise(resolve=>setTimeout(resolve,50));
   waterChanged=await js(waterPatch)!==waterBefore;
  }
  assert(waterChanged,'open water visibly refracts and waves travel without boat movement: '+JSON.stringify(await js(`({focused:document.hasFocus(),hidden:document.hidden,paused:!!document.querySelector('.island-pause'),mode:document.querySelector('.island-sea').dataset.mode,reduced:document.querySelector('.island-sea').dataset.reduced})`)));
  assert(await js(`(()=>{const c=document.querySelector('.island-game .island-life'),p=c.getContext('2d').getImageData(Math.floor(c.width*.435),Math.floor(c.height*.13),6,6).data;return [...p].filter((_,i)=>i%4===3).every(a=>a===0);})()`),'water effects leave the island rock untouched');
  await js(`(()=>{const canvas=document.querySelector('.island-game .island-life'),b=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:b.left+b.width*.19,clientY:b.top+b.height*.665,bubbles:true}));})()`);
  await wait(`document.querySelector('.island-game .island-life').dataset.reacting.includes('shark')`);
  assert((await js(`document.querySelector('.island-discovery').textContent`)).includes('Cá mập'),'the continuously swimming shark retains its click response');
  await js(`(()=>{const canvas=document.querySelector('.island-game .island-life'),b=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:b.left+b.width*.875,clientY:b.top+b.height*.205,bubbles:true}));})()`);
  await wait(`document.querySelector('.island-game .island-life').dataset.reacting.includes('dinosaur')`);
  assert((await js(`document.querySelector('.island-discovery').textContent`)).includes('Khủng long'),'clicking a creature gives its own response');
  await js(`document.querySelector('[aria-label="Tạm dừng hải trình"]').click()`);
  await new Promise(resolve=>setTimeout(resolve,150));
  const still=await js(`document.querySelector('.island-game .island-life').toDataURL()`);
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(await js(`document.querySelector('.island-game .island-life').toDataURL()`),still,'paused wildlife and water stay still');
  const pauseStyle=await js(`(()=>{const s=getComputedStyle(document.querySelector('.island-pause button'));return {color:s.color,background:s.backgroundColor};})()`);
  assert.equal(pauseStyle.color,'rgb(23, 73, 64)','pause resume button uses readable sea-teal text');
  assert.equal(pauseStyle.background,'rgb(230, 244, 241)','pause resume button uses soft seafoam surface');
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
  const detailTime=await js(`Number(document.querySelector('.island-game .island-life').dataset.time)`);
  await w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  await wait(`!document.querySelector('.island-game')`);
  await wait(`document.activeElement.classList.contains('island-launch')`);
  assert.equal(await js(`document.querySelector('.home-view textarea').value`),'Bản nháp cần giữ','exit preserves composer draft');
  assert.equal(await js(`window.__seaPreparations`),0,'returning Home also reuses the prepared texture');
  assert(await js(`Number(document.querySelector('.home-view .island-life').dataset.time)` )>=detailTime,'returning Home preserves the wave phase');
  await js(`window.location.hash='#session/sea-entry-regression'`);
  await wait(`!document.querySelector('.home-view')`);
  await js(`document.querySelector('[aria-label="Trang chủ"]').click()`);
  const firstHome=await js(`new Promise(resolve=>requestAnimationFrame(()=>{const c=document.querySelector('.home-view .island-life');resolve(c?{loaded:c.dataset.loaded,water:c.dataset.waterLoaded,time:Number(c.dataset.time)}:null);}))`);
  assert(firstHome?.loaded==='true'&&firstHome?.water==='true','Home paints waves and wildlife immediately after route remount');
  assert(firstHome.time>=detailTime,'Home remount does not restart the waves');
  assert.equal(await js(`window.__seaPreparations`),0,'Home route remount does not rescan the map');
  w.webContents.debugger.attach('1.3');
  await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await wait(`document.querySelector('.island-sea').dataset.reduced==='true'`);
  await new Promise(resolve=>setTimeout(resolve,150));
  const reduced=await js(`document.querySelector('.island-life').toDataURL()`);
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(await js(`document.querySelector('.island-life').toDataURL()`),reduced,'reduced motion freezes water and wildlife');
  await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});
  w.webContents.debugger.detach();
  await wait(`document.querySelector('.island-sea').dataset.reduced==='false'`);
  const initialSize=w.getContentSize();
  for(const width of [1432,1024,600,390]){
   w.setContentSize(width,900);
   await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
   await js(`(()=>{const summary=document.querySelector('.island-mode-menu>summary');summary.focus();summary.click();})()`);
   await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
   const options=await js(`(()=>{const home=document.querySelector('.home-view').getBoundingClientRect();return [...document.querySelectorAll('.island-mode-options button')].map(button=>{const b=button.getBoundingClientRect();return {label:button.textContent,visible:b.left>=home.left&&b.right<=home.right&&b.top>=home.top&&b.bottom<=home.bottom,uncovered:[.1,.5,.9].every(x=>button.contains(document.elementFromPoint(b.left+b.width*x,b.top+b.height/2)))};});})()`);
   for(const option of options){
    assert(option.visible,`${option.label} stays inside Home at ${width}px`);
    assert(option.uncovered,`${option.label} is clickable above Home content at ${width}px`);
   }
   if(process.env.OHMYT_ISLAND_MENU_SCREENSHOT&&width===1432)fs.writeFileSync(process.env.OHMYT_ISLAND_MENU_SCREENSHOT,(await w.webContents.capturePage()).toPNG());
   await w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
   await wait(`!document.querySelector('.island-mode-menu').open`);
  }
  w.setContentSize(...initialSize);
  await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await js(`document.querySelector('.island-mode-menu').open=true;document.querySelectorAll('.island-mode-options button')[2].click()`);
  await wait(`!document.querySelector('.island-map')`);
  assert(await js(`!!document.querySelector('.home-view')`));
  console.log('PASS Island Sea: real assets, launch, keyboard sailing, journal, exit/focus, disable');
 }finally{w.close();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
