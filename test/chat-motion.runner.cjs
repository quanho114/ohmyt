const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
app.whenReady().then(async()=>{
 const host=new BrowserWindow({width:1200,height:800,show:false,webPreferences:{backgroundThrottling:false}});
 try {
  await host.loadURL(process.env.CHAT_MOTION_URL);
  for(let i=0;i<300;i++){
   if(await host.webContents.executeJavaScript('Boolean(window.fixture && document.querySelector(".conversation-feed"))'))break;
   await new Promise(r=>setTimeout(r,50));
  }
  const result=await host.webContents.executeJavaScript(`(async()=>{
   const f=window.fixture, wait=ms=>new Promise(r=>setTimeout(r,ms));
   const scroller=()=>document.querySelector('.chat-scroller');
   const frames=[], start=performance.now();let previous=start, measuring=true;
   const tick=now=>{frames.push(now-previous);previous=now;if(measuring)requestAnimationFrame(tick);};requestAnimationFrame(tick);
   await wait(500);f.commits.length=0;f.live(true);
   const samples=[];
   for(const rate of [10,30,60,120]){
    let target='';const begin=performance.now();
    for(let i=0;i<20;i++){target+='word ';f.setContent(target);await wait(1000/rate);}
    await wait(180);
    samples.push({rate,targetLength:target.length,visibleLength:document.querySelector('.message-response.is-streaming')?.textContent.length??0,elapsedMs:performance.now()-begin});
    await wait(200);
   }
   const s=scroller();s.dispatchEvent(new WheelEvent('wheel',{deltaY:-200,bubbles:true}));s.scrollTop-=250;s.dispatchEvent(new Event('scroll'));
   const readingTop=s.scrollTop;f.setContent('New output. '.repeat(80));await wait(350);
   const readingDrift=s.scrollTop-readingTop;
   f.live(false);await wait(150);
   const switches=[];
   for(const n of [1,2,3,4,0]){const begin=performance.now();f.session(n);await new Promise(requestAnimationFrame);switches.push(performance.now()-begin);}
   measuring=false;
   const sorted=frames.slice().sort((a,b)=>a-b), commits=f.commits.slice().sort((a,b)=>a-b);
   return {samples,readingDrift,frameP95Ms:sorted[Math.floor(sorted.length*.95)],framesOver25Ms:frames.filter(x=>x>25).length,totalFrames:frames.length,commitP95Ms:commits[Math.floor(commits.length*.95)],switchesMs:switches,domNodes:document.querySelectorAll('*').length,heapBytes:performance.memory?.usedJSHeapSize??null};
  })()`);
  if(process.env.CHAT_MOTION_CHECKS==='1') {
   const {checkChatMotion}=await import('./chat-motion.checks.js');
   result.checks=await host.webContents.executeJavaScript(`(${checkChatMotion.toString()})()`);
  }
  fs.writeFileSync(process.env.CHAT_MOTION_OUTPUT,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 } finally {host.destroy();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
