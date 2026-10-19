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
 assert.equal(await page.locator('.trace-collapse').count(),1,'Activity must have a persistent animated disclosure');
 assert.equal(await heading.getAttribute('aria-expanded'),'true','Thinking activity must open even when raw tool auto-expansion is disabled');
 await body.waitFor();assert((await body.textContent()).includes('Checking the project files.'));
 await page.getByRole('button',{name:'Tool',exact:true}).click();
 await page.locator('.trace-tool').waitFor();assert.equal(await heading.getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('.trace-tool-detail').count(),0,'Raw tool results still follow their separate preference');
 assert.equal(await page.locator('.trace-tools-section > .trace-section-label').count(),0,'Flat Trace has no Activity group heading');
 const toolRow=page.locator('.trace-tool');
 const heights=await toolRow.evaluate(async row=>{
  const toggle=row.querySelector('button'),panel=row.querySelector('.trace-disclosure');
  toggle.click();
  const frames=[];const start=performance.now();
  while(performance.now()-start<300){await new Promise(requestAnimationFrame);frames.push(panel.getBoundingClientRect().height);}
  return frames;
 });
 assert(new Set(heights.map(h=>Math.round(h))).size>3,'Tool expansion must animate through intermediate heights');

 const labelBox=await toolRow.locator('.trace-tool-label').boundingBox();
 const chevronBox=await toolRow.locator('.trace-tool-chevron').boundingBox();
 assert(chevronBox.x-(labelBox.x+labelBox.width)<16,'Disclosure sits directly after the label');
 assert.equal(await toolRow.locator('.trace-tool-detail').evaluate(el=>getComputedStyle(el).borderLeftStyle),'solid','Expanded output has a branch line');
 const closingHeights=await toolRow.evaluate(async row=>{
  const panel=row.querySelector('.trace-disclosure');row.querySelector('button').click();
  const frames=[];const start=performance.now();
  while(performance.now()-start<300){await new Promise(requestAnimationFrame);frames.push(panel.getBoundingClientRect().height);}
  return frames;
 });
 assert(new Set(closingHeights.map(h=>Math.round(h))).size>3,'Tool collapse must animate through intermediate heights');
 await page.waitForFunction(()=>document.querySelector('.trace-tool .trace-disclosure').getBoundingClientRect().height<1);
 assert.equal(await toolRow.locator('.trace-tool-detail').count(),1,'Closing retains visited output for animation');
 assert.equal(await toolRow.locator('.trace-disclosure').getAttribute('inert'),'');
 await heading.click();
 await page.waitForFunction(()=>document.querySelector('.trace-collapse')?.getBoundingClientRect().height<1);
 assert.equal(await page.locator('.trace-collapse').getAttribute('aria-hidden'),'true');
 assert.equal(await page.locator('.trace-collapse').getAttribute('inert'),'','Hidden thinking must not expose focusable controls');
 await heading.click();await body.waitFor();
 await page.getByRole('button',{name:'Answer',exact:true}).click();
 assert.equal(await heading.getAttribute('aria-expanded'),'false','Collapse thinking as soon as the answer starts streaming');
 assert.equal(await page.locator('.trace-collapse').getAttribute('aria-hidden'),'true');
 await page.locator('.response-cursor').waitFor();
 await page.getByRole('button',{name:'Answer done',exact:true}).click();
 await page.locator('.response-cursor').waitFor({state:'detached'});
 assert((await page.locator('.message-content').textContent()).includes('Câu trả lời đã đủ.'));
 await heading.click();await body.waitFor();
 await page.getByRole('button',{name:'Finish',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.trace-heading')?.getAttribute('aria-expanded')==='false');
 await page.waitForFunction(()=>document.querySelector('.trace-collapse')?.getBoundingClientRect().height<1);
 await heading.click();await body.waitFor();
 await page.getByRole('button',{name:'Start',exact:true}).click();await body.waitFor();
 assert.equal(await heading.getAttribute('aria-expanded'),'true');
 const reasoningRow=page.locator('.trace-row').filter({has:page.getByRole('button',{name:'Đang suy nghĩ',exact:true})});
 await reasoningRow.locator('.trace-reasoning-text').waitFor();
 await reasoningRow.getByRole('button').press('Enter');
 assert.equal(await reasoningRow.getByRole('button').getAttribute('aria-expanded'),'false');
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 const sourceToggle=page.getByRole('button',{name:'Đã tham khảo 1 nguồn',exact:true});
 await sourceToggle.waitFor();await sourceToggle.click();
 const sourceRow=page.locator('.trace-row').filter({has:sourceToggle});
 assert.equal(await sourceRow.locator('a').count(),1,'Sources are deduplicated and unsafe URLs are excluded');
 assert.equal(await sourceRow.locator('a').getAttribute('href'),'https://example.com/docs');
 await page.getByRole('button',{name:'Start',exact:true}).click();
 assert.deepEqual(errors,[]);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Answer',exact:true}).click();
 assert.equal(await page.locator('.trace-collapse').evaluate(element=>getComputedStyle(element).transitionProperty),'none');
 assert.equal(await page.locator('.trace-disclosure').first().evaluate(element=>getComputedStyle(element).transitionProperty),'none');
 await page.getByRole('button',{name:'Unknown result',exact:true}).click();
 await heading.locator('.trace-title').filter({hasText:'Kết quả chưa được xác minh'}).waitFor();await heading.click();
 const uncertain=page.locator('.trace-tool[data-status="unknown"]');await uncertain.waitFor();
 await uncertain.getByText('Thao tác có thể đã được thực hiện. Kiểm tra trạng thái thực tế trước khi thử lại.',{exact:true}).waitFor();
 assert.equal(await uncertain.locator('.trace-tool-status [data-state="completed"]').count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Unknown-result warning fits a narrow chat');
 assert(Number(await uncertain.locator('[role="note"]').evaluate(element=>parseFloat(getComputedStyle(element).fontSize)))>=12);
 const children=page.getByRole('region',{name:'Công việc con'});
 for(const [task,label] of [['partial','Chưa hoàn thành toàn bộ'],['blocked','Gặp trở ngại'],['unknown','Kết quả chưa được xác minh'],['failed','Chưa hoàn thành'],['completed','Hoàn tất']]){
  const summary=children.locator('summary').filter({hasText:`Child ${task}`});await summary.waitFor();assert.equal(await summary.locator('small').textContent(),label);
 }
 await page.getByRole('button',{name:'English child',exact:true}).click();
 for(const [task,label] of [['partial','Partially completed'],['blocked','Blocked'],['unknown','Result unverified'],['failed','Not completed'],['completed','Completed']]){
  assert.equal(await page.getByRole('region',{name:'Delegated tasks'}).locator('summary').filter({hasText:`Child ${task}`}).locator('small').textContent(),label);
 }
 console.log('PASS activity UI: thinking/tools open, collapse on first answer, manual toggle, completion, history reopen, next run');
}finally{await browser?.close();await server.close();}
