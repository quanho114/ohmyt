import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createDaemon } from '../server/index.js';
import { AppDatabase } from '../server/db.js';
import { SessionStore, balanceToolResults } from '../server/harness/sessions.js';
import { selectHistory, fitRequest, estimateTokens } from '../server/harness/context.js';
import { toAnthropicMessages } from '../server/providers/adapters/anthropic.js';
import { toGeminiContents } from '../server/providers/adapters/google.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-harness-'));
const requests = [];
let mode = 'tools';
let releaseTool;
let toolStarted;
const provider = http.createServer(async(req,res)=>{
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push(body);
  res.writeHead(200, {'Content-Type':'text/event-stream'});
  const send = choice => res.write(`data: ${JSON.stringify({choices:[choice]})}\n\n`);
  if (mode === 'vision') {
    if (!body.messages.some(m=>m.role === 'tool')) send({delta:{tool_calls:[{index:0,id:'observe-1',type:'function',function:{name:'browser_observe',arguments:'{"tabId":7}'}}]},finish_reason:'tool_calls'});
    else {
      assert.equal(body.messages.filter(m=>m.role === 'tool').length,1);
      assert.equal(body.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(part=>part.type === 'image_url').length,1);
      send({delta:{content:'Screenshot verified.'},finish_reason:'stop'});
    }
  } else if (mode === 'budget') {
    if (body.tools?.length) send({delta:{tool_calls:[{index:0,id:`budget-${requests.length}`,type:'function',function:{name:'test_echo',arguments:'{"value":"budget"}'}}]},finish_reason:'tool_calls'});
    else send({delta:{content:'Budget reached; results verified.'},finish_reason:'stop'});
  } else if (mode === 'tools' && !body.messages.some(m=>m.role === 'tool')) {
    assert(body.messages[0].content.includes('EXTENSION_PROMPT'));
    assert(body.tools.some(tool=>tool.function.name === 'skill_load'));
    send({delta:{tool_calls:[
      {index:0,id:'echo-1',type:'function',function:{name:'test_echo',arguments:'{"value":"observed"}'}},
      {index:1,id:'memory-1',type:'function',function:{name:'memory_save',arguments:'{"category":"semantic","content":"HARNESS_MEMORY"}'}}
    ]},finish_reason:'tool_calls'});
  } else if (mode === 'blocked' || mode === 'waiting' || mode === 'slow') {
    send({delta:{tool_calls:[{index:0,id:`${mode}-1`,type:'function',function:{name:mode === 'waiting' ? 'test_write' : 'test_echo',arguments:'{"value":"observed"}'}}]},finish_reason:'tool_calls'});
  } else {
    assert.equal(body.messages.filter(m=>m.role === 'tool').length,2);
    assert.equal(body.messages.find(m=>m.role === 'tool').tool_call_id,'echo-1');
    assert(body.messages.find(m=>m.role === 'tool').content.includes('observed'));
    send({delta:{content:'Verified tool results.'},finish_reason:'stop'});
  }
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
let executions = 0, observations = 0;
const extension = {name:'test/extension',inject:['tools','systemPrompt'],apply(ctx){
  ctx.systemPrompt.section(ctx,{name:'test-extension',order:5,text:'EXTENSION_PROMPT'});
  for (const name of ['test_echo','test_write']) ctx.effect(()=>ctx.tools.register({name,scopes:['standalone'],description:'Fixture tool',parameters:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},execute:async(args,{signal})=>{
    executions++;
    if (mode === 'slow') { toolStarted(); await new Promise(resolve=>{releaseTool=resolve;signal.addEventListener('abort',resolve,{once:true});}); }
    signal.throwIfAborted();
    return {value:args.value};
  }}));
  ctx.on('tools/pre-execute', (call,_context,next)=>{
    assert(Object.isFrozen(call.arguments));
    return next();
  });
  ctx.on('tools/result', (_call,outcome)=>{assert(Object.isFrozen(outcome)); observations++;});
}};
const daemon = createDaemon({dbPath:path.join(temp,'app.db'),workspaceRoot:temp,port:0,plugins:[extension],harnessConfig:{maxSteps:2}});
try {
  const address = await daemon.start();
  const apiBase = `http://127.0.0.1:${address.port}/api`;
  const statusResponse = await fetch(apiBase+'/harness');assert.equal(statusResponse.status,200);
  const runtimeStatus = await statusResponse.json();assert(runtimeStatus.plugins.every(plugin=>plugin.state===2));assert.equal(runtimeStatus.config.maxSteps,2);
  daemon.db.createProvider({id:'fixture',name:'Fixture',type:'custom',base_url:`http://127.0.0.1:${provider.address().port}`});
  daemon.db.createModel({provider_id:'fixture',model_id:'fixture',capabilities_json:{tools:true}});
  daemon.db.upsertAgent({id:'fixture',name:'Fixture',avatar:'F',system_prompt:'Test',model_provider:'fixture',model_name:'fixture',temperature:.7});
  const session = id => {daemon.db.createSession(id,'fixture','Harness test');daemon.db.updateSession(id,'Harness test');daemon.db.db.prepare("UPDATE sessions SET approval_mode = 'full' WHERE id = ?").run(id);};
  session('tools');
  await daemon.agentLoop.run({runId:'tools-run',sessionId:'tools',prompt:'Use tools.'});
  assert.equal(daemon.db.getMessages('tools').at(-1).content,'Verified tool results.');
  assert.equal(executions,1);assert.equal(observations,2);
  const transcript = daemon.harness.sessions.get('tools-run');
  assert.equal(transcript.status,'completed');assert.equal(transcript.messages.filter(m=>m.role === 'tool').length,2);
  const history = daemon.harness.sessions.history('tools');
  assert.deepEqual(history.map(m=>m.role),['user','assistant','tool','tool','assistant']);
  assert.equal(toAnthropicMessages(history).messages[1].content.filter(p=>p.type === 'tool_use').length,2);
  assert.equal(toAnthropicMessages(history).messages[2].content.filter(p=>p.type === 'tool_result').length,2);
  assert.equal(toGeminiContents(history)[1].parts.filter(p=>p.functionCall).length,2);
  assert.equal(toGeminiContents(history)[2].parts.filter(p=>p.functionResponse).length,2);
  // Follow-up requests retain paired calls/results, while UI keeps ordinary chat messages.
  await daemon.agentLoop.run({runId:'followup-run',sessionId:'tools',prompt:'What happened?'});
  assert.equal(daemon.db.getMessages('tools').length,4);
  assert.equal(requests.at(-1).messages.filter(m=>m.role === 'tool').length,2);

  // Policy denies before any extension execution hook can reach a tool.
  mode='blocked';session('blocked');daemon.db.setPolicy('test_echo:*','DENY');
  await daemon.agentLoop.run({runId:'blocked-run',sessionId:'blocked',prompt:'Try denied tool.'});
  assert.equal(executions,1);
  assert.equal(daemon.harness.sessions.get('blocked-run').messages.filter(m=>m.role === 'tool').length,3);
  assert.equal(daemon.db.getRunEvents('blocked-run').filter(e=>e.event_type==='ToolCallStarted').length,0);
  assert.equal(daemon.db.db.prepare('SELECT status FROM runs WHERE id = ?').get('blocked-run').status,'failed');
  daemon.db.setPolicy('test_echo:*','ALLOW');

  // Configured step budget produces a tool-free final request.
  mode='budget';session('budget');
  const beforeBudget = requests.length;
  await daemon.agentLoop.run({runId:'budget-run',sessionId:'budget',prompt:'Continue until budget.'});
  assert.equal(requests.length-beforeBudget,3);assert.equal(requests.at(-1).tools,undefined);

  // Observer failure cannot erase the result of an executed action.
  await daemon.harness.mount({name:'test/failing-observer',apply(ctx){ctx.on('tools/result',()=>{throw new Error('observer fixture');});}});
  session('observer');
  await daemon.agentLoop.run({runId:'observer-run',sessionId:'observer',prompt:'Observe actual results.'});
  assert.equal(daemon.harness.sessions.get('observer-run').status,'completed');
  const observerResults = daemon.db.getRunEvents('observer-run').filter(event=>event.event_type === 'ToolCallCompleted');
  assert.equal(observerResults.length,2);assert(observerResults.every(event=>JSON.parse(event.payload).success));
  await daemon.harness.unmount('test/failing-observer');

  // Global skills cannot leak into project scopes; exact standalone IDs can load.
  const standalone = daemon.tools.forStandalone({scopeId:'standalone:tools'});
  const skill = daemon.skills.loadAllSkills()[0];
  assert(skill);
  daemon.skills.createSkill({id:'project-only',name:'Project only',description:'Private catalog',instructions:'PROJECT_PRIVATE_SKILL',scope:'project:other'});
  await assert.rejects(standalone.get('skill_load').execute({id:'project-only'},{scope:{scopeId:'standalone:tools'}}),/unavailable/);
  assert.equal((await standalone.get('skill_load').execute({id:'project-only'},{scope:{projectId:'other',scopeId:'project:other'}})).instructions,'PROJECT_PRIVATE_SKILL');
  assert((await standalone.get('skill_load').execute({id:skill.id},{scope:{scopeId:'standalone:tools'}})).instructions);
  await assert.rejects(standalone.get('skill_load').execute({id:skill.id},{scope:{projectId:'other',scopeId:'project:other'}}),/unavailable/);

  // Real harness path carries one transient browser image and stores metadata only.
  mode='vision';session('vision');
  daemon.db.createModel({provider_id:'fixture',model_id:'fixture-vision',capabilities_json:{vision:true,tools:true}});
  daemon.db.setSessionModelOverride('vision',{providerId:'fixture',modelId:'fixture-vision'});
  const image={name:'screen.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
  daemon.browserBridge.nativeCommand=async(action,args)=>action === 'tabs' ? [{id:7,url:'https://example.com',title:'Fixture'}] : {snapshotId:'vision-1',width:640,height:480,tabId:args.tabId,image};
  daemon.browserBridge.registerComputerTools(daemon.tools);
  await daemon.agentLoop.run({runId:'vision-run',sessionId:'vision',prompt:'Observe browser'});
  assert.equal(daemon.db.getMessages('vision').at(-1).content,'Screenshot verified.');
  assert(!daemon.harness.sessions.get('vision-run').messages_json.includes('data:image'));
  assert(!JSON.stringify(daemon.db.getRunEvents('vision-run')).includes('data:image'));
  assert.equal(daemon.browserBridge.computerLeases.size,0);

  // Unload removes only this plugin's contributions; reload does not duplicate hooks.
  await daemon.harness.unmount('test/extension');
  assert.equal(daemon.tools.get('test_echo'),undefined);
  assert(daemon.tools.get('memory_save'));
  await daemon.harness.mount(extension);
  await assert.rejects(daemon.harness.mount(extension),/Duplicate plugin/);
  await assert.rejects(daemon.harness.mount({name:'missing-dependency',inject:['missing'],apply(){}}),/dependency unavailable/);
  assert(!daemon.harness.plugins.has('missing-dependency'));

  // Async plugin teardown holds run admission until all contributions are removed.
  let releaseDisposal, disposalStarted;
  const disposing = new Promise(resolve=>{disposalStarted=resolve;});
  await daemon.harness.mount({name:'test/async-dispose',apply(ctx){ctx.effect(()=>async()=>{disposalStarted();await new Promise(resolve=>{releaseDisposal=resolve;});});}});
  const unloading = daemon.harness.unmount('test/async-dispose');
  await disposing;
  const refused = await fetch(apiBase+'/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'tools',prompt:'Wait'})});assert.equal(refused.status,409);
  await assert.rejects(daemon.agentLoop.run({runId:'during-unload',sessionId:'tools',prompt:'Wait'}),/stopping|changing/);
  releaseDisposal();await unloading;

  // Active tool cancellation drains the run before DB close; unload is refused while busy.
  mode='slow';session('slow');
  const started = new Promise(resolve=>{toolStarted=resolve;});
  const running = daemon.agentLoop.run({runId:'slow-run',sessionId:'slow',prompt:'Slow tool.'});
  await started;
  await assert.rejects(daemon.harness.unmount('test/extension'),/active runs/);
  daemon.harness.closing=true;
  await daemon.agentLoop.drain('Shutdown test');
  await running;
  assert.equal(daemon.agentLoop.activeRuns.size,0);
  assert.equal(daemon.harness.sessions.get('slow-run').status,'aborted');
  assert.equal(daemon.db.db.prepare('SELECT status FROM runs WHERE id = ?').get('slow-run').status,'aborted');
  releaseTool?.();
} finally {
  await daemon.stop();
  await daemon.stop();
  await new Promise(resolve=>provider.close(resolve));
}

// Programmatic composition can replace the loop driver and install provider adapters.
let driverRuns = 0;
const composed = createDaemon({dbPath:':memory:',workspaceRoot:temp,port:0,
  pluginOverrides:{'core/agentLoop':{name:'core/agentLoop',inject:['agents'],apply(ctx){ctx.provide('agentLoop',{run(options){driverRuns++;return ctx.agents._run(options);}});}}},
  plugins:[{name:'test/provider',inject:['modelGateway'],apply(ctx){ctx.effect(()=>ctx.modelGateway.registerAdapter('plugin-fixture',{discoverModels:async()=>[],streamChat:async({onChunk})=>{onChunk('Plugin provider result.');return {completed:true};}}));}}]
});
try {
  await composed.start();
  composed.db.createProvider({id:'plugin',name:'Plugin',type:'custom',config_json:{requestFormat:'plugin-fixture'}});
  composed.db.createModel({provider_id:'plugin',model_id:'plugin',capabilities_json:{tools:true}});
  composed.db.upsertAgent({id:'plugin',name:'Plugin',avatar:'P',system_prompt:'Test',model_provider:'plugin',model_name:'plugin',temperature:.7});
  composed.db.createSession('plugin','plugin','Plugin test');composed.db.updateSession('plugin','Plugin test');
  await composed.agentLoop.run({runId:'plugin-run',sessionId:'plugin',prompt:'Run plugin provider'});
  assert.equal(driverRuns,1);assert.equal(composed.db.getMessages('plugin').at(-1).content,'Plugin provider result.');
  await composed.harness.unmount('test/provider');assert.equal(composed.gateway.adapters.size,0);
} finally {await composed.stop();}

// Cold restart balances unfinished calls without invoking a tool or model.
let db = new AppDatabase(path.join(temp,'recovery.db'));
db.createSession('recovery','default-assistant','Recovery');db.createRun('crash','recovery');db.addMessage('crash-user','recovery','user','Write file');
let store = new SessionStore(db);store.begin('crash','recovery','crash-user');
store.settle('crash',[{role:'user',content:'Write file'},{role:'assistant',content:'',tool_calls:[{id:'unfinished',type:'function',function:{name:'fs_write',arguments:'{"path":"a","content":"b"}'}}]}],1);
db.close();db = new AppDatabase(path.join(temp,'recovery.db'));store = new SessionStore(db);
assert.deepEqual(store.recoverInterrupted(),['crash']);assert.deepEqual(store.recoverInterrupted(),[]);
assert(store.get('crash').messages.find(m=>m.role === 'tool').content.includes('outcome unknown'));
assert.equal(db.getMessages('recovery').length,2);
assert.equal(db.getRunEvents('crash').at(-1).event_type,'RunFailed');
assert.equal(store.history('recovery').at(-1).role,'assistant');
db.truncateMessagesAfter('recovery','crash-user');assert.equal(store.history('recovery').length,1);
const selected = selectHistory([{role:'user',content:'x'.repeat(2000)},{role:'assistant',content:'old'},{role:'user',content:'current'}],{contextTokens:200,reserveTokens:20});
assert.equal(selected.messages.length,1);assert.equal(selected.messages[0].content,'current');
const fitted = fitRequest([{role:'system',content:'Preserve policy'},{role:'user',content:'Current task'},{role:'assistant',content:'',tool_calls:[{id:'big',type:'function',function:{name:'read',arguments:'{}'}}]},{role:'tool',tool_call_id:'big',name:'read',content:'x'.repeat(6000)}],[],{contextTokens:1000,reserveTokens:100});
assert.equal(fitted.shortened,1);assert(fitted.messages.at(-1).content.includes('truncated'));
assert(fitted.estimatedTokens < 900);assert.equal(fitted.messages[0].content,'Preserve policy');
assert(estimateTokens([{type:'image_url',image_url:{url:'data:image/png;base64,'+'A'.repeat(6000000)}}]) < 3000);
assert.equal(balanceToolResults(store.get('crash').messages).filter(m=>m.role==='tool').length,1);
db.deleteSession('recovery');assert.equal(store.get('crash'),null);db.close();
fs.rmSync(temp,{recursive:true,force:true});
console.log('PASS harness: real Cordis lifecycle, local HTTP provider, tools/approval, canonical history, scoped skills, budgets, abort/drain, cold recovery');
