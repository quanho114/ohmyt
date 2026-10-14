import assert from 'node:assert/strict';
import {createDaemon} from '../server/index.js';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

let requests=0,executions=0;
const daemon=createDaemon({dbPath:':memory:',port:0,harnessConfig:{maxSteps:2},
 plugins:[{name:'fixture/budget-read',inject:['tools'],apply(ctx){
  ctx.effect(()=>ctx.tools.register({name:'fixture_budget_read',scopes:['standalone'],readOnly:true,
   description:'Read fixture',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false},
   execute:async()=>{executions++;return {content:'Known evidence'};}}));
 }}],
 pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async options=>{
  requests++;
  if(requests<=2)options.onToolCall({id:`read-${requests}`,name:'fixture_budget_read',arguments:{path:'README.md'}});
  else if(requests===3){
   assert.equal(options.tools.length,0);
   for(const [id,path] of [['limit-app','server/app.js'],['limit-contract','server/contract.js']])
    options.onToolCall({id,name:'fixture_budget_read',arguments:{path}});
  }else options.onChunk('Summary from available evidence; two files were not read.');
  return {completed:true};
 }});}}}});
try{
 await daemon.start();
 daemon.db.setPolicy('fixture_budget_read:*','ALLOW');
 daemon.db.createSession('budget-activity',daemon.db.getAgents()[0].id,'Budget activity');
 const events=[];daemon.agentLoop.on('event',event=>events.push(event));
 await daemon.agentLoop.run({runId:'budget-activity-run',sessionId:'budget-activity',prompt:'Read the project'});
 assert.equal(executions,2,'Budget rejection must not execute extra tools');
 assert.equal(requests,4,'Only one text-only recovery is allowed');
 const final=daemon.db.getMessages('budget-activity').findLast(m=>m.sender==='agent');
 const activity=JSON.parse(final.metadata).activity;
 assert.equal(activity.outcome.taskStatus,'partial');
 assert.deepEqual(activity.outcome.unresolvedCallIds,['limit-app','limit-contract']);
 for(const [id,path] of [['limit-app','server/app.js'],['limit-contract','server/contract.js']]){
  const tool=activity.tools.find(t=>t.id===id);
  assert(tool,`Rejected tool ${id} must appear in saved activity`);
  assert.equal(tool.status,'error');assert.equal(tool.input.path,path);
  assert.equal(tool.output.code,'TOOL_STEP_LIMIT');
  assert.equal(events.filter(e=>e.type==='ToolCallStarted'&&e.payload.toolId===id).length,1);
  const completed=events.filter(e=>e.type==='ToolCallCompleted'&&e.payload.toolId===id);
  assert.equal(completed.length,1);assert.equal(completed[0].payload.success,false);
 }
 assert.equal(activity.tools.length,4);
 const vite=await createServer({server:{middlewareMode:true},appType:'custom'});
 try{
  const {ResponseActivity}=await vite.ssrLoadModule('/src/components/ResponseActivity.tsx');
  for(const locale of ['vi','en']){
   const markup=renderToStaticMarkup(React.createElement(ResponseActivity,{
    tools:activity.tools,hasContent:true,locale,autoExpandTools:true,animated:false,isStreaming:true,
   }));
   assert(markup.includes(locale==='vi'?'đã đạt giới hạn bước công cụ':'tool step limit reached'));
   assert(markup.includes(locale==='vi'?'Đạt giới hạn':'Step limit'));
   assert(markup.includes('server/app.js'));assert(markup.includes('server/contract.js'));
  }
 }finally{await vite.close();}
 console.log('PASS budget rejection: live and persisted activity, exact paths, bounded recovery, no extra execution');
}finally{await daemon.stop();}
