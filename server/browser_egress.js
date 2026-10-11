import http from 'node:http';
import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { createRequire } from 'node:module';
const { publicAddress } = createRequire(import.meta.url)('../electron/browser-network-policy.cjs');

// Connections use the exact validated address. Chromium never resolves the origin
// for these TCP connections, so a second DNS answer cannot rebind the destination.
export class BrowserEgress {
  constructor({ lookup = dnsLookup, connect = net.connect, timeoutMs = 5000, maxSockets = 64 } = {}) {
    this.lookup=lookup;this.connect=connect;this.timeoutMs=timeoutMs;this.maxSockets=maxSockets;
    this.sockets=new Set();this.closed=false;this.stats={allowed:0,denied:0};
    this.server=http.createServer((req,res)=>void this.forward(req,res));
    this.server.on('connect',(req,socket,head)=>void this.tunnel(req,socket,head));
    this.server.on('upgrade',(_req,socket)=>socket.destroy());
    this.server.on('connection',socket=>{
      if(this.closed || this.sockets.size>=maxSockets){socket.destroy();return;}
      this.track(socket);socket.setTimeout(60000,()=>socket.destroy());
    });
    this.server.on('clientError',(_error,socket)=>socket.destroy());
  }
  track(socket){if(this.sockets.size>=this.maxSockets)socket.destroy();this.sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>this.sockets.delete(socket));return socket;}
  async start(){await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});this.url=`http://127.0.0.1:${this.server.address().port}`;return this.url;}
  async destination(url){
    if(this.closed || !['http:','https:'].includes(url.protocol) || url.username || url.password)throw Error('Destination denied');
    const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))throw Error('Destination denied');
    let timer;
    try{
      const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await Promise.race([
        this.lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS timeout')),this.timeoutMs);})]);
      if(this.closed || !addresses.length || !addresses.every(record=>publicAddress(record.address)))throw Error('Destination denied');
      return {host,address:addresses[0].address,family:net.isIP(addresses[0].address),port:Number(url.port || (url.protocol==='https:'?443:80))};
    }finally{clearTimeout(timer);}
  }
  async forward(req,res){
    let upstream;
    try{
      const url=new URL(req.url);if(url.protocol!=='http:')throw Error('Use CONNECT for TLS');
      const dest=await this.destination(url);if(req.destroyed || this.closed)return res.destroy();
      const headers={...req.headers,host:url.host};
      const connection=String(headers.connection||'').split(',').map(s=>s.trim().toLowerCase());
      for(const header of [...connection,'connection','proxy-authorization','proxy-connection','keep-alive','upgrade','te','trailer'])delete headers[header];
      const agent=new http.Agent({keepAlive:false});agent.createConnection=options=>this.track(this.connect({...options,host:dest.address}));
      upstream=http.request({hostname:dest.address,family:dest.family,port:dest.port,method:req.method,path:url.pathname+url.search,headers,agent},response=>{
        const responseHeaders={...response.headers};delete responseHeaders['proxy-authenticate'];
        res.writeHead(response.statusCode,responseHeaders);response.pipe(res);
      });
      this.stats.allowed++;upstream.setTimeout(30000,()=>upstream.destroy());
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
      req.once('aborted',()=>upstream.destroy());res.once('close',()=>{upstream.destroy();agent.destroy();});req.pipe(upstream);
    }catch{this.stats.denied++;if(!res.headersSent)res.writeHead(403);res.end('Browser network destination denied');}
  }
  async tunnel(req,client,head){
    try{
      if(!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+):[0-9]+$/i.test(req.url))throw Error('Invalid CONNECT');
      const dest=await this.destination(new URL(`https://${req.url}/`));
      if(client.destroyed || this.closed)return client.destroy();
      const remote=this.track(this.connect({host:dest.address,port:dest.port,family:dest.family}));
      const timer=setTimeout(()=>remote.destroy(),this.timeoutMs);
      remote.once('connect',()=>{clearTimeout(timer);if(client.destroyed||this.closed)return remote.destroy();this.stats.allowed++;client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);client.pipe(remote);remote.pipe(client);});
      remote.once('error',()=>{clearTimeout(timer);client.destroy();});
      remote.once('close',()=>{clearTimeout(timer);client.destroy();});client.once('close',()=>remote.destroy());
    }catch{this.stats.denied++;client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');}
  }
  async close(){if(this.closed)return;this.closed=true;const draining=[...this.sockets].map(socket=>new Promise(resolve=>{socket.once('close',resolve);socket.destroy();}));await Promise.all(draining);if(this.server.listening)await new Promise(resolve=>this.server.close(resolve));}
}
