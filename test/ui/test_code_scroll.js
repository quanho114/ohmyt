import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
const {chromium}=createRequire(path.resolve('../monocode/package.json'))('playwright');
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});
let browser;
try {
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/code-scroll.html`);
 await page.locator('.code-scroll-area').waitFor();
 const read=()=>page.locator('.code-scroll-area').evaluate(el=>({top:el.scrollTop,gap:el.scrollHeight-el.clientHeight-el.scrollTop}));
 assert((await read()).gap<2);
 await page.evaluate(()=>window.codeFixture.set(100));assert((await read()).gap<2);
 await page.locator('.code-scroll-area').evaluate(el=>{el.dispatchEvent(new WheelEvent('wheel',{deltaY:-200}));el.scrollTop-=200;el.dispatchEvent(new Event('scroll'));});
 const reading=(await read()).top;
 await page.evaluate(()=>window.codeFixture.set(120));assert.equal((await read()).top,reading);
 await page.locator('.code-scroll-area').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
 await page.evaluate(()=>window.codeFixture.set(140));assert((await read()).gap<2);
 await page.evaluate(()=>window.codeFixture.live(false));const stopped=(await read()).top;
 await page.evaluate(()=>window.codeFixture.set(160));assert.equal((await read()).top,stopped);
 await page.evaluate(()=>{window.codeFixture.follow(false);window.codeFixture.live(true);window.codeFixture.set(180);});
 assert.equal((await read()).top,stopped);
 console.log('PASS code viewport follows streaming, pauses for reading, resumes at bottom, respects stopped output and autoScroll setting');
} finally {await browser?.close();await server.close();}
