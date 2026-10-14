import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {checkChatMotion} from './chat-motion.checks.js';
const require=createRequire(import.meta.url);
const server=await createServer({server:{port:0,host:'127.0.0.1'},logLevel:'error'});
try {
 await server.listen();
 const port=server.httpServer.address().port;
 const env={...process.env,CHAT_MOTION_URL:`http://127.0.0.1:${port}/test/chat-motion.html`,CHAT_MOTION_OUTPUT:path.resolve(process.argv[2]||'data/chat-motion.json')};
 delete env.ELECTRON_RUN_AS_NODE;
 if(process.env.CHAT_MOTION_BROWSER==='chrome') {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
   const page=await browser.newPage({viewport:{width:1200,height:800}});
   page.on('pageerror',error=>console.error(error));
   await page.goto(env.CHAT_MOTION_URL);
   await page.waitForFunction(()=>Boolean(window.fixture && document.querySelector('.conversation-feed')));
   const source=fs.readFileSync('test/chat-motion.runner.cjs','utf8');
   const expression=source.split('executeJavaScript(`')[1].split('`);')[0];
   const result=await page.evaluate(expression);
   if(process.env.CHAT_MOTION_CHECKS==='1') {
    result.checks=await page.evaluate(checkChatMotion);
    await page.emulateMedia({reducedMotion:'reduce'});
    result.reducedMotion=await page.evaluate(async()=>{
     const f=window.fixture;f.empty(true);await new Promise(r=>setTimeout(r,30));f.empty(false);
     const animations=document.querySelector('.chat-composer-region').getAnimations().length;
     f.live(true);f.setContent('Reduced motion output. '.repeat(80));await new Promise(r=>setTimeout(r,50));
     const s=document.querySelector('.chat-scroller');
     if(animations||s.scrollHeight-s.clientHeight-s.scrollTop>2)throw Error('Reduced motion must settle immediately');
     return true;
    });
   }
   fs.writeFileSync(env.CHAT_MOTION_OUTPUT,JSON.stringify(result,null,2));
   console.log(JSON.stringify(result));
   await page.screenshot({path:env.CHAT_MOTION_OUTPUT.replace(/\.json$/,'.png')});
   if(process.env.CHAT_MOTION_CHECKS==='1') {
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{window.fixture.live(false);window.fixture.empty(true);});
    await page.waitForTimeout(100);
    await page.screenshot({path:env.CHAT_MOTION_OUTPUT.replace(/\.json$/,'-empty.png')});
    await page.setViewportSize({width:520,height:620});
    await page.screenshot({path:env.CHAT_MOTION_OUTPUT.replace(/\.json$/,'-compact.png')});
   }
  } finally {await browser.close();}
 } else {
  const child=spawn(require('electron'),['test/chat-motion.runner.cjs'],{env,stdio:'inherit',windowsHide:true});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0)throw Error(`Renderer check exited ${code}`);
 }
} finally {await server.close();}
