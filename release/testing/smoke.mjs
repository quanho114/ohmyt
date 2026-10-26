import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
if(process.platform!=='linux')throw Error('This packaged smoke currently requires Linux and xvfb-run');
const binary=path.resolve(process.argv[2]||'output/release/artifacts/linux-unpacked/sky');
assert(fs.existsSync(binary),'Build release:dir first');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'sky-packaged-smoke-'));
const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const child=spawn('xvfb-run',['-a',binary,'--no-sandbox','--ozone-platform=x11',`--user-data-dir=${path.join(temporary,'profile')}`,`--remote-debugging-port=${port}`],{
  detached:true,env:{...process.env,OHMYT_WORKSPACE:path.join(temporary,'workspace')},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>{output=(output+chunk).slice(-16000);});child.stderr.on('data',chunk=>{output=(output+chunk).slice(-16000);});
let browser;
try{
 const deadline=Date.now()+45000;let ready=false;
 while(Date.now()<deadline){
  if(child.exitCode!==null)throw Error(`Packaged process exited ${child.exitCode}`);
  try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 assert(ready,'Packaged browser did not start');
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 const context=browser.contexts()[0];let page;
 while(Date.now()<deadline){page=context.pages().find(p=>p.url().startsWith('http://127.0.0.1:'));if(page)break;await new Promise(resolve=>setTimeout(resolve,200));}
 assert(page,'Packaged runtime did not open the UI');
 await page.waitForFunction(()=>Boolean(window.electronAPI?.runtime?.token)&&document.querySelector('#root')?.childElementCount>0,{},{timeout:15000});
 assert.equal(await page.title(),'sky');
 const status=await page.evaluate(async()=>{const {apiBase,token}=window.electronAPI.runtime;return (await fetch(`${apiBase}/status`,{headers:{Authorization:`Bearer ${token}`}})).status;});
 assert.equal(status,200);
 assert(fs.existsSync(path.join(temporary,'profile/runtime/app.db')),'Database must live outside packaged application');
 console.log('PASS packaged Electron: UI loaded, authenticated daemon healthy, SQLite/native startup and isolated user data');
}catch(error){console.error(output);throw error;}
finally{
 await browser?.close();
 try{process.kill(-child.pid,'SIGTERM');}catch{}
 await Promise.race([once(child,'exit').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
 try{process.kill(-child.pid,'SIGKILL');}catch{}
 fs.rmSync(temporary,{recursive:true,force:true});
}
