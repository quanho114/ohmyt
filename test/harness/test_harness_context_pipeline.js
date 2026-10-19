import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const d=await harnessFixture({config:{contextTokens:6000,reserveTokens:500},stream:async options=>{options.onChunk('Hello');return {completed:true};}});
try{
 d.db.createSession('meter','fixture','Meter');d.db.createRun('meter-run','meter');d.db.addMessage('meter-user','meter','user','Hello');d.harness.sessions.begin('meter-run','meter','meter-user');
 await d.harness.request({runId:'meter-run',sessionId:'meter',providerId:'fixture',modelId:'fixture',messages:[{role:'user',content:'Hello'}],tools:[],currentTurnStart:0,step:1,onChunk:()=>{}});
 const usage=d.harness.sessions.log.latestContextUsage('meter');assert(usage?.used>0);assert.equal(usage.limit,6000);assert.equal(usage.modelId,'fixture');assert.equal(usage.providerId,'fixture');
 console.log('PASS live harness request pipeline persists context limits and route');
}finally{await d.closeFixture();}
