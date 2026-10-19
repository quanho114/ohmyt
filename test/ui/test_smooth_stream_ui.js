import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import fs from 'node:fs';
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/chat-motion.html`);
 await page.waitForFunction(()=>Boolean(window.fixture));
 const results=await page.evaluate(async()=>{
  const f=window.fixture,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  f.live(true);await wait(100);
  const scenarios=[];
  for(const batched of [false,true]){
   f.setContent('');await wait(50);f.commits.length=0;
   let text='';
   for(let i=0;i<80;i++){
    text+='word '+i+' ';(batched?f.publishContent:f.setContent)(text);
    await wait(4);
   }
   f.flushContent();await wait(50);
   scenarios.push({batched,commits:f.commits.length,visible:document.querySelector('.message-response.is-streaming').textContent.includes(text),
    longestCommitMs:Math.max(...f.commits)});
  }
  return scenarios;
 });
 assert(results.every(item=>item.visible),'Every received token must survive frame batching');
 assert(results[1].commits<results[0].commits*.7,'Streaming should render substantially fewer times under the same token burst');
 assert.deepEqual(errors,[]);
 // Keep previews outside the repository and user data.
 await page.screenshot({path:'/tmp/ohmyt-smooth-chat.png'});
 fs.writeFileSync('/tmp/ohmyt-smooth-stream.json',JSON.stringify(results,null,2));
 console.log('PASS smooth streaming browser comparison:',JSON.stringify(results));
}finally{await browser?.close();await server.close();}
