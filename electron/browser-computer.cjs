const crypto = require('node:crypto');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
class BrowserComputer {
  constructor(browser) { this.browser=browser; this.snapshots=new Map(); this.observing=new Map(); this.busy=new Map(); this.stopped=new Set(); this.expected=new Map(); this.haltedOwners=new Set(); this.externalOwners=new Map(); }
  input(tabId, input) {
    const queue=(this.expected.get(tabId)||[]).filter(e=>!e.expiresAt || e.expiresAt>Date.now());this.expected.set(tabId,queue);
    const index=queue.findIndex(e=>e.type===input.type && (!e.keyCode || e.keyCode.toLowerCase()===String(input.key || '').replace(/^Arrow/,'').toLowerCase() || e.keyCode.toLowerCase()===String(input.code || '').replace(/^Key/,'').toLowerCase()) && (e.x===undefined || Math.abs(e.x-input.x)<=0.51 && Math.abs(e.y-input.y)<=0.51));
    if(index>=0){queue.splice(index,1);return;}
    if(['mouseDown','keyDown'].includes(input.type)) this.stop(tabId);
  }
  emit(wc,event) {
    const queue=this.expected.get(wc.id)||[];queue.push({...event,expiresAt:Date.now()+1000});if(queue.length>50)queue.shift();this.expected.set(wc.id,queue);
    wc.sendInputEvent(event);
  }
  stop(tabId) { void this.browser.cursor.clear(this.browser.tabs.get(tabId)?.webContents);this.stopped.add(tabId); const owner=this.busy.get(tabId)||this.observing.get(tabId)||this.externalOwners.get(tabId)||this.snapshots.get(tabId)?.owner;if(owner)this.haltedOwners.add(owner);if(this.haltedOwners.size>200)this.haltedOwners.delete(this.haltedOwners.values().next().value);this.snapshots.delete(tabId); }
  invalidate(tabId) { this.snapshots.delete(tabId); }
  async pageState(wc) {
    return wc.executeJavaScriptInIsolatedWorld(998,[{code:`(()=>{if(!globalThis.__ohmytObservation){const state={revision:0};new MutationObserver(records=>{if(records.some(r=>!(r.target.id==='__ohmyt_cursor'||[...r.addedNodes,...r.removedNodes].every(n=>n.id==='__ohmyt_cursor')&&r.type==='childList')))state.revision++}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});addEventListener('scroll',()=>state.revision++,true);globalThis.__ohmytObservation=state;}return {revision:globalThis.__ohmytObservation.revision,scrollX,scrollY}})()`}]);
  }
  async observe(tabId, owner) {
    const view=this.browser.tabs.get(tabId), wc=view?.webContents;
    if(!wc || wc.isDestroyed()) throw new Error('Tab đã đóng.');
    if(this.browser.embedded && !this.browser.bounds) throw new Error('Mở khung trình duyệt để AI quan sát.');
    if(this.haltedOwners.has(owner)) throw new Error('Người dùng đã dừng điều khiển cho tác vụ này.');
    if(this.busy.has(tabId) && this.busy.get(tabId)!==owner) throw new Error('Tab đang được điều khiển bởi tác vụ khác.');
    if(this.busy.size && !this.busy.has(tabId)) throw new Error('Trình duyệt đang thực hiện thao tác khác.');
    if(this.observing.has(tabId)) throw new Error('Tab đang được quan sát.');
    this.observing.set(tabId,owner);
    try {
    this.browser.select(tabId);
    const bounds=view.getBounds(), url=wc.getURL(), zoom=wc.getZoomFactor();
    await pause(80);
    const pageState=await this.pageState(wc);
    const mask=await wc.insertCSS('input[type="password"],input[autocomplete*="password"],input[autocomplete*="cc-"],input[autocomplete="one-time-code"],input[name*="token" i],input[name*="secret" i],input[name*="otp" i],[data-ohmyt-sensitive],iframe{visibility:hidden!important}');
    let image;try{image=await this.browser.cursor.hidden(wc,()=>wc.capturePage());}finally{await wc.removeInsertedCSS(mask);}

    if(JSON.stringify(pageState)!==JSON.stringify(await this.pageState(wc))) throw new Error('Trang thay đổi trong lúc chụp; hãy quan sát lại.');
    if(url!==wc.getURL() || bounds.width!==view.getBounds().width || bounds.height!==view.getBounds().height) throw new Error('Trang thay đổi trong lúc chụp; hãy quan sát lại.');
    const size=image.getSize();
    const width=Math.min(1280,size.width), height=Math.round(size.height*width/size.width);
    if(!width || !height) throw new Error('Viewport trống.');
    const dataUrl='data:image/jpeg;base64,'+image.resize({width,height}).toJPEG(80).toString('base64');
    if(dataUrl.length>5600000) throw new Error('Ảnh viewport quá lớn.');
    const snapshot={snapshotId:crypto.randomUUID(),tabId,url,width,height,viewportWidth:bounds.width,viewportHeight:bounds.height,zoom,pageState,capturedAt:Date.now(),owner};
    if(this.haltedOwners.has(owner)) throw new Error('Người dùng đã dừng điều khiển cho tác vụ này.');
    this.snapshots.set(tabId,snapshot);
    return {...snapshot,owner:undefined,loading:wc.isLoading(),image:{name:'browser-viewport.jpg',dataUrl}};
    } finally { this.observing.delete(tabId); }
  }
  async act(args, owner) {
    const {tabId,snapshotId,action}=args, view=this.browser.tabs.get(tabId), wc=view?.webContents;
    const s=this.snapshots.get(tabId);
    if(!wc || wc.isDestroyed()) throw new Error('Tab đã đóng.');
    if(this.busy.has(tabId)) throw new Error('Tab đang thực hiện thao tác khác.');
    const b=view.getBounds();
    if(!s || s.snapshotId!==snapshotId || s.owner!==owner || Date.now()-s.capturedAt>30000 || s.url!==wc.getURL() || b.width!==s.viewportWidth || b.height!==s.viewportHeight || s.zoom!==wc.getZoomFactor()) throw new Error('Snapshot đã cũ; dùng browser_observe trước khi thao tác.');
    if(JSON.stringify(s.pageState)!==JSON.stringify(await this.pageState(wc))) throw new Error('Snapshot đã cũ; trang đã thay đổi.');
    if(!['move','click','scroll','type','keypress','drag'].includes(action)) throw new Error('Thao tác không hỗ trợ.');
    const point=(x,y)=>{
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=s.width||y>=s.height) throw new Error('Tọa độ ngoài ảnh viewport.');
      return {x:Math.floor(x*s.viewportWidth/s.width),y:Math.floor(y*s.viewportHeight/s.height)};
    };
    let p;
    if(['move','click','scroll','drag'].includes(action)) p=point(args.x,args.y);
    const end=action==='drag'?point(args.endX,args.endY):null;
    if(action==='click' && (args.button!==undefined && !['left','right'].includes(args.button) || args.clickCount!==undefined && ![1,2].includes(args.clickCount))) throw new Error('Click không hợp lệ.');
    if(action==='scroll' && (!Number.isFinite(args.deltaY)||Math.abs(args.deltaY)>2000)) throw new Error('Khoảng cuộn không hợp lệ.');
    if(action==='type' && (typeof args.text!=='string'||args.text.length>10000)) throw new Error('Văn bản không hợp lệ.');
    if(action==='keypress' && !['Enter','Tab','Escape','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Control+A','Control+C','Control+V','Control+Z'].includes(args.key)) throw new Error('Phím không hỗ trợ.');
    if(['click','type','keypress','drag'].includes(action)) {
      const blocked=await wc.executeJavaScriptInIsolatedWorld(998,[{code:`(()=>{const e=${p ? `document.elementFromPoint(${p.x/s.zoom},${p.y/s.zoom})` : 'document.activeElement'};return Boolean(e && (e.matches('input[type=password],input[autocomplete*=cc-],input[autocomplete=current-password],input[autocomplete=new-password]') || e.closest('[data-ohmyt-sensitive]')))})()`}]);
      if(blocked) throw new Error('Trường nhạy cảm cần người dùng thao tác.');
    }
    if(this.busy.size) throw new Error('Trình duyệt đang thực hiện thao tác khác.');
    if(this.haltedOwners.has(owner)) throw new Error('Người dùng đã dừng điều khiển cho tác vụ này.');
    this.busy.set(tabId,owner); this.stopped.delete(tabId); this.snapshots.delete(tabId);
    this.browser.select(tabId); this.browser.window.show(); this.browser.window.focus(); wc.focus();
    this.browser.publish();
    let pressed=false, heldKey=null, modifiers=[];
    const check=()=>{const cause=this.stopped.has(tabId)?'STOPPED':wc.isDestroyed()?'CLOSED':wc.getURL()!==s.url?'NAVIGATED':view.getBounds().width!==s.viewportWidth||view.getBounds().height!==s.viewportHeight?'RESIZED':null;if(cause)throw new Error('Đã dừng điều khiển; hãy quan sát lại. ('+cause+')');};
    const send=event=>{check();this.emit(wc,event);};
    try {
      await pause(40);check();
      if(p) {
        await this.browser.cursor.move(wc,{x:p.x/s.zoom,y:p.y/s.zoom,kind:action==='scroll'?'scroll':action==='drag'?'drag':'move'},check);
        send({type:'mouseMove',...p});
      }
      if(action==='click') {await this.browser.cursor.move(wc,{x:p.x/s.zoom,y:p.y/s.zoom,kind:'down',instant:true},check);const button=args.button||'left', clickCount=args.clickCount||1;send({type:'mouseDown',...p,button,clickCount});pressed=button;send({type:'mouseUp',...p,button,clickCount});pressed=false;}
      if(action==='scroll') send({type:'mouseWheel',...p,deltaX:0,deltaY:args.deltaY});
      if(action==='type') {await this.browser.cursor.focus(wc,'typing',check);check();await wc.insertText(args.text);}
      if(action==='keypress') {await this.browser.cursor.focus(wc,'typing',check);const parts=args.key.split('+');heldKey=parts.pop().replace(/^Arrow/,'');modifiers=parts.length?['control']:[];send({type:'keyDown',keyCode:heldKey,modifiers});send({type:'keyUp',keyCode:heldKey,modifiers});heldKey=null;}
      if(action==='drag') {
        send({type:'mouseDown',...p,button:'left',clickCount:1});pressed='left';
        for(let i=1;i<=12;i++){await pause(16);await this.browser.cursor.move(wc,{x:(p.x+(end.x-p.x)*i/12)/s.zoom,y:(p.y+(end.y-p.y)*i/12)/s.zoom,kind:'drag',instant:true},check);send({type:'mouseMove',x:Math.round(p.x+(end.x-p.x)*i/12),y:Math.round(p.y+(end.y-p.y)*i/12),button:'left',modifiers:['leftButtonDown']});}
        send({type:'mouseUp',...end,button:'left',clickCount:1});pressed=false;
      }
      await pause(180);check();
    } finally {
      if(!wc.isDestroyed()) {
        if(pressed)this.emit(wc,{type:'mouseUp',...(end||p),button:pressed,clickCount:1});
        if(heldKey)this.emit(wc,{type:'keyUp',keyCode:heldKey,modifiers});
        if(this.stopped.has(tabId))await this.browser.cursor.clear(wc);
      }
      this.busy.delete(tabId);this.browser.publish();
    }
    return this.observe(tabId,owner);
  }
}
module.exports={BrowserComputer};
