import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const daemon=await harnessFixture({stream:async({onChunk})=>{onChunk('Saved reply');return {completed:true};}});
const controllers=[];let timer;
try{
 await daemon.runFixture('shutdown-chat');const {port}=await daemon.start(),base=`http://127.0.0.1:${port}/api`;
 const log=daemon.harness.sessions.log,listeners=log.listenerCount('event');
 const readers=[];
 for(const route of ['/runs/shutdown-chat/stream','/sessions/shutdown-chat/events?stream=1']){
  const controller=new AbortController();controllers.push(controller);
  const response=await fetch(base+route,{signal:controller.signal});assert.equal(response.status,200);
  const reader=response.body.getReader();assert.equal((await reader.read()).done,false);readers.push(reader);
 }
 assert.equal(log.listenerCount('event'),listeners+1);
 await Promise.race([daemon.stop(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Daemon shutdown hung with chat streams connected')),1500);})]);
 clearTimeout(timer);
 for(const reader of readers){while(!(await reader.read()).done){}}
 assert.equal(log.listenerCount('event'),listeners,'Closing chat streams removes semantic listeners');
 console.log('PASS daemon shutdown closes connected chat streams and releases event listeners');
}finally{clearTimeout(timer);controllers.forEach(controller=>controller.abort());await daemon.closeFixture();}
