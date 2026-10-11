import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

// Per-run CDP bridge. Only website tabs from BrowserBridge are visible. The
// Electron application, controls, HTML previews and unrelated WebContents are absent.
export class BrowserUseCDP {
  constructor(bridge, { runId, sessionId, domains, signal, proxyUrl }) {
    if (!bridge) throw new Error('Browser Use integrated mode requires the desktop browser pane.');
    this.bridge=bridge;this.runId=runId;this.sessionId=sessionId;this.domains=domains;
    this.proxyUrl=proxyUrl;
    this.owner=`${sessionId}:${runId}`;this.signal=signal;this.targets=new Map();this.childTargets=new Map();this.sessions=new Map();this.clients=new Set();this.closed=false;this.uploads=new Set();
    this.server=http.createServer((_req,res)=>{res.writeHead(403);res.end();});
    this.wss=new WebSocketServer({noServer:true,maxPayload:8*1024*1024});
    this.token=randomBytes(32).toString('hex');
    this.server.on('upgrade',(req,socket,head)=>{
      if(this.closed || req.url!==`/${this.token}` || req.headers.origin || req.headers.host!==`127.0.0.1:${this.server.address()?.port}`){socket.destroy();return;}
      this.wss.handleUpgrade(req,socket,head,ws=>this.wss.emit('connection',ws,req));
    });
    this.wss.on('connection',ws=>{
      this.clients.add(ws);ws.on('close',()=>this.clients.delete(ws));ws.on('error',()=>{});
      ws.on('message',raw=>void this.receive(ws,raw));
    });
    this.eventListener=event=>this.event(event);
  }
  allowed(url) {
    if(url==='about:blank')return true;
    try {const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&this.domains.includes(u.hostname);}catch{return false;}
  }
  async start(tabId) {
    if(!this.bridge.nativeCommand)throw new Error('Browser Use integrated mode requires the desktop browser pane.');
    await this.bridge.prepareSession(this.sessionId,this.signal);
    const observedTabs=this.bridge.status(this.sessionId).tabs;
    const tabs=observedTabs.filter(t=>this.allowed(t.url));
    const active=await this.bridge.nativeCommand('cdp.active', {});
    const selected=tabId===undefined?(tabs.find(t=>t.id===active.tabId)||tabs[0]):tabs.find(t=>t.id===tabId);
    if(!selected) {
      const hosts=observedTabs.map(tab=>{try{return `${tab.id}:${new URL(tab.url).hostname}`;}catch{return `${tab.id}:unknown`;}});
      const error=new Error(`Không tìm thấy tab thuộc tên miền cho phép (${this.domains.join(', ')}). Tab website đang mở: ${hosts.join(', ') || 'không có'}. Gọi browser_tabs để kiểm tra; mở đúng trang trong khung Chrome trước khi xuất PDF. Không tự điều hướng sang trang khác khi người dùng yêu cầu xuất trang đang mở.`);
      error.code='NO_ALLOWED_TAB';
      error.recovery={nextAction:'browser_tabs',retryMutation:false,mutationOutcomeUnknown:false};
      throw error;
    }
    await this.attach(selected.id);
    this.bridge.cdpListeners.add(this.eventListener);
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});
    this.url=`ws://127.0.0.1:${this.server.address().port}/${this.token}`;
    return this.url;
  }
  async attach(tabId) {
    const lease=this.bridge.computerLeases.get(tabId);
    if(lease && lease.runId!==this.runId)throw new Error('Browser tab is leased by another run.');
    this.bridge.computerLeases.set(tabId,{runId:this.runId,sessionId:this.sessionId});
    const info=await this.bridge.nativeCommand('cdp.attach',{tabId,owner:this.owner,domains:this.domains,proxyUrl:this.proxyUrl,chatId:this.sessionId},this.signal);
    this.targets.set(String(tabId),{...info,attached:true});
    return info;
  }
  async pause(){for(const target of this.targets.keys())await this.bridge.nativeCommand('cdp.pause',{tabId:Number(target),owner:this.owner},this.signal);}
  async resume(){for(const target of this.targets.keys())await this.bridge.nativeCommand('cdp.resume',{tabId:Number(target),owner:this.owner,domains:this.domains},this.signal);await this.assertControl();}
  async assertControl() {
    for (const targetId of this.targets.keys()) {
      const info = await this.bridge.nativeCommand('cdp.check', { tabId: Number(targetId), owner: this.owner }, this.signal);
      if (!this.allowed(info.url)) throw new Error('Browser tab left the configured domains.');
      this.targets.set(targetId, info);
    }
  }
  send(ws,value){if(ws.readyState===1)ws.send(JSON.stringify(value));}
  broadcast(value){for(const ws of this.clients)this.send(ws,value);}
  async receive(ws,raw) {
    let request;
    try {request=JSON.parse(raw);if(!Number.isSafeInteger(request.id)||typeof request.method!=='string')throw Error('Invalid request');
      const result=await this.command(request.method,request.params||{},request.sessionId);
      this.send(ws,{id:request.id,result,...(request.sessionId?{sessionId:request.sessionId}:{})});
    } catch {if(request?.id!==undefined)this.send(ws,{id:request.id,error:{code:-32000,message:'Scoped browser CDP command failed or was denied'},...(request.sessionId?{sessionId:request.sessionId}:{})});}
  }
  async command(method,params,sessionId) {
    if(this.closed || this.signal?.aborted)throw Error('Browser control stopped');
    if(method==='Target.getTargets')return {targetInfos:[...this.targets.values(),...this.childTargets.values()]};
    if(method==='Target.getTargetInfo'){const target=params.targetId ? (this.targets.get(params.targetId)||this.childTargets.get(params.targetId)) : this.targets.values().next().value;if(!target)throw Error('Unknown target');return {targetInfo:target};}
    if(method==='Target.setDiscoverTargets'){for(const info of this.targets.values())this.broadcast({method:'Target.targetCreated',params:{targetInfo:info}});return {};}
    if(method==='Target.attachToTarget') {
      const info=this.targets.get(params.targetId)||this.childTargets.get(params.targetId);if(!info)throw Error('Target outside browser pane');
      if(this.childTargets.has(params.targetId)){const sid=[...this.sessions].find(([,session])=>session.childTargetId===params.targetId)?.[0];if(!sid)throw Error('Child target detached');this.broadcast({method:'Target.attachedToTarget',params:{sessionId:sid,targetInfo:info,waitingForDebugger:false}});return {sessionId:sid};}
      let sid=[...this.sessions].find(([,s])=>s.targetId===params.targetId&&!s.childSession)?.[0];
      if(!sid){sid=randomUUID();this.sessions.set(sid,{targetId:params.targetId});}
      this.broadcast({method:'Target.attachedToTarget',params:{sessionId:sid,targetInfo:info,waitingForDebugger:false}});
      return {sessionId:sid};
    }
    if(method==='Target.setAutoAttach' && !sessionId){for(const targetId of this.targets.keys())await this.command('Target.attachToTarget',{targetId});return {};}
    if(method==='Target.detachFromTarget'){this.sessions.delete(params.sessionId);return {};}
    if(method==='Target.activateTarget'){const info=this.targets.get(params.targetId);if(!info)throw Error('Unknown target');await this.bridge.nativeCommand('cdp.attach',{tabId:Number(info.targetId),owner:this.owner},this.signal);return {};}
    if(method==='Target.createTarget') {
      if(!this.allowed(params.url))throw Error('Destination denied');
      const {tabId}=await this.bridge.nativeCommand('cdp.new',{url:params.url,owner:this.owner,chatId:this.sessionId,proxyUrl:this.proxyUrl},this.signal);
      const info=await this.attach(tabId);this.broadcast({method:'Target.targetCreated',params:{targetInfo:info}});
      await this.command('Target.attachToTarget',{targetId:info.targetId});return {targetId:info.targetId};
    }
    if(method==='Target.closeTarget') {
      if(!this.targets.has(params.targetId))throw Error('Unknown target');
      await this.bridge.nativeCommand('cdp.close',{tabId:Number(params.targetId),owner:this.owner},this.signal);this.targets.delete(params.targetId);for(const [sid,session] of this.sessions)if(session.targetId===params.targetId){if(session.childTargetId)this.childTargets.delete(session.childTargetId);this.sessions.delete(sid);}
      this.broadcast({method:'Target.targetDestroyed',params:{targetId:params.targetId}});return {success:true};
    }
    if(method==='Browser.close' || method==='Browser.setDownloadBehavior' || method==='Browser.resetPermissions' || method==='Browser.setPermission' || method==='Browser.setWindowBounds')return {};
    if(method==='Browser.getWindowForTarget')return {windowId:Number(params.targetId)||Number(this.targets.keys().next().value),bounds:{left:0,top:0,width:1280,height:800,windowState:'normal'}};
    if(method==='Browser.getWindowBounds')return {bounds:{left:0,top:0,width:1280,height:800,windowState:'normal'}};
    if (method.startsWith('Browser.') && method !== 'Browser.getVersion') throw Error('Global browser command denied');
    if (['Network.getAllCookies', 'Network.clearBrowserCookies', 'Network.clearBrowserCache', 'Network.setCookies'].includes(method)) throw Error('Global network storage command denied');
    const session=this.sessions.get(sessionId), target=session?.targetId||this.targets.keys().next().value;
    if(sessionId && !session || !this.targets.has(target))throw Error('Unknown scoped session');
    if(session?.childTargetId){const childUrl=this.childTargets.get(session.childTargetId)?.url;const bootstrap=childUrl===''&&['Runtime.runIfWaitingForDebugger','Runtime.enable','Page.enable','DOM.enable','Network.enable','Target.setAutoAttach'].includes(method);if(!bootstrap&&!this.allowed(childUrl))throw Error('Child frame domain denied');}
    if(method.startsWith('Target.') && !session)throw Error('Global target command denied');
    if(method==='Page.navigate' && !this.allowed(params.url))throw Error('Destination denied');
    if(method==='DOM.setFileInputFiles') {
      if(!Array.isArray(params.files) || params.files.length!==1 || !this.uploads.has(params.files[0])) throw Error('File not explicitly staged for this run');
      this.uploads.delete(params.files[0]);
    }
    if(method==='Network.getCookies') params={urls:[this.targets.get(target).url]};
    if(method==='Page.navigateToHistoryEntry') {
      const history=await this.bridge.nativeCommand('cdp.send',{tabId:Number(target),owner:this.owner,method:'Page.getNavigationHistory',params:{}},this.signal);
      if(!this.allowed(history.entries.find(e=>e.id===params.entryId)?.url)) throw Error('History destination denied');
    }
    if(method.startsWith('Storage.')) {
      // Browser-wide storage APIs are never forwarded into Electron.
      if(method==='Storage.getCookies')return this.bridge.nativeCommand('cdp.send',{tabId:Number(target),owner:this.owner,method:'Network.getCookies',params:{urls:[this.targets.get(target).url]}},this.signal);
      throw Error('Global storage command denied');
    }
    return this.bridge.nativeCommand('cdp.send',{tabId:Number(target),owner:this.owner,method,params,sessionId:session?.childSession},this.signal);
  }
  event(event) {
    if(event.owner!==this.owner || this.closed)return;
    const targetId=String(event.tabId);
    if(event.method==='Page.frameNavigated' && !event.sessionId && !event.params?.frame?.parentId) {
      const info=this.targets.get(targetId);
      if(info) { info.url=event.params.frame.url;this.broadcast({method:'Target.targetInfoChanged',params:{targetInfo:info}}); }
    }
    if(event.method==='Page.frameNavigated'&&event.sessionId){const child=[...this.sessions.values()].find(session=>session.childSession===event.sessionId);const info=this.childTargets.get(child?.childTargetId);if(info&&(!event.params?.frame?.parentId||event.params.frame.id===child.childTargetId))info.url=event.params.frame.url;}
    const parent=[...this.sessions].find(([,s])=>s.targetId===targetId&&!s.childSession)?.[0];
    if(!parent)return;
    // Never forward browser-global target discovery out of an attached page.
    if(event.method==='Target.targetCreated' || event.method==='Target.targetInfoChanged'){const info=event.params?.targetInfo;if(info&&this.childTargets.has(info.targetId))this.childTargets.set(info.targetId,info);return;}
    const params={...event.params};let sid=parent;
    if(event.sessionId){sid=`${parent}:${event.sessionId}`;if(!this.sessions.has(sid))return;}
    if(event.method==='Target.attachedToTarget') {
      if(!['iframe','worker'].includes(params.targetInfo?.type)||!(params.targetInfo?.url===''||this.allowed(params.targetInfo?.url))){void this.bridge.nativeCommand('cdp.send',{tabId:Number(targetId),owner:this.owner,method:'Runtime.runIfWaitingForDebugger',params:{},sessionId:params.sessionId},this.signal).catch(()=>{});return;}
      const child=`${parent}:${params.sessionId}`;this.sessions.set(child,{targetId,childSession:params.sessionId,childTargetId:params.targetInfo.targetId});this.childTargets.set(params.targetInfo.targetId,params.targetInfo);params.sessionId=child;
    }
    if(event.method==='Target.detachedFromTarget'){const session=[...this.sessions].find(([,value])=>value.childSession===params.sessionId);if(session){this.childTargets.delete(session[1].childTargetId);params.sessionId=session[0];this.sessions.delete(session[0]);}}
    this.broadcast({method:event.method,params,...(['Target.attachedToTarget','Target.detachedFromTarget'].includes(event.method)?{}:{sessionId:sid})});
  }
  async close() {
    if(this.closed)return;this.closed=true;this.bridge.cdpListeners.delete(this.eventListener);
    for(const ws of this.clients)ws.terminate();this.wss.close();
    if(this.server.listening)await new Promise(resolve=>this.server.close(resolve));
    await this.bridge.nativeCommand?.('cdp.release',{owner:this.owner}).catch(()=>{});
    this.bridge.releaseRun(this.runId);
  }
}
