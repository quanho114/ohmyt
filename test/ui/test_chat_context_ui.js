import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});let browser;
try {
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/chat-motion.html`);
 const menu=page.getByRole('button',{name:'Tác vụ và đính kèm',exact:true});await menu.waitFor();
 const draft=page.locator('.composer-shell textarea');await draft.fill('React');
 await menu.click();await page.getByRole('menuitem',{name:/Tìm kiếm web|Web Search/}).click();
 assert.match(await draft.inputValue(),/React$/);assert.match(await draft.inputValue(),/web/);
 await draft.fill('Chủ đề riêng');await menu.click();await page.getByRole('menuitem',{name:/Nghiên cứu sâu|Deep Research/}).click();
 assert.match(await draft.inputValue(),/Chủ đề riêng$/);
 await page.evaluate(()=>{window.pickedScope=null;window.addEventListener('ohmyt-document-pick',e=>{window.pickedScope=e.detail.scope;});});
 await menu.click();await page.getByRole('menuitem',{name:/Thêm tài liệu|Add document/}).click();
 assert.equal(await page.evaluate(()=>window.pickedScope),'0');
 assert.match(await draft.inputValue(),/Chủ đề riêng$/,'Document action preserves draft');
 console.log('PASS chat context: web/research prepare drafts; document picker targets current chat');
} finally {await browser?.close();await server.close();}
