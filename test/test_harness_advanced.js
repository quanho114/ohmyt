import assert from 'node:assert/strict';
import {createDaemon} from '../server/index.js';
let mode='child',executions=0;
const daemon=createDaemon({dbPath:':memory:',port:0,plugins:[{name:'fixture/echo',inject:['tools'],apply(ctx){ctx.effect(()=>ctx.tools.register({name:'fixture_echo',scopes:['standalone'],description:'Echo',parameters:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false},execute:async args=>{executions++;return args;}}));}}],pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async({messages,onToolCall,onChunk})=>{
 const current=messages.slice(messages.findLastIndex(m=>m.role==='user'));
 const tool=(name)=>[...current].reverse().find(m=>m.role==='tool'&&m.name===name);const call=(id,name,args)=>onToolCall({id,name,arguments:args});const user=current.find(m=>m.role==='user')?.content;
 if(mode==='child'){
  if(user==='Child check'){if(!tool('fixture_echo'))call('echo-child','fixture_echo',{value:42});else onChunk('Verified child evidence.');}
  else if(!tool('subagent_spawn'))call('spawn-root','subagent_spawn',{task:'Child check',capabilities:['fixture_echo']});
  else if(!tool('subagent_wait'))call('wait-root','subagent_wait',{childId:JSON.parse(tool('subagent_spawn').content).childId});else onChunk('Child check completed with evidence.');
 }else{if(!tool('ptc_execute'))call('program-root','ptc_execute',{code:"const r=await tools.call('fixture_echo',{value:42});output(r);"});else onChunk('Program execution result inspected.');}
 return {completed:true};}});}}}});
await daemon.start();for(const name of ['fixture_echo','subagent_spawn','ptc_execute'])daemon.db.setPolicy(`${name}:*`,'ALLOW');daemon.db.createSession('parent',daemon.db.getAgents()[0].id,'Parent');
await daemon.agentLoop.run({runId:'parent-run',sessionId:'parent',prompt:'Delegate check'});assert.equal(daemon.db.db.prepare('SELECT status FROM runs WHERE id=?').get('parent-run').status,'completed');assert.equal(executions,1);assert.equal(daemon.db.getSessions().length,1,'child session is not auto-added to sidebar');const child=daemon.db.db.prepare('SELECT * FROM harness_children WHERE parent_run_id=?').get('parent-run');assert(child);assert.equal(daemon.harness.sessions.log.readAll('parent').filter(e=>e.type==='child/end').length,1);
mode='ptc';await daemon.agentLoop.run({runId:'program-run',sessionId:'parent',prompt:'Program check'});assert.equal(executions,2);assert.equal(daemon.db.db.prepare('SELECT status FROM runs WHERE id=?').get('program-run').status,'completed');assert(daemon.db.getRunEvents('program-run').some(e=>e.event_type==='ToolCallCompleted'&&JSON.parse(e.payload).toolName==='fixture_echo'));
daemon.db.setPolicy('fixture_echo:*','DENY');await daemon.agentLoop.run({runId:'denied-run',sessionId:'parent',prompt:'Denied check'});assert.equal(executions,2);assert.equal(daemon.db.db.prepare('SELECT status FROM runs WHERE id=?').get('denied-run').status,'failed');
daemon.db.deleteSession('parent');assert.equal(daemon.db.getSession(child.session_id),undefined);await daemon.stop();console.log('Real default driver: child delegation, hidden scope, PTC policy and nested audit passed');
