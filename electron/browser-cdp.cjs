const { createNetworkPolicy } = require('./browser-network-policy.cjs');

// CDP access is restricted to website WebContents in IntegratedBrowser.tabs.
// No Electron remote-debugging port is opened for the application UI.
class BrowserCDP {
  constructor(browser) { this.browser=browser; this.owners=new Map(); this.pausedOwners=new Set(); this.events=()=>{}; this.networkPolicy=createNetworkPolicy(); this.networkSessions=new WeakSet(); }
  guardNetwork(wc) {
    if(this.networkSessions.has(wc.session)) return;
    this.networkSessions.add(wc.session);
    wc.session.webRequest.onBeforeRequest((details, callback) => {
      const tab=[...this.owners.keys()].find(id=>this.browser.tabs.get(id)?.webContents.id===details.webContentsId);
      if(tab===undefined) { callback({cancel:false}); return; }
      const owner=this.owners.get(tab);
      Promise.resolve().then(()=>this.networkPolicy(details.url)).then(allowed=>{
        // A stop or changed lease during DNS checking cancels the pending request.
        callback({cancel:!allowed || this.owners.get(tab)!==owner || this.browser.computer.haltedOwners.has(owner)});
      },()=>callback({cancel:true}));
    });
  }
  async configureProxy(wc,proxyUrl){
    if(!proxyUrl)return;
    const url=new URL(proxyUrl);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password)throw Error('Invalid scoped proxy');
    if(wc.session.__ohmytProxy===proxyUrl)return;
    if([...this.owners.keys()].some(id=>this.browser.tabs.get(id)?.webContents.session===wc.session))throw Error('This browser profile already has an active run.');
    await wc.session.setProxy({mode:'fixed_servers',proxyRules:proxyUrl,proxyBypassRules:'<-loopback>'});
    await wc.session.closeAllConnections();wc.session.__ohmytProxy=proxyUrl;
  }
  target(tabId) {
    const view=this.browser.tabs.get(tabId);
    const wc=view?.browserPreview ? null : view?.webContents;
    if(!wc || wc.isDestroyed() || (!/^https?:\/\//.test(wc.getURL()) && wc.getURL()!=='about:blank')) throw new Error('CDP requires a website tab in the browser pane.');
    return wc;
  }
  check(tabId,owner) {
    const wc=this.target(tabId);
    if(this.browser.embedded && !this.browser.paneOpen) throw new Error('Open the browser pane to continue.');
    if(this.pausedOwners.has(owner))throw Error('Browser control is paused.');
    if(this.owners.get(tabId)!==owner || this.browser.computer.haltedOwners.has(owner)) throw new Error('CDP control was revoked.');
    return {targetId:String(tabId),type:'page',title:wc.getTitle(),url:wc.getURL(),attached:true,canAccessOpener:false};
  }
  async attach(tabId,owner,domains,proxyUrl,chatId) {
    const wc=this.target(tabId), current=this.owners.get(tabId);
    if(chatId && this.browser.tabs.get(tabId)?.chatId!==chatId)throw Error('Browser profile belongs to another chat.');
    if(chatId && this.browser.chatId!==chatId)throw Error('Open this chat browser pane first.');
    if(this.browser.computer.haltedOwners.has(owner)) throw new Error('User stopped this browser run.');
    if(current && current!==owner) throw new Error('Browser tab belongs to another run.');
    if(this.browser.embedded && !this.browser.paneOpen) throw new Error('Open the browser pane before using Browser Use.');
    await this.configureProxy(wc,proxyUrl);
    this.guardNetwork(wc);
    if(!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    if(!current) {
      this.owners.set(tabId,owner);this.browser.computer.externalOwners.set(tabId,owner);
      const listener=(_event,method,params,sessionId)=>this.events({owner,tabId,method,params,sessionId});
      wc.debugger.on('message',listener);
      wc.__ohmytCDPListener=listener;
      if (domains) {
        wc.__ohmytDomains=domains;
        const navigation=(event,url)=>{
          if(this.browser.computer.haltedOwners.has(owner)) return;
          try { if(!domains.includes(new URL(url).hostname)) event.preventDefault(); } catch { event.preventDefault(); }
        };
        wc.on('will-navigate',navigation);wc.on('will-redirect',navigation);wc.__ohmytCDPNavigation=navigation;
      }
      wc.once('destroyed',()=>{this.owners.delete(tabId);this.browser.computer.externalOwners.delete(tabId);});
    }
    this.browser.select(tabId);this.browser.publish();
    return {targetId:String(tabId),type:'page',title:wc.getTitle(),url:wc.getURL(),attached:true,canAccessOpener:false};
  }
  async pause(tabId,owner){if(this.owners.get(tabId)!==owner||this.browser.computer.haltedOwners.has(owner))throw Error('Browser control revoked.');this.pausedOwners.add(owner);this.browser.computer.externalOwners.delete(tabId);this.browser.computer.snapshots.delete(tabId);await this.browser.cursor.clear(this.browser.tabs.get(tabId)?.webContents);return {paused:true};}
  resume(tabId,owner,domains){
    const wc=this.target(tabId);if(this.owners.get(tabId)!==owner||this.browser.computer.haltedOwners.has(owner))throw Error('Browser control revoked.');
    if(!domains?.includes(new URL(wc.getURL()).hostname))throw Error('Authentication left allowed domains.');
    this.pausedOwners.delete(owner);this.browser.computer.externalOwners.set(tabId,owner);this.check(tabId,owner);return {paused:false};
  }
  async command({tabId,owner,method,params={},sessionId}) {
    const wc=this.target(tabId);
    if(this.pausedOwners.has(owner))throw Error('Browser control is paused.');
    if(this.owners.get(tabId)!==owner || this.browser.computer.haltedOwners.has(owner)) throw new Error('CDP control was revoked.');
    if(typeof method!=='string' || !/^[A-Za-z]+\.[A-Za-z]+$/.test(method)) throw new Error('Invalid CDP method.');
    // Root lifecycle and target discovery are implemented by the scoped daemon proxy.
    if(/^(Browser\.(close|crash)|Storage\.)/.test(method) || (method.startsWith('Target.') && method!=='Target.setAutoAttach')) throw new Error('Global CDP command denied.');
    if(method==='Page.navigate') {
      const url=new URL(params.url);if(!['http:','https:'].includes(url.protocol)) throw new Error('Only website navigation is allowed.');
    }
    if(method==='Input.dispatchMouseEvent') {
      const movement={x:params.x,y:params.y,kind:params.type==='mousePressed'?'down':params.type==='mouseWheel'?'scroll':params.buttons?'drag':'move',instant:params.type==='mouseReleased'||params.type==='mousePressed'||Boolean(params.buttons)};
      // Never wait for renderer JS while a CDP button is held: Chromium may defer
      // its evaluation until release. Send release/drag input without that wait.
      if(params.type==='mouseReleased'||params.buttons)void this.browser.cursor.move(wc,movement,()=>this.check(tabId,owner)).catch(()=>{});
      else await this.browser.cursor.move(wc,movement,()=>this.check(tabId,owner));
    }
    if(method==='Input.dispatchMouseEvent'){const types={mousePressed:'mouseDown',mouseReleased:'mouseUp',mouseMoved:'mouseMove',mouseWheel:'mouseWheel'};const queue=this.browser.computer.expected.get(tabId)||[];queue.push({type:types[params.type],x:Math.round(params.x*wc.getZoomFactor()),y:Math.round(params.y*wc.getZoomFactor()),expiresAt:Date.now()+1000});if(queue.length>50)queue.shift();this.browser.computer.expected.set(tabId,queue);}
    if(method==='Input.dispatchKeyEvent' && params.type!=='char') {
      const queue=this.browser.computer.expected.get(tabId)||[];queue.push({type:params.type==='keyUp'?'keyUp':'keyDown',key:params.key||params.code,expiresAt:Date.now()+1000});if(queue.length>50)queue.shift();this.browser.computer.expected.set(tabId,queue);
    }
    if(method==='Input.insertText'||method==='Input.dispatchKeyEvent'&&params.type==='keyDown')await this.browser.cursor.focus(wc,'typing',()=>this.check(tabId,owner));
    this.check(tabId,owner);
    if(method==='Page.captureScreenshot')return this.browser.cursor.hidden(wc,()=>wc.debugger.sendCommand(method,params,sessionId));
    return wc.debugger.sendCommand(method,params,sessionId);
  }
  async release(owner) {
    const clearing=[];
    this.pausedOwners.delete(owner);
    for(const [tabId,current] of this.owners) if(current===owner) {
      const wc=this.browser.tabs.get(tabId)?.webContents;
      if(wc && !wc.isDestroyed()) {
        if(wc.__ohmytCDPListener) wc.debugger.removeListener('message',wc.__ohmytCDPListener);
        delete wc.__ohmytCDPListener;delete wc.__ohmytDomains;
        if(wc.__ohmytCDPNavigation){wc.removeListener('will-navigate',wc.__ohmytCDPNavigation);wc.removeListener('will-redirect',wc.__ohmytCDPNavigation);delete wc.__ohmytCDPNavigation;}
        if(wc.debugger.isAttached()) wc.debugger.detach();
        clearing.push(this.browser.cursor.clear(wc));
      }
      this.owners.delete(tabId);this.browser.computer.externalOwners.delete(tabId);this.browser.computer.expected.delete(tabId);
    }
    this.browser.publish();await Promise.all(clearing);
  }
}
module.exports={BrowserCDP};
