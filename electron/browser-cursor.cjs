const cursorAsset=require('./assets/agent-cursor-rose.json');
// A visual indicator only: it never synthesizes input or reads page content.
// Closed shadow content stays out of DOM observations and all input passes through.
function installCursor(asset) {
  if (globalThis.__ohmytAgentCursor?.host.isConnected) return;
  const host = document.createElement('div');
  host.id = '__ohmyt_cursor';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;contain:strict!important;';
  const root = host.attachShadow({mode:'closed'});
  root.innerHTML = `<style>
    :host,*{pointer-events:none!important;user-select:none!important;box-sizing:border-box}
    .pointer{position:absolute;left:0;top:0;transform:translate3d(28px,28px,0);opacity:0;transition:transform 240ms cubic-bezier(.22,.8,.25,1),opacity 150ms ease;filter:drop-shadow(0 1px 1px #30202a25)}
    canvas{display:block;width:24px;height:36px;position:relative;left:-1px;top:-1px}
    .badge{position:absolute;left:21px;top:24px;display:flex;align-items:center;gap:5px;white-space:nowrap;padding:4px 8px;border:1px solid #ffffff65;border-radius:8px;background:#fff6f7;color:#97515f;font:600 10px/14px system-ui,sans-serif;box-shadow:0 2px 8px #0002}
    .dot{width:4px;height:4px;border-radius:50%;background:#d88998}
    .ring{position:absolute;width:12px;height:12px;left:-6px;top:-6px;border:2px solid #d88998;border-radius:50%;opacity:0}
    .click{animation:click 460ms ease-out}.press canvas{transform:scale(.92);transform-origin:1px 1px}
    .scroll .dot,.typing .dot{animation:blink 700ms ease-in-out infinite alternate}
    @keyframes click{0%{opacity:.8;transform:scale(.5)}100%{opacity:0;transform:scale(3.3)}}
    @keyframes blink{to{opacity:.25}}
    @media(prefers-reduced-motion:reduce){.pointer{transition:opacity 100ms ease}.click{animation:none}.scroll .dot,.typing .dot{animation:none}}
  </style><div class="pointer"><span class="ring"></span><canvas></canvas><span class="badge"><span class="dot"></span><span class="label">AI</span></span></div>`;
  const canvas=root.querySelector('canvas');canvas.width=asset.width;canvas.height=asset.height;
  // Paint embedded pixels directly so restrictive website img-src CSP cannot block it.
  const pixels=Uint8ClampedArray.from(atob(asset.rgba),c=>c.charCodeAt(0));
  canvas.getContext('2d').putImageData(new ImageData(pixels,asset.width,asset.height),0,0);
  document.documentElement.append(host);
  const pointer=root.querySelector('.pointer'), label=root.querySelector('.label'), ring=root.querySelector('.ring');
  let idle, hidden=0;
  const state={x:28,y:28,kind:'move',visible:false};
  globalThis.__ohmytAgentCursor={host,state,
    update({x,y,kind='move',duration=240}) {
      clearTimeout(idle);
      state.x=Math.max(2,Math.min(innerWidth-28,x));state.y=Math.max(2,Math.min(innerHeight-32,y));state.kind=kind;state.visible=true;
      pointer.style.transitionDuration=(matchMedia('(prefers-reduced-motion:reduce)').matches?0:duration)+'ms,150ms';
      pointer.style.transform='translate3d('+state.x+'px,'+state.y+'px,0)';
      pointer.style.visibility=hidden?'hidden':'visible';pointer.style.opacity='1';root.querySelector('.badge').style.left=state.x>innerWidth-135?'-96px':'21px';root.querySelector('.badge').style.top=state.y>innerHeight-65?'-18px':'24px';pointer.className='pointer '+(kind==='down'?'press':kind);
      label.textContent=kind==='typing'?'Nhập':kind==='scroll'?'Cuộn':kind==='drag'?'Kéo':'';root.querySelector('.badge').style.display=label.textContent?'flex':'none';
      if(kind==='down'){ring.classList.remove('click');void ring.offsetWidth;ring.classList.add('click');}
      idle=setTimeout(()=>{pointer.style.opacity='0';state.visible=false;},1800);
    },
    hide(value){hidden=Math.max(0,hidden+(value?1:-1));pointer.style.visibility=hidden?'hidden':'visible';},
    dispose(){clearTimeout(idle);host.remove();delete globalThis.__ohmytAgentCursor;}
  };
}

class BrowserCursor {
  constructor(){this.positions=new Map();this.pending=new Map();}
  async script(wc,code){
    const previous=this.pending.get(wc.id)||Promise.resolve();
    const operation=previous.catch(()=>{}).then(()=>{if(!wc.isDestroyed())return wc.executeJavaScriptInIsolatedWorld(998,[{code}]);});
    this.pending.set(wc.id,operation);
    try{return await operation;}finally{if(this.pending.get(wc.id)===operation)this.pending.delete(wc.id);}
  }
  async move(wc,options,check=()=>{}){try{return await this.animate(wc,options,check);}catch(error){await this.clear(wc);throw error;}}
  async animate(wc,{x,y,kind='move',instant=false},check=()=>{}){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    check();await this.script(wc,`(${installCursor.toString()})(${JSON.stringify(cursorAsset)});`);
    check();const old=this.positions.get(wc.id)||{x:28,y:28};
    const distance=Math.hypot(x-old.x,y-old.y);const duration=instant||distance<2?0:Math.min(300,Math.max(140,distance*.4));
    await this.script(wc,`globalThis.__ohmytAgentCursor?.update(${JSON.stringify({x,y,kind,duration})})`);
    this.positions.set(wc.id,{x,y});
    // Check takeover throughout the decorative movement, before sending real input.
    if(!instant){const reduced=await this.script(wc,"matchMedia('(prefers-reduced-motion:reduce)').matches");if(!reduced)for(let elapsed=0;elapsed<duration;elapsed+=20){await new Promise(resolve=>setTimeout(resolve,20));check();}}
    check();
  }
  async focus(wc,kind,check){
    const point=await this.script(wc,"(()=>{let e=document.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;const r=e?.getBoundingClientRect();return r&&r.width&&r.height?{x:r.x+Math.min(r.width/2,24),y:r.y+r.height/2}:null})()");
    if(point)await this.move(wc,{...point,kind},check);
  }
  async hidden(wc,callback){await this.script(wc,'globalThis.__ohmytAgentCursor?.hide(true)');try{return await callback();}finally{await this.script(wc,'globalThis.__ohmytAgentCursor?.hide(false)').catch(()=>{});}}
  clear(wc){if(!wc)return;this.positions.delete(wc.id);return this.script(wc,'globalThis.__ohmytAgentCursor?.dispose()').catch(()=>{});}
}
module.exports={BrowserCursor};
