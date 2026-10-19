import assert from 'node:assert/strict';
import {createDaemon} from '../../server/index.js';
for (const limits of [{maxRequests:8,maxToolCalls:100},{maxRequests:30,maxToolCalls:3},{}]) {
 const natural = Object.keys(limits).length === 0;
 let executions=0, requests=0;
 const daemon=createDaemon({dbPath:':memory:',port:0,harnessConfig:limits,
  plugins:[{name:'fixture/adaptive',inject:['tools'],apply(ctx){ctx.effect(()=>ctx.tools.register({
   name:'adaptive_read',scopes:['standalone'],readOnly:true,description:'Read fixture',
   parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({value:++executions}),
  }));}}],
  pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async options=>{
   requests++;
   if(options.tools.length && (!natural || executions<8))options.onToolCall({id:`call-${requests}`,name:'adaptive_read',arguments:{}});
   else options.onChunk(natural?'All eight steps verified.':'Verified partial results; task remains unfinished because the shared budget ended.');
   return {completed:true};
  }});}}}});
 try {
  await daemon.start();daemon.db.setPolicy('adaptive_read:*','ALLOW');
  daemon.db.createSession('adaptive',daemon.db.getAgents()[0].id,'Already named');
  await daemon.agentLoop.run({runId:'adaptive-run',sessionId:'adaptive',prompt:'Read until complete'});
  assert(executions>0);assert(executions<=(limits.maxToolCalls ?? 100));
  assert(requests<=(limits.maxRequests ?? 100));
  assert.equal(executions,natural?8:limits.maxToolCalls===3?3:5);
  const final=daemon.db.getMessages('adaptive').findLast(m=>m.sender==='agent');
  if(natural) { assert.match(final.content,/eight steps/); assert.equal(requests,9); }
  else { assert.match(final.content,/unfinished/); assert.notEqual(JSON.parse(final.metadata).activity.outcome.taskStatus,'completed'); }
 } finally {await daemon.stop();}
}
console.log('Adaptive shared request/tool budgets: bounded effects, reserved conclusion and partial outcome passed');
