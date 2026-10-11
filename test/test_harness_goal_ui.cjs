const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'goal-ui-'));app.setPath('userData',path.join(temp,'electron'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../server/index.js');let requests=0,hold=false;
 const d=createDaemon({dbPath:':memory:',port:0,dataDir:temp,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async({messages,onChunk,onToolCall,signal})=>{requests++;if(!messages.some(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'))){onChunk('Fixture title');return {completed:true};}if(hold){hold=false;await new Promise(resolve=>{if(signal?.aborted)resolve();else signal?.addEventListener('abort',resolve,{once:true});});return {completed:true};}const data=JSON.parse(messages.at(-1).content.split('\n')[1]);if(!messages.some(m=>m.tool_calls?.some(c=>c.id==='finish')))onToolCall({id:'finish',name:'goal_progress',arguments:{expectedRevision:data.revision,finish:true}});else onChunk('Check the result');return {completed:true};}});}}}});
 d.permissions.evaluate=()=>({action:'ALLOW'});const {port}=await d.start(),w=new BrowserWindow({width:1000,height:800,show:true});
 const ui=code=>w.webContents.executeJavaScript(code),wait=async code=>{const end=Date.now()+10000;while(!await ui(code)){if(Date.now()>end)throw new Error('Goal UI timed out: '+code+'; '+await ui('document.body.innerText'));await new Promise(r=>setTimeout(r,30));}};
 const openGoal=async()=>{await ui(`(()=>{const el=document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'/goal');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(`!!document.querySelector('#goal-command-option')`);await ui(`document.querySelector('#goal-command-option').click()`);};
 const click=label=>label==='Goal and plan'||label==='Mục tiêu và kế hoạch'?openGoal():ui(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
 const textButton=text=>ui(`(()=>{const button=[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent===${JSON.stringify(text)});if(!button)throw Error('Missing button');button.click();})()`);
 const fill=async(label,value)=>{await ui(`(()=>{const el=document.querySelector('textarea[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
 try{
  for(const locale of ['vi','en']){
   const id='goal-'+locale;d.db.createSession(id,d.db.getAgents()[0].id,'Goal '+locale);d.db.addMessage('goal-colored-'+locale,id,'user','/goal A colored goal message');
   await w.loadURL(`http://127.0.0.1:${port}/#session/${id}`);await wait(`!!document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]') && !!localStorage.getItem('ohmyt_appearance')`);await ui(`localStorage.setItem('ohmyt_appearance',JSON.stringify({themeMode:'dark',locale:${JSON.stringify(locale)},responseAnimation:'off'}))`);await w.loadURL(`http://127.0.0.1:${port}/?locale=${locale}#session/${id}`);
   const en=locale==='en';await wait(`!!document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]')`);
   const draft=async value=>ui(`(()=>{const el=document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await draft('Keep this draft');await click('Tác vụ và đính kèm');await wait(`!!document.querySelector('[role=menuitem][aria-label="Goal"]')`);await click('Goal');
   await wait(`!!document.querySelector('[data-goal-mode]')`);
   assert.equal(await ui(`!!document.querySelector('[role=dialog]')`),false);
   assert.equal(await ui(`(()=>{const goal=document.querySelector('[data-goal-mode]').getBoundingClientRect(),input=document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]').getBoundingClientRect();return Math.abs(goal.top-input.top)<2&&goal.right<input.left;})()`),true);
   assert.equal(await ui(`!!document.querySelector('button[aria-label="Bỏ Goal"],button[aria-label="Remove goal"]')`),false);
   assert.equal(await ui(`document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]').value`),'Keep this draft');
   assert.equal(await ui(`getComputedStyle(document.querySelector('[data-goal-mode]')).color`),'rgb(37, 99, 235)');
   await ui(`(()=>{const el=document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]');el.setSelectionRange(0,0);el.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true}));})()`);await draft('/goal ');await wait(`!!document.querySelector('[data-goal-mode]')`);
   assert.equal(await ui(`document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]').value`),'');
   await draft('Write my report');assert.equal(await ui(`!!document.querySelector('[data-goal-mode]')`),true);
   await ui(`(()=>{const el=document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]');el.setSelectionRange(0,0);el.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true}));})()`);await draft('/g');await wait(`!!document.querySelector('#goal-command-option')`);await ui(`document.querySelector('#goal-command-option').click()`);
   await wait(`!!document.querySelector('[data-goal-mode]')`);assert.equal(await ui(`document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]').value`),'');
   await ui(`document.querySelector('textarea[aria-label="Nhập yêu cầu tác vụ"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true}))`);await wait(`!document.querySelector('[data-goal-mode]')`);
   const g=d.harness.goals.create(id,{objective:'Mini goal task'});hold=true;d.harness.goals.control(id,{action:'start',expectedRevision:g.revision,autoContinue:true});
   await wait(`document.querySelector('[data-mini-goal]')?.dataset.miniGoal==='active'`);await wait(`document.querySelector('[role=dialog]')===null`);
   await click(en?'Pause goal':'Tạm dừng Goal');await wait(`document.querySelector('[data-mini-goal]')?.dataset.miniGoal==='paused'`);await d.harness.goals.drain(id);
   await click(en?'Edit goal':'Sửa Goal');await wait(`!!document.querySelector('input[aria-label=${JSON.stringify(en?'Goal objective':'Nội dung Goal')}]')`);
   await ui(`(()=>{const el=document.querySelector('input[aria-label=${JSON.stringify(en?'Goal objective':'Nội dung Goal')}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Updated mini task');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await click(en?'Save goal':'Lưu Goal');await wait(`document.querySelector('[data-mini-goal]').innerText.includes('Updated mini task')`);assert.equal(d.harness.goals.get(id).objective,'Updated mini task');
   await click(en?'Resume goal':'Tiếp tục Goal');await wait(`document.querySelector('[data-mini-goal]')?.dataset.miniGoal==='review_required'`);
   await click(en?'Delete goal':'Xóa Goal');await wait(`!document.querySelector('[data-mini-goal]')`);assert.equal(d.harness.goals.get(id).phase,'cancelled');
   assert.equal(await ui(`document.body.innerText.includes('/goal A colored goal message')`),false);
   for(const width of [1000,480]){w.setSize(width,800);assert.equal(await ui('document.documentElement.scrollWidth>innerWidth'),false);}

  }
  console.log('Goal composer VI/EN: menu selection preserves draft, slash + space, inline goal, message color, pause/resume/edit/delete and responsive layout passed');
 }finally{w.close();await d.stop();fs.rmSync(temp,{recursive:true,force:true});}app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
