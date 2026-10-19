const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-settings-'));
app.setPath('userData',path.join(temp,'user'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,dataDir:temp});
 const {port}=await daemon.start();
 const w=new BrowserWindow({width:1280,height:900,show:Boolean(process.env.OHMYT_SKILL_SCREENSHOT)});
 const js=source=>w.webContents.executeJavaScript(source);
 try{
  const root=path.join(temp,'personal','shared');fs.mkdirSync(root,{recursive:true});
  const raw='---\nname: shared-fixture\ndescription: A shared skill\n---\n# Preview fixture\n\n```mermaid\nflowchart TD\n A[Start] --> B[Done]\n```\n\n```bash\necho "hello"\n```\n\n[Documentation](https://example.com) and `npm test`.\n'+Array.from({length:100},(_,i)=>`\nParagraph ${i} with long skill instructions.\n`).join('');fs.writeFileSync(path.join(root,'SKILL.md'),raw);
  for(let i=0;i<35;i++){const directory=path.join(temp,'personal',`fixture-${i}`);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'SKILL.md'),`---\nname: fixture-${i}\n---\nFixture`);}
  daemon.skills.externalRoots=[{path:path.join(temp,'personal'),source:'agents'}];
  daemon.skills.externalStatePath=path.join(temp,'state.json');
  await w.loadURL(`http://127.0.0.1:${port}/#settings/skills`);
  const deadline=Date.now()+20000;
  while(!await js(`!!document.querySelector('.skill-catalog-row')`)){
   if(Date.now()>deadline)throw new Error('Skills did not load');
   await new Promise(r=>setTimeout(r,50));
  }
  await js(`(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{transition:none!important}';document.head.append(style);})()`);
  for(const theme of ['light','dark']){
   await js(`document.documentElement.dataset.theme='${theme}'`);
   await new Promise(resolve=>setTimeout(resolve,400));
   const colors=await js(`(()=>{return ['.desktop-top-bar','.settings-page-sidebar'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor);})()`);
   assert.equal(colors[0],colors[1],`shell backgrounds match in ${theme}`);
  }
  await js(`document.documentElement.dataset.theme='light'`);
  await js(`[...document.querySelectorAll('.skill-catalog-select')].find(e=>e.innerText.includes('shared-fixture')).click()`);
  assert.match(await js(`document.querySelector('.skill-detail').innerText`),/Preview fixture/);
  await js(`window.electronAPI={openProjectDirectory:async directory=>{window.openedSkillDirectory=directory;}};document.querySelector('.skill-path-actions button').click()`);
  assert.equal(await js(`window.openedSkillDirectory`),root,'folder action opens the containing skill directory');
  while(!await js(`!!document.querySelector('.skill-detail .mermaid-diagram svg')`)){
   if(Date.now()>deadline)throw new Error('Mermaid diagram did not render');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.match(await js(`document.querySelector('.mermaid-diagram').textContent`),/Start/);
  assert(await js(`!!document.querySelector('.skill-markdown-viewer .code-editor-block')`),'shell fence uses shared syntax renderer');
  assert.equal(await js(`document.querySelector('.skill-markdown-viewer a').getAttribute('rel')`),'noopener noreferrer');
  const scroll=await js(`(()=>{const list=document.querySelector('.skill-catalog-list'),detail=document.querySelector('.skill-detail');list.scrollTop=160;detail.scrollTop=160;return {list:list.scrollTop,detail:detail.scrollTop,listOverflow:list.scrollHeight>list.clientHeight,detailOverflow:detail.scrollHeight>detail.clientHeight};})()`);
  assert(scroll.listOverflow&&scroll.list>0,'long skill list scrolls');
  assert(scroll.detailOverflow&&scroll.detail>0,'long inspector scrolls independently');
  const pane=await js(`(()=>{const detail=document.querySelector('.skill-detail'),list=document.querySelector('.skill-catalog'),style=getComputedStyle(detail);return {gap:detail.getBoundingClientRect().left-list.getBoundingClientRect().right,radius:style.borderRadius,margin:style.marginLeft,scrollbar:style.scrollbarWidth};})()`);
  assert(Math.abs(pane.gap)<1,'skill panes meet without a gap');
  assert.equal(pane.radius,'0px');assert.equal(pane.margin,'0px');assert.equal(pane.scrollbar,'none');
  assert(!await js(`!!document.querySelector('.skill-detail button[class*="border-red"]')`),'external source cannot be deleted');
  await js(`[...document.querySelectorAll('.skill-preview-tabs button')].find(e=>e.textContent==='Source').click()`);
  assert.equal(await js(`document.querySelector('.skill-source-content').textContent`),raw);
  await js(`document.querySelector('[role="switch"][aria-label*="shared-fixture"]').click()`);
  while(!await js(`document.querySelector('[role="switch"][aria-label*="shared-fixture"]').getAttribute('aria-checked')==='true'`)){
   if(Date.now()>deadline)throw new Error('Enable failed');
   await new Promise(r=>setTimeout(r,50));
  }
  assert.equal(fs.readFileSync(path.join(root,'SKILL.md'),'utf8'),raw);
  await js(`const input=document.querySelector('.skill-catalog-toolbar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'shared-fixture');input.dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await js(`document.querySelectorAll('.skill-catalog-row').length`),1);
  await js(`document.querySelector('.skill-preview-tabs button').click()`);
  assert(await js(`!!document.querySelector('.skill-metadata')`));
  await js(`(()=>{document.querySelector('.skill-metadata').open=true;const field=document.querySelector('.skill-catalog-toolbar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'');field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await js(`[...document.querySelectorAll('.skill-catalog-select')].find(e=>e.innerText.includes('fixture-0')).click()`);
  assert.equal(await js(`document.querySelector('.skill-metadata').open`),false,'switching skill collapses metadata');
  if(process.env.OHMYT_SKILL_SCREENSHOT){await new Promise(resolve=>setTimeout(resolve,350));fs.writeFileSync(process.env.OHMYT_SKILL_SCREENSHOT,(await w.webContents.capturePage()).toPNG());}
  await js(`document.querySelector('.skill-inspector-title button').click()`);
  assert.equal(await js(`document.querySelector('.skill-inspector-header')`),null);
  console.log('PASS skills UI: external discovery, preview/source, opt-in toggle, original preserved and search');
 }finally{w.close();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
