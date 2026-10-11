import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {BrowserEgress} from '../server/browser_egress.js';
const origin=http.createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{location:'http://127.0.0.1/private'});return res.end();}res.end('public fixture');});
await new Promise(resolve=>origin.listen(0,'127.0.0.1',resolve));
let seen;
const proxy=new BrowserEgress({lookup:async host=>host==='public.example'?[{address:'93.184.216.34',family:4}]:[{address:'10.0.0.1',family:4}],connect:options=>{seen=options.host||options.hostname;return net.connect({host:'127.0.0.1',port:origin.address().port});}});
await proxy.start();
const request=url=>new Promise((resolve,reject)=>{const req=http.get(proxy.url,{path:url},res=>{let body='';res.on('data',data=>body+=data);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);req.setTimeout(3000,()=>req.destroy(Error('fixture timeout')));});
try{
 assert.equal((await request('http://public.example/')).body,'public fixture');assert.equal(seen,'93.184.216.34');
 for(const url of ['http://127.0.0.1/private','http://mixed.example/','http://[::1]/','file:///etc/passwd','http://user:secret@public.example/'])assert.equal((await request(url)).status,403,url);
 const redirected=await request('http://public.example/redirect');assert.equal(redirected.status,302);assert.equal((await request(redirected.headers.location)).status,403);
 const tunnel=net.connect(new URL(proxy.url).port,'127.0.0.1');const response=new Promise(resolve=>tunnel.once('data',data=>resolve(data.toString())));tunnel.write('CONNECT 169.254.169.254:80 HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n');assert.match(await response,/403/);tunnel.destroy();
 const pinned=net.connect(new URL(proxy.url).port,'127.0.0.1');const connected=new Promise(resolve=>pinned.once('data',data=>resolve(data.toString())));pinned.write('CONNECT public.example:443 HTTP/1.1\r\nHost: public.example:443\r\n\r\n');assert.match(await connected,/200/);assert.equal(seen,'93.184.216.34');await proxy.close();assert.equal(proxy.sockets.size,0);
 console.log('PASS egress: pinned HTTP/CONNECT, private/mixed DNS, redirect revalidation, credentials and socket cleanup');
}finally{await proxy.close();await new Promise(resolve=>origin.close(resolve));}
