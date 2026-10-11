const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const {IntegratedBrowser}=require('../electron/browser.cjs');
app.whenReady().then(async()=>{
 const host=new BrowserWindow({width:1200,height:800,show:true,frame:false});
 await host.loadURL('data:text/html,<body>Host</body>');
 const browser=new IntegratedBrowser();
 browser.attach(host,{x:280,y:30,width:900,height:700});
 const page=browser.tabs.get(browser.active);
 await page.webContents.loadURL('data:text/html,'+encodeURIComponent('<style>body{background:#fff}h1{text-align:center}p{max-width:500px;margin:auto}</style><h1>Centered content</h1><p>Responsive content should not continuously reflow during pane motion.</p>'));
 await page.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 await new Promise(resolve=>setTimeout(resolve,100));
 let widthWrites=0;
 const write=page.setBounds.bind(page);
 page.setBounds=next=>{if(next.width!==page.getBounds().width)widthWrites++;return write(next);};
 const capture=page.webContents.capturePage.bind(page.webContents);
 let releaseCapture;
 const gate=new Promise(resolve=>{releaseCapture=resolve;});
 page.webContents.capturePage=async()=>{await gate;return capture();};
 const preparing=browser.beginResize(480);
 const actionBounds=browser.actions.getBounds();
 for(const width of [880,840,800]){
  browser.attach(host,{x:1180-width,y:30,width,height:700});
  assert.equal(browser.frame.getBounds().width,width,'pane must move immediately while capture is still pending');
  assert.equal(page.getBounds().width,900,'pending preparation must already freeze page reflow');
  assert.deepEqual(browser.actions.getBounds(),actionBounds,'pending capture must not delay or move buttons');
 }
 releaseCapture();
 await preparing;
 page.webContents.capturePage=capture;
 browser.attach(host,{x:700,y:30,width:480,height:700});
 await browser.finishResize();
 for(const targetWidth of [900,480,900,480]){
  const before=widthWrites;
  assert.equal(await browser.beginResize(targetWidth),true);
  const motion=browser.resizeMotion;
  assert.equal(page.getBounds().width,targetWidth);
  assert(await motion.overlay.webContents.executeJavaScript('document.querySelector("img").complete && document.querySelector("img").naturalWidth>0'),'motion cover image must be decoded');
  const pixels=(await motion.overlay.webContents.capturePage()).toBitmap();
  assert(pixels.some((value,index)=>index%4!==3 && value<100),'cover must contain captured page text, not an empty frame');
  const from=browser.bounds.width;
  for(let step=0;step<=20;step++){
   const width=Math.round(from+(targetWidth-from)*step/20);
   browser.attach(host,{x:1180-width,y:30,width,height:700});
   assert.equal(page.getBounds().width,targetWidth,'real page viewport must stay fixed during every animation frame');
   assert.equal(motion.overlay.getBounds().width,Math.max(from,targetWidth),'snapshot viewport must stay fixed');
  }
  assert.equal(widthWrites-before,1,'real page must resize exactly once per transition');
  assert.deepEqual((await motion.overlay.webContents.capturePage()).toBitmap(),pixels,'covered page pixels must not reflow during animation');
  await browser.finishResize();
  assert.equal(browser.resizeMotion,null);
  assert.equal(page.getBounds().x,0);
  assert.equal(page.getBounds().width,targetWidth);
 }
 await browser.beginResize(480);
 const overlay=browser.resizeMotion.overlay;
 browser.attach(host,null,false);
 assert.equal(browser.resizeMotion,null,'closing pane must dispose motion cover');
 assert(!browser.frame.children.includes(overlay),'closing must detach the motion cover from the native hierarchy');
 console.log('PASS native page motion: one viewport resize per transition, fixed snapshot pixels, final live page, cover cleanup');
 host.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
