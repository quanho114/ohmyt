import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
let connections=0;
const cursors=[];
const sockets=new Set();
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error',plugins:[{name:'stream-reconnect-fixture',configureServer(server){
 server.middlewares.use('/api/runs/reconnect/stream',(req,res)=>{
  connections++;cursors.push(req.headers['last-event-id']);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});sockets.add(res);
  req.on('close',()=>sockets.delete(res));
  res.write('retry: 100\n\n');
  const event=(sequence,type,delta)=>res.write(`id: e_reconnect_${sequence}\ndata: ${JSON.stringify({eventId:`e_reconnect_${sequence}`,sequence,type,payload:{delta}})}\n\n`);
  if(!req.headers['last-event-id'])event(1,'TextDelta','Before disconnect');
  if(connections===1)setTimeout(()=>res.destroy(),100);
  else{event(2,'TextDelta','After reconnect');event(3,'RunCompleted');}
 });
}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/run-stream.html`);
 await page.evaluate(()=>window.streamFixture.start());
 await page.waitForFunction(()=>window.streamFixture.events.some(event=>event.type==='RunCompleted'),{},{timeout:5000});
 assert.equal(connections,2,'Native SSE must reconnect after a transient disconnect');
 assert.equal(cursors[1],'e_reconnect_1','Reconnect carries the last applied event cursor');
 assert.deepEqual(await page.evaluate(()=>window.streamFixture.events.map(event=>event.sequence)),[1,2,3]);
 assert.deepEqual(await page.evaluate(()=>window.streamFixture.errors),[],'A recoverable connection must not terminate the chat');
 await page.evaluate(()=>window.streamFixture.close());
 await new Promise(resolve=>setTimeout(resolve,200));assert.equal(sockets.size,0,'Closing the chat closes the stream');
 console.log('PASS chat stream reconnects after interruption and receives the terminal replay');
}finally{await browser?.close();for(const socket of sockets)socket.destroy();await server.close();}
