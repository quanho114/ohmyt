import assert from 'node:assert/strict';
import {harnessFixture} from '../harness_fixture.js';
const d=await harnessFixture({stream:async()=>({completed:true})});
try{
 assert.equal(d.harness.config.contextTokens,100000);
 d.db.createSession('capacity','fixture','Capacity');d.db.createRun('capacity-run','capacity');d.db.addMessage('capacity-user','capacity','user','Hello');d.harness.sessions.begin('capacity-run','capacity','capacity-user');
 const request=()=>d.harness.requestModel({runId:'capacity-run',providerId:'fixture',modelId:'fixture',messages:[{role:'user',content:'Hello'}],tools:[]});
 await request();assert.equal(d.harness.sessions.log.latestContextUsage('capacity').limit,100000);
 const model=d.db.getModels('fixture')[0];d.db.updateModel(model.id,{context_window:32000});
 await request();assert.equal(d.harness.sessions.log.latestContextUsage('capacity').limit,32000,'Declared smaller model window still caps requests');
 d.db.updateModel(model.id,{context_window:200000});await request();assert.equal(d.harness.sessions.log.latestContextUsage('capacity').limit,100000);
 console.log('PASS default context 100k with lower model window cap');
}finally{await d.closeFixture();}
