import fs from 'node:fs';
import path from 'node:path';
import {createDaemon} from '../../../server/index.js';
const [root,cut]=process.argv.slice(2),crash=()=>process.kill(process.pid,'SIGKILL');
const daemon=createDaemon({dbPath:path.join(root,'fixture.db'),dataDir:root,port:0,
 pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:async options=>{if(!options.messages.some(m=>m.role==='tool'))options.onToolCall({id:'mutation',name:'crash_write',arguments:{}});else options.onChunk('Recorded fixture result.');return {completed:true};}});}}},
 plugins:[{name:'test/crash',inject:['tools'],apply(ctx){ctx.effect(()=>ctx.tools.register({name:'crash_write',scopes:['standalone'],description:'Crash fixture mutation',parameters:{type:'object',properties:{}},execute:async()=>{fs.appendFileSync(path.join(root,'effects'),'one\n');if(cut==='abort-effect'){daemon.agentLoop.abortRun('r');crash();}if(cut==='effect')crash();return {written:true};}}));}}]});
await daemon.harness.ready;daemon.db.createSession('s',daemon.db.getAgents()[0].id,'Crash fixture');daemon.permissions.evaluate=()=>({action:'ALLOW'});
const record=daemon.harness.sessions.record.bind(daemon.harness.sessions);
daemon.harness.sessions.record=(id,event)=>{const value=record(id,event);if((cut==='intent'&&event.type==='tool/call')||(cut==='start'&&event.type==='tool/start')||(cut==='receipt'&&event.type==='tool/result'&&event.payload.executionReceipt))crash();return value;};
const add=daemon.db.addMessage.bind(daemon.db);daemon.db.addMessage=(...args)=>{if(cut==='before-final'&&args[2]==='agent')crash();return add(...args);};
const complete=daemon.harness.sessions.completeTurn.bind(daemon.harness.sessions);daemon.harness.sessions.completeTurn=input=>{const result=complete(input);if(cut==='after-final')crash();return result;};
await daemon.agentLoop.run({runId:'r',sessionId:'s',prompt:'Perform one fixture mutation'});
throw new Error('Expected crash cut was not reached');
