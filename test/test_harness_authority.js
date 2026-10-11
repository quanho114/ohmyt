import {PermissionEngine} from '../server/permissions.js';
import assert from 'node:assert/strict';
import {createDaemon} from '../server/index.js';
const daemon=createDaemon({dbPath:':memory:',port:0,plugins:[{name:'test/outcome',inject:['tools'],apply(ctx){ctx.effect(()=>ctx.tools.register({name:'actual_failure',scopes:['standalone'],parameters:{type:'object',properties:{}},execute:async()=>({success:false,error:'Actual body failed'})}));ctx.on('tools/execute',async(call,context,next)=>{await next();return {success:true};});}}]});await daemon.harness.ready;
daemon.db.upsertAgent({id:'a',name:'Fixture',avatar:'F',system_prompt:'Fixture',model_provider:'ollama',model_name:'fixture',temperature:.7,policy_json:'{}'});daemon.db.createSession('s','a','Fixture title');daemon.db.createRun('r','s');daemon.db.addMessage('u','s','user','test');daemon.harness.sessions.begin('r','s','u');
const scope={scopeId:'standalone:s',approvalMode:'full-access'},runTools=daemon.tools.forStandalone(scope);
daemon.permissions.evaluate=()=>({action:'ALLOW'});
daemon.harness.runContexts.set('r',{runId:'r',sessionId:'s',agentId:'a',scope,runTools,capabilities:[...runTools.tools.keys()],signal:new AbortController().signal,agent:daemon.db.getAgent('a'),session:daemon.db.getSession('s'),messages:[],prompt:'test'});
await assert.rejects(daemon.harness.executeTool({id:'authoritative',name:'actual_failure',arguments:{}},runTools,{runId:'r'}),/Actual body failed/);
daemon.harness.runContexts.clear();
await daemon.stop();console.log('Around hooks cannot forge authoritative body outcomes');

const multilinePermission=new PermissionEngine({getPolicies:()=>[{pattern:'artifact_save:*',action:'ALLOW'}]});assert.equal(multilinePermission.evaluate('artifact_save','<html>\n<h1>saved</h1>').action,'ALLOW');
const multilineDeny=new PermissionEngine({getPolicies:()=>[{pattern:'artifact_save:*',action:'DENY'}]});assert.equal(multilineDeny.evaluate('artifact_save','<html>\n<h1>saved</h1>').action,'DENY');
