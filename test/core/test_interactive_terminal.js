import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {InteractiveTerminals,handleTerminalRoutes} from '../../server/interactive_terminal.js';
const children=[];
const fakePty=(shell,args,options)=>{const e=new EventEmitter(); e.onData=f=>e.on('data',f);e.onExit=f=>e.on('exit',f);e.write=d=>e.input=d;e.resize=(...d)=>e.size=d;e.kill=()=>e.killed=true;children.push(e);e.options=options;return e;};
const db={getSession:id=>['a','b'].includes(id)?{id}:null};
const service=new InteractiveTerminals({db,workspaceRoot:process.cwd(),spawnPty:fakePty});
assert.throws(()=>service.open('missing',true),/Session not found/);
assert.throws(()=>service.open('a',false),/consent/);
// children[0]=a#1, children[1]=a#2, children[2]=b
const a=service.open('a',true),a2=service.open('a',true),b=service.open('b',true);
assert.notEqual(a.terminalId,a2.terminalId);
assert.equal(children[0].options.cwd,process.cwd());
assert.throws(()=>service.owned('a',a.terminalId,b.owner),/ownership/);
assert.throws(()=>service.owned('a',a.terminalId,undefined),/ownership/);
assert.throws(()=>service.owned('a','nope',a.owner),/ownership/);
children[0].emit('data','x'.repeat(200000));assert.equal(service.owned('a',a.terminalId,a.owner).output.length,131072);
async function route(method,suffix,body,owner=a.owner){const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);req.headers={'x-terminal-owner':owner};let result;const res={writeHead(){},end(text){result=text;}};await handleTerminalRoutes({terminals:service},req,res,{method,pathname:'/api/sessions/a/terminal'+suffix});return result;}
await assert.rejects(route('POST',`/${a2.terminalId}/input`,{data:'x'},b.owner),/ownership/);
await assert.rejects(route('POST',`/${a.terminalId}/input`,{data:'x'.repeat(8193)}),/Invalid terminal input/);
await assert.rejects(route('POST',`/${a.terminalId}/resize`,{cols:0,rows:20}),/dimensions/);
await assert.rejects(route('POST','',{consent:true,cwd:'C:\\'}),/Only consent/);
await assert.rejects(route('GET','/stream'),/route not found/);
await assert.rejects(route('DELETE',''),/route not found/);
await route('POST',`/${a.terminalId}/input`,{data:'hello'});assert.equal(children[0].input,'hello');
await route('POST',`/${a.terminalId}/resize`,{cols:100,rows:30});assert.deepEqual(children[0].size,[100,30]);
await route('DELETE',`/${a.terminalId}`);assert.equal(children[0].killed,true);assert.throws(()=>service.owned('a',a.terminalId,a.owner),/ownership/);
// Rapid second open must NOT reap the first shell (its stream attaches async after open).
service.dispose();

// Orphan reaping (renderer reload): streamless shells past the grace window are reaped; streamed ones are kept.
const reaper=new InteractiveTerminals({db,workspaceRoot:process.cwd(),orphanGraceMs:0,spawnPty:fakePty});
const t1=reaper.open('a',true);assert.equal(children.length,4);
const t2=reaper.open('a',true);assert.equal(children[3].killed,true);assert.equal(children.length,5);
reaper.owned('a',t2.terminalId,t2.owner).streams.add({write(){},destroy(){},end(){}});
const t3=reaper.open('a',true);assert.equal(children[4].killed,undefined);assert.equal(children.length,6);
assert.notEqual(t3.terminalId,t2.terminalId);
// Per-session limit (6); other sessions keep their own budget.
let limitError;for(let i=0;i<8;i++){try{const t=reaper.open('a',true);reaper.owned('a',t.terminalId,t.owner).streams.add({write(){},destroy(){},end(){}});}catch(e){limitError=e;break;}}
assert.match(limitError.message,/limit reached/);
reaper.open('b',true);
reaper.dispose();assert.equal(reaper.entries.size,0);
const {createApiServer}=await import('../../server/api.js');
for (const authToken of [null,'test-terminal-auth']) {
  const api=createApiServer({db,tools:{workspaceRoot:process.cwd()},agentLoop:new EventEmitter(),authToken,port:0});
  const address=await api.listen(0),url=`http://127.0.0.1:${address.port}/api/sessions/a/terminal`;
  try {
    let response=await fetch(url,{method:'POST',body:JSON.stringify({consent:true})});
    assert.equal(response.status,authToken?401:503);
    if(authToken){
      const headers={Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'};
      response=await fetch(url,{method:'POST',headers,body:JSON.stringify({consent:true,command:'forbidden'})});assert.equal(response.status,400);
      response=await fetch(url+'/input',{method:'POST',headers,body:JSON.stringify({data:'x'})});assert.equal(response.status,404);
      response=await fetch(url,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'});assert.equal(response.status,403);
    }
  } finally {await api.close();}
}
console.log('Interactive terminal multi-shell ownership, consent, limits, authenticated HTTP boundary and cleanup passed');
