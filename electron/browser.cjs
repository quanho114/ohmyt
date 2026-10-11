const {BrowserWindow, WebContentsView, View, ipcMain} = require('electron');
const path = require('path');
const {BrowserCursor}=require('./browser-cursor.cjs');
const {BrowserComputer} = require('./browser-computer.cjs');
const {pageAction} = require('./browser-page.cjs');
const {BrowserCDP}=require('./browser-cdp.cjs');
const {BrowserFiles}=require('./browser-files.cjs');
class IntegratedBrowser {
  constructor() { this.tabs=new Map(); this.chatId=null; this.active=null; this.window=null; this.embedded=false; this.bounds=null; this.controls=null; this.expanded=false; this.cursor=new BrowserCursor();this.computer=new BrowserComputer(this);
    this.cdp=new BrowserCDP(this);this.files=new BrowserFiles(this);
    ipcMain.handle('browser-ui',async(event,action,value)=>{
      if(event.sender!==this.window?.webContents && event.sender!==this.controls?.webContents && event.sender!==this.actions?.webContents) throw new Error('Unknown browser window');
      if(['select','new','close','navigate','back','forward','reload'].includes(action))this.computer.stop(this.active);
      if(action==='files' && this.embedded) this.window.webContents.send('browser-files-open');
      if(action==='stop') this.computer.stop(this.active);
      if(action==='expand' && this.embedded) {this.expanded=!this.expanded;this.window.webContents.send('browser-pane-expand',this.expanded);this.publish();}
      if(action==='new') this.add(value||'https://www.google.com');
      if(action==='select') this.select(value);
      if(action==='close') this.remove(value);
      let wc=this.tabs.get(this.active)?.webContents;
      if(action==='navigate') {
        const target=this.url(value);
        // A chat can have no tabs even while other chats retain theirs.
        if(!wc) wc=this.tabs.get(this.addTab('about:blank')).webContents;
        await this.navigate(wc,target);
      }
      if(action==='back' && wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
      if(action==='forward' && wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
      if(action==='reload') wc?.reload();
      return this.state();
    });
  }
  setChat(chatId) {
    if(chatId!==null && (typeof chatId!=='string'||!chatId||chatId.length>200))throw Error('Invalid browser chat');
    if(this.chatId===chatId)return;
    this.clearResize();
    this.expanded=false;
    if(this.embedded)this.window.webContents.send('browser-pane-expand',false);
    for(const view of this.tabs.values())void this.cursor.clear(view.webContents);
    this.chatId=chatId;
    this.active=[...this.tabs].find(([,v])=>v.chatId===chatId)?.[0]??null;
    for(const [id,view] of this.tabs)view.setVisible(id===this.active && Boolean(this.bounds));
    if(this.active!==null)this.select(this.active);else this.publish();
  }
  partition(chatId=this.chatId){return 'persist:ohmyt-browser-'+require('node:crypto').createHash('sha256').update(chatId??'unassigned').digest('hex');}
  url(value) {
    const text=String(value).trim();
    if(!text) return 'https://www.google.com';
    const explicit=/^[a-z][a-z0-9+.-]*:\/\//i.test(text);
    const address=/^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+|\[[0-9a-f:]+\])(?::\d+)?(?:[/?#]\S*)?$/i.test(text);
    const url=new URL(explicit ? text : address ? ( /^(?:localhost|127\.0\.0\.1|\[::1\])(?::|[/?#]|$)/i.test(text) ? 'http://' : 'https://')+text : 'https://www.google.com/search?q='+encodeURIComponent(text));
    if(!['http:','https:'].includes(url.protocol)) throw new Error('Chỉ hỗ trợ địa chỉ HTTP/HTTPS.');
    return url.href;
  }

  open() {
    if(this.window) {this.window.show();this.window.focus();return;}
    this.window=new BrowserWindow({width:1100,height:800,title:'Trình duyệt ohmyt',webPreferences:{preload:path.join(__dirname,'browser-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    this.window.loadFile(path.join(__dirname,'browser.html'));
    this.window.on('resize',()=>this.layout());
    this.window.on('closed',()=>{for(const view of this.tabs.values())view.webContents.close();this.tabs.clear();this.active=null;this.window=null;});
    this.window.webContents.on('did-finish-load',()=>this.publish());
    this.add('https://www.google.com');
  }
  attach(host, bounds, paneOpen = Boolean(bounds)) {
    if (!this.embedded) {
      this.window=host; this.embedded=true;
      this.frame=new View();
      this.frame.setBorderRadius(12);
      host.contentView.addChildView(this.frame);
      this.controls=new WebContentsView({webPreferences:{preload:path.join(__dirname,'browser-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
      this.controls.setBackgroundColor('#00000000');
      this.controls.setBorderRadius(12);
      // Extend the native toolbar below its 84px content. The page covers the
      // bottom 12px, so the native rounding only appears on the top corners.
      this.controls.webContents.loadFile(path.join(__dirname,'browser.html'),{query:{toolbar:'main'}});
      this.controls.webContents.on('did-finish-load',()=>this.publish());
      // Right-side buttons live in a fixed-size native surface. Chromium's
      // asynchronous viewport resize must not move them with the old width.
      this.actions=new WebContentsView({webPreferences:{preload:path.join(__dirname,'browser-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
      this.actions.setBackgroundColor('#00000000');
      this.actions.setBorderRadius(12);
      host.contentView.addChildView(this.actions);
      this.actions.webContents.loadFile(path.join(__dirname,'browser.html'),{query:{toolbar:'actions'}});
      this.actions.webContents.on('did-finish-load',()=>this.publish());
      host.on('closed',()=>{this.clearResize();for(const v of this.tabs.values())v.webContents.close();this.controls.webContents.close();this.actions.webContents.close();this.tabs.clear();this.window=null;});
    }
    if(!bounds)this.clearResize();
    this.bounds=bounds;this.paneOpen=paneOpen;
    if(!this.frame.children.includes(this.controls))this.frame.addChildView(this.controls);
    if(this.frame.getVisible()!==Boolean(bounds))this.frame.setVisible(Boolean(bounds));
    if(this.controls.getVisible()!==Boolean(bounds))this.controls.setVisible(Boolean(bounds));
    if(this.actions.getVisible()!==Boolean(bounds))this.actions.setVisible(Boolean(bounds));
    for(const [id,view] of this.tabs){
      if(!this.frame.children.includes(view))this.frame.addChildView(view);
      const visible=Boolean(bounds)&&id===this.active;
      if(view.getVisible()!==visible)view.setVisible(visible);
    }
    if(!bounds)return;
    // Other chats can own retained tabs while this chat has none.
    // Opening its pane must create a tab for the current chat.
    if(this.active===null && paneOpen)this.add('https://www.google.com');
    this.layout();
  }

  async navigate(wc,url) {
    try { await wc.loadURL(url); }
    catch(error) {
      if(error.code==='ERR_ABORTED'||error.errno===-3)return {interrupted:true};
      throw new Error('Không tải được trang. Kiểm tra địa chỉ hoặc kết nối mạng rồi thử lại.');
    }
    return {success:true};
  }
  add(url) { return this.addTab(this.url(url)); }
  addPreview(content) { return this.addTab(require('./html-preview.cjs').htmlPreviewUrl(content), true); }
  async openPreview(content, chatId=this.chatId) {
    const safe=require('./html-preview.cjs').htmlPreviewUrl(content);
    this.setChat(chatId);
    const id=this.addTab(safe,true,chatId);
    await this.tabs.get(id).loadPromise;
    return id;
  }
  addTab(safe, preview = false, chatId=this.chatId) {
    const view=new WebContentsView({webPreferences:{partition:preview ? `preview-${require('node:crypto').randomUUID()}` : this.partition(chatId),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    view.browserPreview=preview;view.chatId=chatId;
    const wc=view.webContents;this.tabs.set(wc.id,view);if(!preview)this.files.watch(wc);
    wc.on('before-mouse-event',(_event,input)=>this.computer.input(wc.id,input));
    wc.on('before-input-event',(_event,input)=>this.computer.input(wc.id,input));
    wc.on('did-start-navigation',()=>{this.computer.invalidate(wc.id);void this.cursor.clear(wc);});
    wc.setUserAgent(wc.getUserAgent().replace(/\sElectron\/\S+/g,'').replace(/\sohmyt\/\S+/gi,''));
    wc.setWindowOpenHandler(({url})=>{if(wc.__ohmytDomains){try{if(!wc.__ohmytDomains.includes(new URL(url).hostname))return {action:'deny'};}catch{return {action:'deny'};}}if(/^https?:\/\//.test(url))this.addTab(this.url(url),false,view.chatId);return {action:'deny'};});
    wc.on('will-navigate',(event,url)=>{if(!/^https?:\/\//.test(url))event.preventDefault();});
    for(const event of ['did-navigate','did-navigate-in-page','page-title-updated','did-stop-loading']) wc.on(event,()=>this.publish());
    wc.on('did-fail-load',(_e,code,_description,url,isMainFrame)=>{if(code!==-3 && isMainFrame){view.loadError={url,message:'Không tải được trang. Kiểm tra kết nối và thử tải lại.'};this.publish();}});
    wc.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame){view.loadError=null;this.publish();}});
    this.select(wc.id);view.loadPromise=wc.loadURL(safe);view.loadPromise.catch(()=>{});return wc.id;
  }
  select(id) {
    this.clearResize();
    if(!this.tabs.has(id))return;
    this.active=id;
    for(const [tabId,view] of this.tabs){
      const parent=this.frame || this.window.contentView;
      if(!parent.children.includes(view))parent.addChildView(view);
      view.setVisible(view.chatId===this.chatId&&tabId===id&&(!this.embedded||Boolean(this.bounds)));
    }
    this.layout();this.publish();
  }
  remove(id) {if(id===this.active)this.clearResize();this.computer.stop(id);this.computer.expected.delete(id);const view=this.tabs.get(id);if(!view)return;if(id===this.active)(this.frame || this.window.contentView).removeChildView(view);this.tabs.delete(id);view.webContents.close();if(id===this.active){this.active=null;if([...this.tabs.values()].some(v=>v.chatId===this.chatId))this.select([...this.tabs].find(([,v])=>v.chatId===this.chatId)[0]);else if(this.embedded)this.window.webContents.send('browser-pane-close');else this.window.close();}this.publish();}
  setViewBounds(view,bounds) {
    if(!view)return;
    const previous=view.getBounds();
    if(['x','y','width','height'].every(key=>previous[key]===bounds[key]))return;
    view.setBounds(bounds);
  }
  clearResize() {
    this.resizeGeneration=(this.resizeGeneration||0)+1;
    const motion=this.resizeMotion;
    this.resizeMotion=null;
    if(motion){if(motion.overlay)this.frame?.removeChildView(motion.overlay);if(motion.contents && !motion.contents.isDestroyed())motion.contents.close();}
  }
  async beginResize(targetWidth) {
    this.clearResize();
    const generation=this.resizeGeneration;
    const page=this.tabs.get(this.active);
    if(!this.bounds || !page)return false;
    const current=page.getBounds();
    // Freeze the live viewport synchronously, before the first animated bounds
    // arrive. Capturing and decoding the cover may then run in parallel.
    const motion={page,targetWidth,canvasWidth:Math.max(current.width,targetWidth),prepared:false};
    this.resizeMotion=motion;
    let image;
    try{image=await page.webContents.capturePage();}catch(error){if(this.resizeMotion===motion){this.clearResize();this.layout();}throw error;}
    if(generation!==this.resizeGeneration || page!==this.tabs.get(this.active) || !this.bounds)return false;
    const overlay=new WebContentsView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const contents=overlay.webContents;
    overlay.setBackgroundColor('#00000000');
    const canvasWidth=Math.max(current.width,targetWidth);
    overlay.setBounds({x:0,y:84,width:canvasWidth,height:current.height});
    const pixel=image.toBitmap();
    const background=pixel.length>=4?`rgb(${pixel[2]},${pixel[1]},${pixel[0]})`:'#fff';
    const html=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${background}}body{display:flex;align-items:flex-start;justify-content:center}img{width:${current.width}px;height:${current.height}px;flex:none}</style><img src="${image.toDataURL()}">`;
    try {
      await contents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
      await Promise.race([contents.executeJavaScript('document.querySelector("img").decode()'),new Promise(resolve=>setTimeout(resolve,50))]);
      if(generation!==this.resizeGeneration || page!==this.tabs.get(this.active) || !this.bounds){contents.close();return false;}
      Object.assign(motion,{overlay,contents});
      this.frame.addChildView(overlay);
      this.layout();
      // Paint the cover before resizing the real page underneath it.
      await contents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if(this.resizeMotion?.overlay!==overlay)return false;
      this.resizeMotion.prepared=true;
      this.layout();
      return true;
    } catch(error) {
      if(this.resizeMotion?.overlay===overlay)this.clearResize();
      else if(!contents.isDestroyed())contents.close();
      throw error;
    }
  }
  async finishResize() {
    const motion=this.resizeMotion;
    if(!motion)return;
    if(!motion.contents){this.clearResize();this.layout();return;}
    if(motion.contents.isDestroyed())return;
    // The page has had the full animation to paint its final viewport.
    await motion.contents.executeJavaScript(`new Promise(resolve=>{
      document.documentElement.style.transition='opacity 100ms ease-out';
      document.documentElement.style.opacity='0';
      setTimeout(resolve,120);
    })`).catch(()=>{});
    if(this.resizeMotion===motion){this.clearResize();this.layout();}
  }
  layout(){
    if(!this.window)return;
    if(this.embedded){
      if(!this.bounds)return;
      const {x,y,width,height}=this.bounds;
      // Resize children in local coordinates, then relocate one native container.
      this.setViewBounds(this.controls,{x:0,y:0,width,height:96});
      const motion=this.resizeMotion;
      const pageWidth=motion?.prepared?motion.targetWidth:motion?motion.page.getBounds().width:width;
      this.setViewBounds(this.tabs.get(this.active),{x:Math.round((width-pageWidth)/2),y:84,width:pageWidth,height:Math.max(0,height-84)});
      if(motion?.overlay)this.setViewBounds(motion.overlay,{x:Math.round((width-motion.canvasWidth)/2),y:84,width:motion.canvasWidth,height:Math.max(0,height-84)});
      this.setViewBounds(this.frame,{x,y,width,height});
      const actionCount=1+Number(Boolean(this.features?.canFiles))+Number(this.state().computerBusy);
      const actionWidth=16+32*actionCount+4*(actionCount-1);
      this.setViewBounds(this.actions,{x:x+width-actionWidth,y,width:actionWidth,height:40});
      return;
    }
    const [width,height]=this.window.getContentSize();
    this.setViewBounds(this.tabs.get(this.active),{x:0,y:84,width,height:Math.max(0,height-84)});
  }
  state(){const owner=this.computer.busy.get(this.active)||this.computer.externalOwners.get(this.active);return {features:this.features,computerBusy:Boolean(owner && !this.computer.haltedOwners.has(owner)),expanded:this.expanded,active:this.active,canGoBack:Boolean(this.tabs.get(this.active)?.webContents.navigationHistory.canGoBack()),canGoForward:Boolean(this.tabs.get(this.active)?.webContents.navigationHistory.canGoForward()),tabs:[...this.tabs.values()].filter(v=>v.chatId===this.chatId).map(v=>({id:v.webContents.id,title:v.webContents.getTitle()||'Tab mới',url:v.webContents.getURL().startsWith('data:text/html') ? 'Preview HTML' : v.webContents.getURL(),error:v.loadError||null,loading:v.webContents.isLoading()}))};}
  publish(){if(this.embedded)this.layout();const state=this.state();(this.controls?.webContents||this.window?.webContents)?.send('browser-state',state);this.actions?.webContents.send('browser-state',state);}
  async command(action,args) {
    if(action==='open') {
      if(!this.embedded || !this.window || this.window.isDestroyed())throw Error('Trình duyệt desktop chưa sẵn sàng.');
      if(!args.chatId || args.chatId!==this.chatId)throw Error('Hãy mở cuộc trò chuyện này trước khi mở website.');
      const url=new URL(args.url);
      if(!['http:','https:'].includes(url.protocol))throw Error('Chỉ hỗ trợ địa chỉ HTTP/HTTPS.');
      const tabId=this.addTab(url.href,false,args.chatId);
      this.window.webContents.send('browser-pane-open',args.chatId);
      await this.tabs.get(tabId).loadPromise;
      const view=this.tabs.get(tabId);
      if(!view || view.webContents.isDestroyed())throw Error('Tab đã đóng.');
      return {tabId,url:view.webContents.getURL(),title:view.webContents.getTitle()};
    }
    if(action==='files.capture_start')return this.files.captureStart(args);
    if(action==='files.capture_result')return this.files.captureResult(args);
    if(action==='files.cancel')return this.files.cancel(args);
    if(action==='files.pdf')return this.files.pdf(args);
    if(action==='files.download')return this.files.download(args);
    if(action==='cdp.pause')return this.cdp.pause(args.tabId,args.owner);
    if(action==='cdp.resume')return this.cdp.resume(args.tabId,args.owner,args.domains);
    if(action==='cdp.active')return {tabId:this.active};
    if(action==='cdp.new'){if(args.chatId && args.chatId!==this.chatId)throw Error('Open this chat browser pane first.');if(args.url!=='about:blank')this.url(args.url);const tabId=this.addTab('about:blank');await this.cdp.configureProxy(this.tabs.get(tabId).webContents,args.proxyUrl);const load=this.tabs.get(tabId).webContents.loadURL(args.url);await load;const wc=this.tabs.get(tabId).webContents;if(wc.isLoading())await new Promise((resolve,reject)=>{wc.once('did-finish-load',resolve);wc.once('did-fail-load',(_event,code)=>{if(code!==-3)reject(new Error('Cannot load new browser tab.'));});});return {tabId};}
    if(action==='cdp.close'){if(this.cdp.owners.get(args.tabId)!==args.owner)throw new Error('CDP owner mismatch.');this.computer.externalOwners.delete(args.tabId);this.computer.snapshots.delete(args.tabId);this.cdp.owners.delete(args.tabId);this.remove(args.tabId);return {success:true};}
    if(action==='cdp.check')return this.cdp.check(args.tabId,args.owner);
    if(action==='cdp.attach')return this.cdp.attach(args.tabId,args.owner,args.domains,args.proxyUrl,args.chatId);
    if(action==='cdp.send')return this.cdp.command(args);
    if(action==='cdp.release'){await this.cdp.release(args.owner);return {success:true};}
    if(action==='tabs')return [...this.tabs.values()].filter(v=>v.chatId===(args.chatId??this.chatId)).map(v=>({id:v.webContents.id,title:v.webContents.getTitle(),url:v.webContents.getURL()})).filter(t=>!this.tabs.get(t.id)?.browserPreview && /^https?:\/\//.test(t.url));
    if(args.chatId && this.tabs.get(args.tabId)?.chatId!==args.chatId)throw Error('Browser tab belongs to another chat.');
    const wc=this.tabs.get(args.tabId)?.webContents;if(!wc||wc.isDestroyed())throw new Error('Tab đã đóng.');
    if(!/^https?:\/\//.test(wc.getURL()))throw new Error('Tab không phải website HTTP/HTTPS.');
    if(action==='observe')return this.computer.observe(args.tabId,args.computerOwner);
    if(action==='act')return this.computer.act(args,args.computerOwner);
    args={...args,expectedOrigin:new URL(wc.getURL()).origin};
    if(action==='navigate'){const url=new URL(args.url);if(!['http:','https:'].includes(url.protocol))throw new Error('Chỉ hỗ trợ HTTP/HTTPS.');return this.navigate(wc,url.href);}
    if(!['read','click','type','scroll'].includes(action))throw new Error('Thao tác không hỗ trợ.');
    if(action==='type' && (typeof args.text!=='string'||args.text.length>10000))throw new Error('Văn bản không hợp lệ.');
    if(['click','type','scroll'].includes(action)){
      if(this.computer.busy.has(wc.id))throw Error('Tab đang thực hiện thao tác khác.');
      const owner=args.computerOwner;const original=wc.getURL();const check=()=>{if(wc.isDestroyed()||wc.getURL()!==original||owner&&this.computer.haltedOwners.has(owner))throw Error('Đã dừng thao tác trình duyệt.');};
      this.computer.busy.set(wc.id,owner);this.publish();
      try{
        const point=await wc.executeJavaScriptInIsolatedWorld(999,[{code:`(()=>{const e=globalThis.__ohmytElements?.get(${JSON.stringify(args.elementId)});if(!e?.isConnected)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`}]);
        if(point)await this.cursor.move(wc,{...point,kind:action==='type'?'typing':'move'},check);
        if(action==='scroll')await this.cursor.move(wc,{x:Math.min(120,this.tabs.get(wc.id).getBounds().width/2),y:140,kind:'scroll'},check);
        if(action==='click'&&point)await this.cursor.move(wc,{...point,kind:'down',instant:true},check);
        check();const result=await wc.executeJavaScriptInIsolatedWorld(999,[{code:`(${pageAction.toString()})(${JSON.stringify(action)},${JSON.stringify(args)})`}]);
        if(result?.__ohmytError)throw new Error(result.__ohmytError);return result;
      }finally{if(owner&&this.computer.haltedOwners.has(owner))await this.cursor.clear(wc);this.computer.busy.delete(wc.id);this.publish();}
    }
    const result=await wc.executeJavaScriptInIsolatedWorld(999,[{code:`(${pageAction.toString()})(${JSON.stringify(action)},${JSON.stringify(args)})`}]);
    if(result?.__ohmytError)throw new Error(result.__ohmytError);return result;
  }
}
module.exports={IntegratedBrowser};
