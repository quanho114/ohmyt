import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDaemon} from '../../server/index.js';
import {harnessFixture} from '../harness_fixture.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'goal-handoff-'));
const dbPath=path.join(root,'handoff.db');
const startedMarker=path.join(root,'mutate-started');
const makeDaemon=stream=>createDaemon({dbPath,dataDir:root,port:0,pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:stream});}}},
  plugins:[{name:'fixture/mutate',inject:['tools'],apply(ctx){ctx.effect(()=>ctx.tools.register({name:'mutate_fixture',scopes:['standalone'],description:'Fixture',parameters:{type:'object',properties:{}},
    execute:async(_args,context)=>{
      fs.appendFileSync(startedMarker,'1');
      // External mutation with an outcome that stays unknown until the run is stopped.
      await new Promise((resolve,reject)=>{
        const abort=()=>reject(Object.assign(new Error('Run stopped'),{code:'ABORTED'}));
        if(context.signal?.aborted)abort();else context.signal.addEventListener('abort',abort,{once:true});
      });
    }}));}}]});
const contextOf=messages=>messages.findLast(m=>typeof m.content==='string'&&m.content.startsWith('Current durable objective'));

let d1,d2;
try{
  // Round 1 adopts the goal; the automatic round 2 starts a mutation that is
  // still in flight when the daemon stops.
  d1=makeDaemon(async({messages,onToolCall,onChunk})=>{
    const pinned=contextOf(messages);
    const round=pinned?JSON.parse(pinned.content.split('\n')[1]).round:0;
    if(!pinned)onToolCall({id:'adopt',name:'goal_start',arguments:{objective:'Recovery handoff MARKER-HANDOFF-1',steps:[{text:'Mutate external state'}]}});
    else if(round===1)onChunk('Round 1 notes progress before the automatic round.');
    else if(round>=2&&!messages.some(m=>m.role==='tool'&&m.tool_call_id==='mutate'))onToolCall({id:'mutate',name:'mutate_fixture',arguments:{}});
    else onChunk('Should not be reached while the mutation is in flight.');
    return {completed:true,usage:{inputTokens:1,outputTokens:1}};
  });
  await d1.harness.ready;
  d1.db.createProvider({id:'fixture',name:'Fixture',type:'custom',base_url:'http://127.0.0.1:1'});
  d1.db.createModel({provider_id:'fixture',model_id:'fixture',capabilities_json:{tools:true}});
  d1.db.upsertAgent({id:'fixture',name:'Fixture',avatar:'F',system_prompt:'Fixture',model_provider:'fixture',model_name:'fixture',temperature:.7});
  d1.db.createSession('goal','fixture','Recovery handoff');
  d1.permissions.evaluate=()=>({action:'ALLOW'});
  await d1.agentLoop.run({runId:'handoff-human',sessionId:'goal',prompt:'Start the work'});
  for(let i=0;i<500&&!fs.existsSync(startedMarker);i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(fs.existsSync(startedMarker),'mutate tool never started');
  await d1.stop();
  d1=null;

  // Restart on the same database: the interrupted round reference survives and
  // resuming injects a recovery handoff naming the unresolved action.
  let handoffText=null;
  d2=makeDaemon(async({messages,onChunk})=>{
    const pinned=contextOf(messages);
    if(pinned)handoffText=pinned.content;
    onChunk('Resuming carefully without replaying the unknown action.');
    return {completed:true,usage:{inputTokens:1,outputTokens:1}};
  });
  await d2.harness.ready;
  d2.permissions.evaluate=()=>({action:'ALLOW'});
  const goals=d2.harness.goals;
  const goal=goals.get('goal');
  assert.equal(goal.phase,'blocked');
  assert.ok(goal.currentRound?.runId,'interrupted round reference survives the restart');
  goals.control('goal',{action:'start',expectedRevision:goal.revision,autoContinue:false});
  await goals.drain('goal');
  assert.ok(handoffText,'resumed round must receive the goal context');
  assert.ok(handoffText.includes('RECOVERY HANDOFF'),'handoff section missing from the resumed round context');
  assert.ok(handoffText.includes('mutate_fixture'),'handoff must name the unresolved action');
  assert.ok(/previous round 2/.test(handoffText),'handoff must reference the interrupted round number');
  const resumed=goals.get('goal');
  assert.equal(resumed.phase,'paused');
  assert.equal(resumed.roundsStarted,3);
}finally{
  if(d1)await d1.stop().catch(()=>{});
  if(d2)await d2.stop().catch(()=>{});
  fs.rmSync(root,{recursive:true,force:true});
}

// A clean round chain never injects a handoff.
{
 let handoffSeen=false;
 const d=await harnessFixture({stream:async({messages,onChunk})=>{
  const pinned=contextOf(messages);
  if(pinned&&pinned.content.includes('RECOVERY HANDOFF'))handoffSeen=true;
  onChunk('Working');return {completed:true,usage:{inputTokens:1,outputTokens:1}};
 }});
 try{
  d.db.createSession('goal','fixture','Clean chain');
  const goals=d.harness.goals;
  const created=goals.create('goal',{objective:'Clean objective MARKER-HANDOFF-2',maxRounds:2});
  goals.control('goal',{action:'start',expectedRevision:created.revision,autoContinue:true});
  await goals.drain('goal');
  assert.equal(goals.get('goal').phase,'blocked');
  assert.equal(goals.get('goal').reason,'limit_exhausted');
  assert.equal(handoffSeen,false);
 }finally{await d.closeFixture();}
}
console.log('✓ Recovery handoff: interrupted round carries unresolved actions into the resumed round context, clean chains stay handoff-free');
