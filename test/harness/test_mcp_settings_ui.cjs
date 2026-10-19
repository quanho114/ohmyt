const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-settings-'));
app.setPath('userData',path.join(temp,'user'));
app.whenReady().then(async()=>{
 const {createDaemon}=await import('../../server/index.js');
 const daemon=createDaemon({dbPath:':memory:',port:0,dataDir:temp});
 const {port}=await daemon.start();
 const w=new BrowserWindow({width:1280,height:900,show:false});
 const js=source=>w.webContents.executeJavaScript(source);
 try{
  await w.loadURL(`http://127.0.0.1:${port}/#settings/connectors`);
  const deadline=Date.now()+20000;
  while(!await js(`!!document.querySelector('.connector-heading button:last-child:not(:disabled)')`)){
   if(Date.now()>deadline)throw new Error('MCP settings did not load');
   await new Promise(r=>setTimeout(r,50));
  }
  await js(`document.querySelector('.connector-heading button:last-child').click()`);
  await js(`document.querySelector('.connector-import').open=true;const textarea=document.querySelector('.connector-import textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,JSON.stringify({mcpServers:{fixture:{command:'node',args:['fixture.js']}}}));textarea.dispatchEvent(new Event('input',{bubbles:true}));`);
  await js(`document.querySelector('.connector-import button').click()`);
  const form=await js(`({name:document.querySelector('.connector-field input').value,command:document.querySelector('[aria-labelledby="connector-command-label"]').value,args:document.querySelector('[aria-labelledby="connector-args-label"]').value})`);
  assert.deepEqual(form,{name:'fixture',command:'node',args:'fixture.js'});
  assert.equal(daemon.harness.connectors.list().length,0,'import alone does not persist or execute');
  await js(`document.querySelector('.connector-form').requestSubmit()`);
  while(!await js(`!!document.querySelector('.connector-row')`)){
   if(Date.now()>deadline)throw new Error('Save did not return to list');
   await new Promise(r=>setTimeout(r,50));
  }
  assert.equal(daemon.harness.connectors.list()[0].state,'disconnected');
  assert.match(await js(`document.querySelector('.connector-row').innerText`),/fixture.js/);
  await js(`document.querySelectorAll('.connector-toolbar .connector-source button')[2].click()`);
  assert.equal(await js(`document.querySelectorAll('.connector-row').length`),0);
  console.log('PASS MCP UI: JSON import, review, save without execution, endpoint display and transport filter');
 }finally{w.close();await daemon.stop();fs.rmSync(temp,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
