import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/context-meter.html`);
 const trigger=page.getByRole('button',{name:'Context đã dùng: 25%'});await trigger.click();
 await page.getByRole('status').waitFor();assert.match(await page.getByRole('status').textContent(),/6\.000 \/ 24\.000/);
 assert.match(await page.getByRole('status').textContent(),/Ước tính/);assert.equal(await page.locator('progress').getAttribute('value'),'6000');
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('status').count(),0);
 await page.getByRole('button',{name:'Switch model'}).click();await page.getByRole('button',{name:'Context đã dùng: Chưa có dữ liệu'}).click();
 assert.match(await page.getByRole('status').textContent(),/Chưa có số liệu/);assert.equal(await page.locator('progress').count(),0);
 await page.setViewportSize({width:360,height:640});await page.getByRole('button',{name:'Context đã dùng: Chưa có dữ liệu'}).click();const box=await page.getByRole('status').boundingBox();assert(box.x>=0&&box.x+box.width<=360);
 await page.screenshot({path:'/tmp/ohmyt-context-meter.png'});
 console.log('PASS context meter: click, escape, measured count, estimate, model mismatch and mobile');
}finally{await browser?.close();await server.close();}
