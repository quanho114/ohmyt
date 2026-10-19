import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harnessFixture} from '../harness_fixture.js';
const daemon=await harnessFixture({stream:async()=>({completed:true})});
let pluginDisposed=false;
await daemon.harness.mount({name:'fixture/cleanup',apply(ctx){ctx.effect(()=>()=>{pluginDisposed=true;});}});
daemon.harness.agents.registerDriver('broken-cleanup',()=>({run:async()=>{},dispose:async()=>{throw Error('Driver cleanup failed');}}));
await daemon.harness.agents.create({sessionId:'cleanup',driverId:'broken-cleanup'});
try{
 await assert.rejects(daemon.stop(),error=>error instanceof AggregateError);
 assert.equal(pluginDisposed,true,'A failed driver cleanup must not skip Cordis plugin disposal');
 assert.equal(daemon.harness.closed,true);assert.equal(daemon.db.isClosed,true);
 assert.equal(daemon.harness.agents.list().length,0);
 console.log('PASS cleanup failures retain errors while draining the harness, plugins and persistence');
}finally{await daemon.stop().catch(()=>{});fs.rmSync(daemon.fixtureRoot,{recursive:true,force:true});}
