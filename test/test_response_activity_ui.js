import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/response-activity.html`);
 const heading=page.locator('.trace-heading'),body=page.locator('.trace-body');
 await heading.waitFor();
 assert.equal(await heading.getAttribute('aria-expanded'),'true','Thinking activity must open even when raw tool auto-expansion is disabled');
 await body.waitFor();assert((await body.textContent()).includes('Checking the project files.'));
 await page.getByRole('button',{name:'Tool',exact:true}).click();
 await page.locator('.trace-tool').waitFor();assert.equal(await heading.getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('.trace-tool-detail').count(),0,'Raw tool results still follow their separate preference');
 await heading.click();assert.equal(await body.count(),0,'Manual collapse must be respected during the run');
 await heading.click();await body.waitFor();
 await page.getByRole('button',{name:'Answer',exact:true}).click();
 assert.equal(await heading.getAttribute('aria-expanded'),'true','Keep activity open until the run finishes');
 await page.getByRole('button',{name:'Finish',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.trace-heading')?.getAttribute('aria-expanded')==='false');
 assert.equal(await body.count(),0,'Completion collapses even manually opened live activity');
 await heading.click();await body.waitFor();
 await page.getByRole('button',{name:'Start',exact:true}).click();await body.waitFor();
 assert.equal(await heading.getAttribute('aria-expanded'),'true');
 assert.deepEqual(errors,[]);
 console.log('PASS activity UI: thinking/tools open, manual toggle, completion collapse, history reopen, next run');
}finally{await browser?.close();await server.close();}
