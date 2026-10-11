import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createDaemon} from '../../../server/index.js';
import {SecretsVault} from '../../../server/providers/secrets.js';
import {Gateway} from '../../../server/providers/gateway.js';
const source=new DatabaseSync(path.resolve('data/app.db'),{readOnly:true});
const db={getProvider:id=>source.prepare('SELECT * FROM providers WHERE id=?').get(id),getProviders:()=>source.prepare('SELECT * FROM providers').all(),getModels:id=>source.prepare('SELECT * FROM models WHERE provider_id=?').all(id)};
const provider=db.getProviders().find(p=>p.enabled&&db.getModels(p.id).some(m=>m.model_id==='cx/gpt-6.1-sol'&&m.enabled));if(!provider)throw new Error('Configured benchmark model unavailable');
const model={providerId:provider.id,modelId:'cx/gpt-6.1-sol'};
const gateway=new Gateway(db,new SecretsVault(path.resolve('data')));
const featureEval=process.env.HARNESS_FEATURE_EVAL==='1';
let tasks=JSON.parse(fs.readFileSync(new URL(featureEval?'./tasks-features.json':'./tasks.json',import.meta.url)));
if(process.env.HARNESS_EVAL_TASK)tasks=tasks.filter(task=>task.id===process.env.HARNESS_EVAL_TASK);
const output=process.env.HARNESS_EVAL_OUTPUT || path.resolve(`.superpowers/sdd/2026-10-09-harness-full/${featureEval?'live-features':'live-benchmark'}.jsonl`);
const config={maxSteps:featureEval?8:5,browserMaxSteps:featureEval?8:5,contextTokens:24000,reserveTokens:4000,toolResultTokens:4000};
const runtimeHash=createHash('sha256');for(const name of fs.readdirSync(new URL('../../../server/harness/',import.meta.url)).filter(name=>name.endsWith('.js')).sort())runtimeHash.update(name).update(fs.readFileSync(new URL('../../../server/harness/'+name,import.meta.url)));const sourceHash=runtimeHash.digest('hex');
const configHash=createHash('sha256').update(JSON.stringify({config,autoTitle:false})).digest('hex');
const completed=new Set(fs.existsSync(output)?fs.readFileSync(output,'utf8').trim().split('\n').filter(Boolean).map(line=>{const r=JSON.parse(line);return `${r.mode}:${r.trial}:${r.taskId}`;}):[]);
async function benchmark(mode,trial,task){
 if(completed.has(`${mode}:${trial}:${task.id}`))return;
 let calls=[],writes=new Map(),unauthorized=0;let daemon;const started=Date.now();
 daemon=createDaemon({dbPath:':memory:',port:0,harnessConfig:config,plugins:[{name:'eval/fixtures',inject:['tools'],apply(ctx){for(const name of ['eval_read','eval_write','eval_denied'])ctx.effect(()=>ctx.tools.register({name,scopes:['standalone'],readOnly:name==='eval_read',resourceKeys:args=>[args.key],description:name==='eval_read'?'Read a fixture value by key.':name==='eval_write'?'Write a fixture value exactly once.':'A forbidden mutation; policy denies it.',parameters:{type:'object',properties:{key:{type:'string'},value:{type:'integer'}},required:['key'],additionalProperties:false},execute:async args=>{calls.push({name,...args});if(name==='eval_denied')unauthorized++;if(name==='eval_read'){if(task.kind==='steering')daemon.harness.inbox.enqueue({sessionId:'eval',clientMessageId:'live-steer',kind:'steering',targetRunId:'eval-run',content:'Include marker MARKER-PERSIST-17 in the final answer.'});return {value:task.value};}writes.set(args.key,(writes.get(args.key)||0)+1);return {success:true,value:args.value};}}));}}],pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:options=>gateway.streamChat({...options,...model})});}}}});
 let result;
 if(process.env.HARNESS_EVAL_FAIL_APPROVAL==='1'){const emit=daemon.agentLoop.emitEvent.bind(daemon.agentLoop);daemon.agentLoop.emitEvent=(id,type,payload)=>{emit(id,type,payload);if(type==='PermissionRequired')queueMicrotask(()=>daemon.agentLoop.abortRun(id,'Unexpected headless approval'));};}
 try{
 await daemon.harness.ready;
 if(mode==='compatibility'){daemon.agentLoop.harness=null;daemon.agentLoop.gateway={streamChat:options=>gateway.streamChat({...options,...model})};}
 if(featureEval){for(const name of ['artifact_save','subagent_spawn','subagent_wait','subagent_cancel','ptc_execute','memory_save','memory_search'])daemon.db.setPolicy(`${name}:*`,'ALLOW');if(task.kind==='mcp'){daemon.harness.connectors.add({id:'fixture',transport:'stdio',command:process.execPath,args:['test/fixtures/harness/mcp-server.js'],scopeId:'standalone'});await daemon.harness.connectors.connect('fixture');daemon.db.setPolicy('mcp__fixture__echo:*','ALLOW');}}
 daemon.db.setPolicy('eval_read:*','ALLOW');daemon.db.setPolicy('eval_write:*','ALLOW');daemon.db.setPolicy('eval_denied:*','DENY');
 daemon.db.createSession('eval',daemon.db.getAgents()[0].id,'Frozen evaluation');daemon.db.db.prepare('UPDATE sessions SET title_manual=1,title_topic_set=1 WHERE id=?').run('eval');
 const timer=setTimeout(()=>daemon.agentLoop.abortRun('eval-run','Evaluation deadline'),120000);
 try{await daemon.agentLoop.run({runId:'eval-run',sessionId:'eval',prompt:task.prompt});}finally{clearTimeout(timer);}
 const messages=daemon.db.getMessages('eval');const answer=messages.filter(m=>m.sender==='agent').at(-1)?.content || '';const status=daemon.db.db.prepare('SELECT status FROM runs WHERE id=?').get('eval-run')?.status;
 const artifacts=daemon.db.db.prepare('SELECT * FROM harness_artifacts WHERE session_id=?').all('eval');const children=daemon.db.db.prepare('SELECT * FROM harness_children WHERE parent_session_id=?').all('eval');
 const success=task.kind==='read'?calls.some(c=>c.name==='eval_read')&&answer.includes(String(task.value)):task.kind==='write'?writes.get(task.key)===1:task.kind==='deny'?unauthorized===0&&calls.length===0&&daemon.db.getRunEvents('eval-run').some(e=>e.event_type==='ToolCallBlocked'):task.kind==='artifact'?artifacts.some(a=>a.content.includes(task.marker)):task.kind==='child'?children.length>0&&children.every(c=>daemon.db.db.prepare('SELECT status FROM runs WHERE session_id=?').get(c.session_id)?.status==='completed')&&calls.some(c=>c.name==='eval_read'):task.kind==='ptc'?calls.filter(c=>c.name==='eval_read').length===1&&answer.includes(String(task.value)):task.kind==='mcp'?daemon.harness.sessions.log.readAll('eval').some(e=>e.type==='tool/result'&&e.payload.modelContent?.includes('MCP-MARKER-81')):task.kind==='steering'?answer.includes('MARKER-PERSIST-17')&&answer.includes(String(task.value)):task.kind==='memory'?daemon.db.db.prepare('SELECT content FROM memories').all().some(m=>m.content.includes(task.marker)):false;
 result={taskId:task.id,trial,mode,model:model.modelId,configHash,sourceHash,success,unauthorized,duplicateMutations:[...writes.values()].filter(n=>n>1).length,toolErrors:daemon.db.getRunEvents('eval-run').filter(e=>e.event_type==='ToolCallBlocked').length,contextLoss:null,latencyMs:Date.now()-started,cost:null,approvalTools:daemon.db.getRunEvents('eval-run').filter(e=>e.event_type==='PermissionRequired').map(e=>JSON.parse(e.payload || '{}').toolName),terminationReason:status || 'not-admitted'};
 }catch(error){result={taskId:task.id,trial,mode,model:model.modelId,configHash,sourceHash,success:false,latencyMs:Date.now()-started,cost:null,terminationReason:error.code || 'BENCHMARK_ERROR'};}
 finally{daemon.agentLoop.harness=daemon.harness;await daemon.stop();}
 fs.appendFileSync(output,JSON.stringify(result)+'\n');console.log(JSON.stringify(result));
}
const jobs=[];for(const mode of featureEval?['candidate']:['compatibility','candidate'])for(let trial=1;trial<=3;trial++)for(const task of tasks)jobs.push({mode,trial,task});
for(let i=0;i<jobs.length;i+=3)await Promise.all(jobs.slice(i,i+3).map(j=>benchmark(j.mode,j.trial,j.task)));
source.close();
