import assert from 'node:assert/strict';
import { AgentRegistry } from '../../server/harness/agents.js';
let finish, started=0;
const registry=new AgentRegistry({driver:{run:async({signal})=>{started++;await new Promise(resolve=>{finish=resolve;signal.addEventListener('abort',resolve,{once:true});});return 'done';}}});
const handle=await registry.create({sessionId:'s',scope:{scopeId:'standalone'}});
const running=handle.run({runId:'r'});
await assert.rejects(handle.run({runId:'r2'}),/busy/);
const sibling=await registry.create({sessionId:'s',scope:{scopeId:'standalone'}});
await assert.rejects(sibling.run({runId:'r3'}),/busy/);
const other=await registry.create({sessionId:'other',scope:{scopeId:'standalone'}});
const concurrent=other.run({runId:'r4'});
assert.equal(started,2);
await other.dispose();await concurrent;
handle.abort();await running;
assert.equal(registry.sessionOwners.size,0);
await handle.dispose();await handle.dispose();
assert.equal(registry.list().length,1);
await sibling.dispose();
const failed=new AgentRegistry({driver:{run:async()=>{}},initialize:async()=>{throw new Error('init');}});
await assert.rejects(failed.create({sessionId:'x',scope:{}}),/init/);assert.equal(failed.list().length,0);
const pauses=new AgentRegistry({driver:{run:async({handle,signal})=>{handle.pause();setTimeout(()=>handle.resume(),10);await handle.boundary(signal);return 42;}}});
const paused=await pauses.create({sessionId:'p',scope:{}});assert.equal(await paused.run({runId:'p1'}),42);await pauses.dispose();
console.log('Agent registry lifecycle passed');

const factories=new AgentRegistry({driver:{run:async()=>{}}});await assert.rejects(factories.create({sessionId:'unknown',driverId:'missing'}),/unavailable/);let disposedDriver=0;const unload=factories.registerDriver('custom',async()=>({run:async()=>42,dispose:async()=>{disposedDriver++;}}));const custom=await factories.create({sessionId:'custom',driverId:'custom'});assert.equal(await custom.run({runId:'custom-run'}),42);assert.throws(unload,/Dispose/);await custom.dispose();unload();assert.equal(disposedDriver,1);await factories.dispose();

// Shutdown must wait for driver resources that are still being constructed.
const factoryEntered=Promise.withResolvers(),factoryGate=Promise.withResolvers();let lateDriverDisposed=0;
const shuttingDown=new AgentRegistry({driver:{run:async()=>{}}});
shuttingDown.registerDriver('slow',async()=>{factoryEntered.resolve();await factoryGate.promise;return {run:async()=>{},dispose:async()=>{lateDriverDisposed++;}};});
const creating=shuttingDown.create({sessionId:'slow',driverId:'slow'});
const rejectedCreation=assert.rejects(creating,/unavailable|disposed/i);
await factoryEntered.promise;
let shutdownFinished=false;const shutdown=shuttingDown.dispose().then(()=>{shutdownFinished=true;});
await Promise.resolve();await Promise.resolve();
assert.equal(shutdownFinished,false,'shutdown must drain pending driver construction');
factoryGate.resolve();await rejectedCreation;await shutdown;
assert.equal(lateDriverDisposed,1,'late driver resources must be disposed exactly once');
assert.equal(shuttingDown.list().length,0);
console.log('Shutdown drains driver construction and disposes late resources');

const {getEventListeners}=await import('node:events');
const repeatedPauses=new AgentRegistry({driver:{run:async({handle,signal})=>{
  for(let i=0;i<15;i++){
    handle.pause();const boundary=handle.boundary(signal);
    assert.equal(handle.state,'paused');handle.resume();await boundary;
    assert.equal(getEventListeners(signal,'abort').length,0,'resuming removes the pause abort listener');
  }
}}});
await repeatedPauses.execute({sessionId:'repeat-pause',runId:'repeat-pause'});await repeatedPauses.dispose();
console.log('Repeated pause/resume releases cancellation listeners');

let scopedRuns=0;
const scopedRegistry=new AgentRegistry({driver:{run:async({input})=>{scopedRuns++;assert.equal(input.sessionId,'owned-session');return 'ok';}}});
const scopedHandle=await scopedRegistry.create({sessionId:'owned-session'});
await assert.rejects(scopedHandle.run({sessionId:'other-session',runId:'foreign'}),/session/i);
assert.equal(scopedRuns,0,'A handle cannot execute under another session admission');
assert.equal(await scopedHandle.run({runId:'owned'}),'ok','Omitted session inherits the handle owner');
await scopedRegistry.dispose();
console.log('Agent handles enforce their admitted session identity');

const disposingEntered=Promise.withResolvers(),disposeGate=Promise.withResolvers();
const cleanupRegistry=new AgentRegistry({driver:{run:async()=>{}}});
cleanupRegistry.registerDriver('broken',()=>({run:async()=>{},dispose:async()=>{throw Error('Driver cleanup failed');}}));
cleanupRegistry.registerDriver('waiting',()=>({run:async()=>{},dispose:async()=>{disposingEntered.resolve();await disposeGate.promise;}}));
await cleanupRegistry.create({sessionId:'broken',driverId:'broken'});await cleanupRegistry.create({sessionId:'waiting',driverId:'waiting'});
let disposalSettled=false;
const cleanup=cleanupRegistry.dispose().then(()=>{disposalSettled=true;},error=>{disposalSettled=true;return error;});
await disposingEntered.promise;await new Promise(resolve=>setImmediate(resolve));
assert.equal(disposalSettled,false,'A failed cleanup must not return before sibling resources drain');
disposeGate.resolve();const cleanupError=await cleanup;
assert(cleanupError instanceof AggregateError);assert.match(cleanupError.errors[0].message,/Driver cleanup failed/);
assert.equal(cleanupRegistry.list().length,0,'Failed driver disposal still releases the registry handle');
console.log('Driver disposal failures drain all siblings and release handle ownership');
