const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const css=fs.readFileSync(path.join(__dirname,'../src/index.css'),'utf8');
const block=css.slice(css.indexOf('@property --browser-pane-progress'),css.indexOf('/* Compact status glyphs'));
const expanded=css.match(/\.workspace-content>\.integrated-browser-pane\[data-expanded="true"\]\{[^}]+\}/)[0];
app.whenReady().then(async()=>{
 const host=new BrowserWindow({width:1250,height:800,show:false});
 await host.loadURL('data:text/html,'+encodeURIComponent(`<style>*{box-sizing:border-box}body{margin:0}.workspace-content{display:flex;position:relative;width:1102.35px;height:700px;border:1px solid;--browser-pane-width:600.75px;--border-subtle:#ddd}.integrated-browser-pane{display:flex;flex-direction:column;border-left:1px solid}.integrated-browser-surface{height:100%}${expanded}${block}</style><div class="workspace-content"><main class="chat-themed-stage"><textarea style="width:100%">Chat input</textarea></main><aside class="integrated-browser-pane" data-open="true" data-expanded="false"><section class="integrated-browser-surface"></section></aside></div>`));
 const results=await host.webContents.executeJavaScript(`(async()=>{
 const pane=document.querySelector('aside'),parent=pane.parentElement,surface=pane.querySelector('section'),chat=document.querySelector('main');
 await new Promise(r=>setTimeout(r,350));
 const results=[];
 for(const next of [true,false,true,false]){
 const current=pane.getBoundingClientRect(),origin=parent.getBoundingClientRect().left+parent.clientLeft;
 pane.dataset.expanded='true';
 const animation=pane.animate([{left:(current.left-origin)+'px'},{left:(next?0:parent.getBoundingClientRect().width-2-600.75)+'px'}],{duration:300,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
 animation.onfinish=()=>{pane.dataset.expanded=String(next);animation.cancel();};
 const samples=[],begin=performance.now();
 while(performance.now()-begin<500){await new Promise(requestAnimationFrame);const r=surface.getBoundingClientRect();samples.push({x:Math.round(r.left),width:Math.round(r.right)-Math.round(r.left),right:Math.round(r.right),legacyRight:Math.round(r.left)+Math.round(r.width),chat:chat.getBoundingClientRect().width});}
 results.push({next,samples});
 }
 return results;
 })()`);
 for(const {next,samples} of results){
  for(let i=1;i<samples.length;i++){
   assert(next?samples[i].width>=samples[i-1].width:samples[i].width<=samples[i-1].width,'native viewport must move monotonically across handoff');
   assert.equal(samples[i].right,1101,'native right edge must stay fixed');
   assert(Math.abs(samples[i].chat-samples[0].chat)<0.032,'chat input layout must stay fixed within CSS subpixel precision');
  }
  assert.equal(samples.at(-1).width,next?1099:599,'end width must match final layout including borders');
  if(!next)assert.notEqual(samples.at(-1).legacyRight,samples.at(-1).right,'fractional fixture must exercise the old rounding mismatch');
 }
 console.log('PASS four expand/collapse cycles: monotonic native geometry, fixed right edge, stable chat, no handoff rebound');
 host.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
