import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const d=await harnessFixture({stream:async({onChunk})=>{onChunk('One round');return {completed:true};}});
d.db.createSession('goal','fixture','Goal API');d.db.createSession('other','fixture','Other');
const {port}=await d.start(),base=`http://127.0.0.1:${port}/api/sessions`;
const request=async(session,method,body)=>{const r=await fetch(`${base}/${session}/goal`,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
try{
 assert.equal((await request('missing','GET')).status,404);assert.equal((await request('other','GET')).data.goal,null);
 assert.equal((await request('goal','POST',{objective:'test',requests:-1})).status,400);
 let result=await request('goal','POST',{objective:'Complete API task',steps:[{text:'One step'}]});assert.equal(result.status,201);let g=result.data.goal;
 assert.equal(g.phase,'paused');assert.equal((await request('goal','PATCH',{action:'start',expectedRevision:g.revision})).status,400);
 assert.equal((await request('goal','PATCH',{objective:'stale',expectedRevision:0})).status,409);
 result=await request('goal','PATCH',{objective:'Edited task',steps:[{text:'Edited step'}],expectedRevision:g.revision});assert.equal(result.status,200);g=result.data.goal;assert.equal(g.objective,'Edited task');
 result=await request('goal','PATCH',{action:'start',autoContinue:false,expectedRevision:g.revision});assert.equal(result.status,200);await d.harness.goals.drain('goal');g=(await request('goal','GET')).data.goal;assert.equal(g.roundsStarted,1);assert.equal(g.phase,'paused');
 assert.equal((await request('other','PATCH',{action:'pause',expectedRevision:g.revision})).status,400);
 result=await request('goal','PATCH',{action:'cancel',expectedRevision:g.revision});assert.equal(result.data.goal.phase,'cancelled');
 assert.equal(d.db.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n,1);console.log('Goal HTTP controls: scope, explicit activation, revision conflicts, edit, single round and cancellation passed');
}finally{await d.closeFixture();}
