const assert = require('node:assert/strict');
const {BrowserComputer} = require('../electron/browser-computer.cjs');
(async () => {
 const {PermissionEngine} = await import('../server/permissions.js');
 for (const [action, tool] of Object.entries({click:'browser_click',drag:'browser_click',type:'browser_type',keypress:'browser_type',scroll:'browser_scroll'})) {
  for (const scoped of [false,true]) {
   const engine=new PermissionEngine({getPolicies:()=>scoped?[]:[{pattern:`${tool}:*`,action:'DENY'}],getScopedPolicies:()=>scoped?[{pattern:`${tool}:tab:1`,action:'DENY'}]:[]});
   assert.equal(engine.evaluate('browser_act','tab:1',{scopeId:'s',approvalMode:'full'},'tab:1 · {}',{action}).action,'DENY');
   assert.equal(engine.evaluate('browser_act','tab:2',{scopeId:'s',approvalMode:'full'},'tab:2 · {}',{action:'move'}).action,'ALLOW');
  }
 }
 const {authorizeTool}=await import('../server/harness/authorization.js');
 const deniedEngine=new PermissionEngine({getPolicies:()=>[{pattern:'browser_click:*',action:'DENY'}]});
 const decision=await authorizeTool({permissions:deniedEngine,emitEvent(){throw Error('Denied policy should not request approval');}},{call:{name:'browser_act',arguments:{tabId:1,action:'click'}},toolContext:{runId:'r',scope:{approvalMode:'full'}},agent:{},session:{id:'s'},runTools:{},target:'tab:1'});
 assert.equal(decision.action,'DENY');
 const wc={id:1,sendInputEvent(){}};
 const computer=new BrowserComputer({cursor:{clear:async()=>{}},tabs:new Map([[1,{webContents:wc}]])});
 computer.busy.set(1,'run');
 computer.emit(wc,{type:'keyDown',keyCode:'Tab'});
 computer.input(1,{type:'keyDown',key:'Enter',code:'Enter'});
 assert(computer.haltedOwners.has('run'));
 computer.haltedOwners.clear();
 computer.input(1,{type:'keyDown',key:'Tab',code:'Tab'});
 assert(!computer.haltedOwners.has('run'));
 computer.emit(wc,{type:'keyDown',keyCode:'Left'});
 computer.input(1,{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});
 assert(!computer.haltedOwners.has('run'));
 computer.expected.set(1,[{type:'keyDown',keyCode:'Tab',expiresAt:Date.now()-1}]);
 computer.input(1,{type:'keyDown',key:'Tab',code:'Tab'});
 assert(computer.haltedOwners.has('run'));
 let started, resume;
 const pending=new Promise(r=>resume=r), entered=new Promise(r=>started=r);
 const image={getSize:()=>({width:100,height:100}),resize(){return this;},toJPEG:()=>Buffer.from('image')};
 const capture={id:2,isDestroyed:()=>false,getURL:()=> 'https://example.com',getZoomFactor:()=>1,executeJavaScriptInIsolatedWorld:async()=>({revision:0}),insertCSS:async()=>{started();await pending;return 'css';},removeInsertedCSS:async()=>{},capturePage:async()=>image,isLoading:()=>false};
 const observer=new BrowserComputer({tabs:new Map([[2,{webContents:capture,getBounds:()=>({width:100,height:100})}]]),cursor:{hidden:async(w,f)=>f(),clear:async()=>{}},select:()=>{}});
 const observation=observer.observe(2,'first-run');
 await entered;observer.stop(2);resume();
 await assert.rejects(observation,/dừng/);
 assert(observer.haltedOwners.has('first-run'));assert(!observer.snapshots.has(2));assert.equal(observer.observing.size,0);
 await assert.rejects(observer.observe(2,'first-run'),/dừng/);
 assert((await observer.observe(2,'new-run')).snapshotId);
 console.log('PASS computer safety: DOM denials, manual key takeover, event expiry, stop during initial capture');
})().catch(error=>{console.error(error);process.exitCode=1;});
