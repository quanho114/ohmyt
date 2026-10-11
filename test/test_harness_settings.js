import assert from 'node:assert/strict';
import {createDaemon} from '../server/index.js';
const daemon=createDaemon({dbPath:':memory:',port:0,plugins:[{name:'test/settings',apply(){}}]});await daemon.start();
const base=`http://127.0.0.1:${daemon.apiServer.server.address().port}/api`;
let response=await fetch(`${base}/extensions`);assert.equal(response.status,200);const list=await response.json();assert(list.extensions.some(e=>e.id==='test/settings'));
response=await fetch(`${base}/extensions/${encodeURIComponent('test/settings')}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:false,expectedVersion:1})});assert.equal(response.status,200);assert(!daemon.harness.plugins.has('test/settings'));
response=await fetch(`${base}/extensions/${encodeURIComponent('test/settings')}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,expectedVersion:1})});assert.equal(response.status,409);
await daemon.stop();console.log('Extension API optimistic updates passed');
