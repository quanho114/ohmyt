const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'goal-controls-ui-'));app.setPath('userData',path.join(temp,'electron'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const d=createDaemon({dbPath:':memory:',port:0,dataDir:temp,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async({messages,onChunk,onToolCall})=>{const data=JSON.parse(messages.at(-1).content.split('\n')[1]);if(!messages.some(m=>m.tool_call_id==='finish'))onToolCall({id:'finish',name:'goal_progress',arguments:{expectedRevision:data.revision,finish:true}});else onChunk('Check the result');return {completed:true};}});}}}});
 d.permissions.evaluate=()=>({action:'ALLOW'});const {port}=await d.start(),w=new BrowserWindow({width:1000,height:800,show:true});
 const ui=code=>w.webContents.executeJavaScript(code),wait=async code=>{const end=Date.now()+10000;while(!await ui(code)){if(Date.now()>end)throw Error('Goal control UI timed out: '+code+'; '+await ui('document.body.innerText'));await new Promise(r=>setTimeout(r,30));}};
 const click=label=>ui(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
 const action=text=>ui(`(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)throw Error('Missing goal action');b.click();})()`);
 try{
  for(const locale of ['vi','en']){
   const en=locale==='en',id='controls-'+locale;d.db.createSession(id,d.db.getAgents()[0].id,'Goal controls');
   await w.loadURL(`http://127.0.0.1:${port}/#session/${id}`);await wait(`!!document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]')&&!!localStorage.getItem('ohmyt_appearance')`);
   await ui(`localStorage.setItem('ohmyt_appearance',JSON.stringify({themeMode:'dark',locale:${JSON.stringify(locale)},responseAnimation:'off'}))`);await w.loadURL(`http://127.0.0.1:${port}/?locale=${locale}#session/${id}`);await wait(`!!document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]')`);
   assert.equal(await ui(`!!document.querySelector('button[aria-label="Quản lý mục tiêu"],button[aria-label="Manage goal"],[role=dialog]')`),false);
   d.harness.goals.create(id,{objective:'Review the actual result',steps:[{text:'Inspect one thing'}]});
   await wait(`document.querySelector('[data-mini-goal]')?.dataset.miniGoal==='paused'`);
   assert.equal(await ui(`!!document.querySelector('[role=dialog]')`),false);
   await click(en?'Resume goal':'Tiếp tục Goal');await wait(`document.querySelector('[data-mini-goal]')?.dataset.miniGoal==='review_required'`);
   const g=d.harness.goals.get(id);assert.equal(d.harness.sessions.outcome(g.currentRound.runId).verificationStatus,'unverified');
   await click(en?'I checked the result, complete':'Tôi đã kiểm tra, hoàn thành');await wait(`!document.querySelector('[data-goal-bar]')`);
   assert.equal(d.harness.goals.get(id).reason,'human_confirmed');assert.deepEqual(d.harness.goals.get(id).evidenceRefs,[]);
   for(const width of [1000,480]){w.setSize(width,800);assert.equal(await ui('document.documentElement.scrollWidth>innerWidth'),false);}
   assert.equal(d.harness.goals.get(id).phase,'completed');
   await w.loadURL(`http://127.0.0.1:${port}/?locale=${locale}#session/${id}`);await wait(`!!document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]')`);assert.equal(await ui(`!!document.querySelector('[data-goal-bar]')`),false);

  }
  console.log('Mini goal review VI/EN: unverified review, explicit human confirmation, no oracle promotion, hide completed state and responsive layout passed');
 }finally{w.close();await d.stop();fs.rmSync(temp,{recursive:true,force:true});}app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
