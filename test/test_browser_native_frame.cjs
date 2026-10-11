const {app,BrowserWindow,nativeImage}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {IntegratedBrowser}=require('../electron/browser.cjs');
app.whenReady().then(async()=>{
 const host=new BrowserWindow({x:0,y:0,width:900,height:650,frame:false,show:true});
 await host.loadURL('data:text/html,<style>html,body{margin:0;background:rgb(255,0,255)}</style>');
 const browser=new IntegratedBrowser();browser.attach(host,{x:400,y:30,width:480,height:580});
 await browser.tabs.get(browser.active).webContents.loadURL('data:text/html,<style>html,body{background:rgb(32,100,180)}</style>');
 if(browser.controls.webContents.isLoading())await new Promise(r=>browser.controls.webContents.once('did-finish-load',r));
 const capture=async()=>{
  require('node:child_process').execFileSync('python3',['-c',"from PIL import ImageGrab; ImageGrab.grab().save('/tmp/ohmyt-native-desktop.png')"]);
  return nativeImage.createFromPath('/tmp/ohmyt-native-desktop.png');
 };
 await new Promise(r=>setTimeout(r,150));
 const image=await capture();fs.writeFileSync('/tmp/ohmyt-native-rounded-frame.png',image.toPNG());
 const color=(shot,x,y)=>{const b=shot.toBitmap(),width=shot.getSize().width;return [...b.subarray((y*width+x)*4,(y*width+x)*4+3)];};
 assert.deepEqual(color(image,879,30),[255,0,255],'top-right native corner must expose parent background');
 for(const x of [260,400,260,400]){
  browser.attach(host,{x,y:30,width:880-x,height:580});
  const shot=await capture();
  assert.deepEqual(color(shot,860,300),[180,100,32],'composited native browser must stay painted');
 }
 const target={x:400,y:30,width:480,height:580};
 browser.attach(host,target);
 const page=browser.tabs.get(browser.active),pageBounds=page.getBounds();
 let pageWrites=0;
 const pageSet=page.setBounds.bind(page);
 page.setBounds=b=>{pageWrites++;return pageSet(b);};
 let frameWrites=0;
 const frameSet=browser.frame.setBounds.bind(browser.frame);
 browser.frame.setBounds=b=>{frameWrites++;return frameSet(b);};
 for(let toggle=0;toggle<8;toggle++){
  browser.attach(host,null,false);
  assert.equal(browser.frame.getVisible(),false,'close must hide immediately without waiting for animation');
  browser.attach(host,target,true);
  assert.equal(browser.frame.getVisible(),true,'open must show immediately at final geometry');
  assert.deepEqual(browser.frame.getBounds(),target);
 }
 await new Promise(r=>setTimeout(r,200));
 assert.deepEqual(browser.frame.getBounds(),target,'no delayed animation may move the frame after toggling');
 assert.equal(browser.frame.getVisible(),true,'no delayed callback may hide the reopened frame');
 assert.deepEqual(page.getBounds(),pageBounds);
 assert.equal(pageWrites,0,'toggle must not resize web content');
 assert.equal(frameWrites,0,'toggle must not animate native position in timer steps');
 console.log('PASS native toggles: immediate visibility, no deferred hide or geometry changes');
 console.log('PASS desktop capture: native corner clipping and composited browser paint on resize');
 host.close();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
