import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/goal-command.html`);
 const input=page.locator('textarea[aria-label="Nhập yêu cầu tác vụ"]');
 await input.pressSequentially('/goal pause');assert.equal(await input.inputValue(),'/goal pause');
 await input.press('Enter');await page.waitForFunction(()=>window.goalCommands.calls.length===1);
 assert.equal(await page.evaluate(()=>window.goalCommands.sent.length),0);
 assert.equal(await page.evaluate(()=>window.goalCommands.calls[0].body.input),'/goal pause');
 await input.fill('/goal Prepare a report');await input.press('Enter');
 await page.waitForFunction(()=>window.goalCommands.sent.length===1);
 assert.equal(await page.evaluate(()=>window.goalCommands.sent[0]),'/goal Prepare a report');assert.deepEqual(errors,[]);
 console.log('PASS Goal composer: character-by-character slash command keeps control intent, pause bypasses model, objective still enters chat');
}finally{await browser?.close();await server.close();}
