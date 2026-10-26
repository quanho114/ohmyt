import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/legacy-tool-error.html`);
 const details=page.locator('.message-blocked-source');
 await details.waitFor();
 assert.equal(await details.getAttribute('open'),null);
 assert.equal(await details.locator('.code-scroll-area').isVisible(),false);
 assert.equal(await page.getByText('Đã tạo file khác.',{exact:true}).isVisible(),true);
 await details.locator('summary').click();
 assert.equal(await details.locator('.code-scroll-area').isVisible(),true);
 assert((await details.textContent()).includes('loadTodos'));
 assert(await details.locator('.hljs-tag').count()>0);
 assert.equal(await page.evaluate(()=>window.unsafe),undefined);
 assert.equal(await page.locator('iframe').count(),0);
 await details.locator('summary').press('Enter');
 assert.equal(await details.getAttribute('open'),null);
 console.log('Legacy history: collapsed source, syntax highlighting, preserved prose, no HTML execution');
} finally {await browser?.close();await server.close();}
