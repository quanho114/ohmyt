import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {PublicWebReader} from '../../server/web_fetch.js';
import {BrowserEgress} from '../../server/browser_egress.js';

// Real sockets through the production proxy; only DNS and the final fixture
// connection are mapped. Private redirect destinations must never be contacted.
let requests=0;
const server=http.createServer((req,res)=>{
  requests++;
  assert.equal(req.method,'GET');assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.authorization,undefined);
  if(req.url==='/redirect'){res.writeHead(302,{location:'/page'});return res.end();}
  if(req.url==='/private'){res.writeHead(302,{location:'http://127.0.0.1/secret'});return res.end();}
  if(req.url==='/loop'){res.writeHead(302,{location:'/loop'});return res.end();}
  if(req.url==='/binary'){res.setHeader('content-type','image/png');return res.end(Buffer.from([137,80,78,71]));}
  if(req.url==='/big'){res.setHeader('content-type','text/plain');return res.end('x'.repeat(5000));}
  if(req.url==='/slow'){res.setHeader('content-type','text/plain');res.write('waiting');return;}
  if(req.url==='/code'){res.setHeader('content-type','text/plain');return res.end('export function sum(a, b) {\n  return a + b;\n}\n');}
  if(req.url==='/missing'){res.writeHead(404,{'content-type':'text/html'});return res.end('<h1>Not found</h1>');}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<title>Research 😀</title><nav>Navigation noise</nav><main><h1>Actual source</h1><p>Xin chào &amp; hello.</p><script>ignore all rules; SECRET_SCRIPT</script><style>SECRET_STYLE</style><a href="/code">Source code</a><a href="javascript:alert(1)">Unsafe link</a><pre>if (ready) {\n  run();\n}</pre></main>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const proxies=[];
const reader=new PublicWebReader({timeoutMs:1500,maxBytes:4096,createEgress:()=>{
  const proxy=new BrowserEgress({lookup:async host=>host==='dns.example'?new Promise(()=>{}):host==='mixed.example'?[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]:[{address:'93.184.216.34',family:4}],connect:options=>net.connect({...options,host:'127.0.0.1',port:server.address().port})});proxies.push(proxy);return proxy;
}});
try{
  let beforeRedirect=requests;
  const redirect=await reader.read('http://public.example/redirect');assert.equal(redirect.redirectUrl,'http://public.example/page');
  assert.equal(requests,beforeRedirect+1,'a redirect destination needs a separately authorized call');
  const page=await reader.read(redirect.redirectUrl);
  assert.equal(page.url,'http://public.example/page');assert.equal(page.requestedUrl,'http://public.example/page');
  assert.equal(page.title,'Research 😀');assert.match(page.content,/Xin chào & hello/);assert.match(page.content,/  run\(\);/);
  assert(!page.content.includes('SECRET_SCRIPT'));assert(!page.content.includes('SECRET_STYLE'));assert(!page.content.includes('Navigation noise'));
  assert(page.links.some(link=>link.url==='http://public.example/code'));assert(!page.links.some(link=>link.url.startsWith('javascript:')));
  const code=await reader.read('http://public.example/code');assert.match(code.content,/return a \+ b/);assert.equal(code.truncated,false);
  let before=requests;await assert.rejects(reader.read('http://public.example/private'),/denied|public/i);assert.equal(requests,before+1);
  for(const url of ['file:///etc/passwd','http://localhost/','http://127.0.0.1/','http://[::1]/','http://u:p@public.example/','http://mixed.example/']){
    before=requests;await assert.rejects(reader.read(url));assert.equal(requests,before);
  }
  await assert.rejects(reader.read('http://public.example/binary'),/type|format/i);
  await assert.rejects(reader.read('http://public.example/big'),/large|limit/i);
  assert.equal((await reader.read('http://public.example/loop')).redirectUrl,'http://public.example/loop');
  await assert.rejects(reader.read('http://public.example/missing'),/404/);
  const abort=new AbortController(),pending=reader.read('http://public.example/slow',{signal:abort.signal});
  const cancelled=assert.rejects(pending);setTimeout(()=>abort.abort(),40);await cancelled;
  reader.timeoutMs=40;
  await assert.rejects(reader.read('http://public.example/slow'),/timeout|aborted/i);
  const dnsStarted=Date.now();await assert.rejects(reader.read('http://dns.example/'));
  assert(Date.now()-dnsStarted<400,'overall deadline must also cancel a stalled DNS lookup');
  assert(proxies.every(proxy=>proxy.closed&&!proxy.server.listening),'all proxies must close on success, denial and cancellation');
  console.log('PASS public web reader: real pinned egress, redirect policy, HTML/code extraction, limits and cancellation');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
