import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDaemon} from '../../../server/index.js';
import {SecretsVault} from '../../../server/providers/secrets.js';
import {Gateway} from '../../../server/providers/gateway.js';
import {cases} from './cases.js';

// Explicit live evaluation: synthetic conversations and a disposable project.
// Configuration and vault are read locally; never print credentials or endpoints.
const dataDir=path.resolve(process.env.CONVERSATION_EVAL_DATA || 'data');
for(const name of ['app.db','.vault.key','secrets.enc.json'])if(!fs.existsSync(path.join(dataDir,name)))throw new Error('Configured model/vault unavailable');
const source=new DatabaseSync(path.join(dataDir,'app.db'),{readOnly:true});
const db={getProvider:id=>source.prepare('SELECT * FROM providers WHERE id=?').get(id),getProviders:()=>source.prepare('SELECT * FROM providers').all(),getModels:id=>source.prepare('SELECT * FROM models WHERE provider_id=?').all(id)};
const session=source.prepare("SELECT s.model_override_json,a.model_provider,a.model_name FROM sessions s JOIN agents a ON a.id=s.agent_id WHERE s.project_id IS NOT NULL ORDER BY s.updated_at DESC LIMIT 1").get();
const selected=session?.model_override_json?JSON.parse(session.model_override_json):{providerId:session?.model_provider,modelId:session?.model_name};
const route={providerId:process.env.CONVERSATION_EVAL_PROVIDER || selected.providerId,modelId:process.env.CONVERSATION_EVAL_MODEL || selected.modelId};
class ReadOnlyVault extends SecretsVault {
  ensureKey(){
    const key=Buffer.from(fs.readFileSync(this.keyFile,'utf8').trim(),'hex');
    if(key.length!==32)throw new Error('Invalid evaluation vault key');
    return this.key=key;
  }
}
const gateway=new Gateway(db,new ReadOnlyVault(dataDir));gateway.resolve(route.providerId,route.modelId);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-conversation-eval-'));
const project=path.join(root,'project');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'README.md'),'# Lantern\nA local reading-list app. It saves book titles offline. Run with npm start.');
const records=[];
const daemon=createDaemon({dbPath:':memory:',workspaceRoot:root,port:0,harnessConfig:{maxSteps:2},pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:options=>gateway.streamChat({...options,...route})});}}}});
try {
  await daemon.harness.ready;
  daemon.db.addProject('fixture','Fixture project',project);
  for(const tool of daemon.tools.tools.values())daemon.db.setPolicy(`${tool.name}:*`,['fs_read','fs_list','request_user_input','get_goal'].includes(tool.name)?'ALLOW':'DENY');
  const selectedCases=process.env.CONVERSATION_EVAL_CASE ? cases.filter(c=>c.id===process.env.CONVERSATION_EVAL_CASE) : cases;
  if(!selectedCases.length)throw new Error('Unknown conversation evaluation case');
  for(const scenario of selectedCases){
    const id=scenario.id;daemon.db.createSession(id,'default-assistant','Synthetic project overview','fixture');
    daemon.db.db.prepare('UPDATE sessions SET workflow_id=?,title_manual=1,title_topic_set=1 WHERE id=?').run('project-overview',id);
    for(const [index,[sender,content]] of scenario.history.entries())daemon.db.addMessage(`${id}-history-${index}`,id,sender,content);
    const requested=[];
    const listener=event=>{
      if(event.runId!==id)return;
      if(event.type==='PermissionRequired')daemon.permissions.resolveApproval(event.payload.requestId,'DENY');
      if(event.type==='UserInputRequired'){
        requested.push(event.payload);
        queueMicrotask(()=>daemon.agentLoop.abortRun(id,'Evaluation captured clarification'));
      }
    };
    daemon.agentLoop.on('event',listener);
    const timer=setTimeout(()=>daemon.agentLoop.abortRun(id,'Evaluation deadline'),30000);
    const started=Date.now();let error=null;
    try{await daemon.agentLoop.run({runId:id,sessionId:id,prompt:scenario.prompt});}catch(e){error=e.code || e.name;}
    finally{clearTimeout(timer);daemon.agentLoop.off('event',listener);}
    const semantic=daemon.harness.sessions.log.readAll(id);
    const calls=semantic.filter(e=>e.type==='tool/call').map(e=>e.payload.name);
    const answer=daemon.db.getMessages(id).filter(m=>m.sender==='agent').at(-1)?.content || '';
    const runStatus=daemon.db.db.prepare('SELECT status FROM runs WHERE id=?').get(id)?.status;
    const settled=runStatus==='completed'||scenario.expect==='clarify'&&requested.length>0;
    const observedCalls=scenario.expect==='read'?calls.some(name=>['fs_read','fs_list'].includes(name)):scenario.expect==='conversation'?calls.length===0:calls.every(name=>name==='request_user_input');
    const structuralPass=!error&&settled&&observedCalls;
    records.push({id,expect:scenario.expect,model:route.modelId,calls,runStatus,structuralPass,answer,clarification:requested.length>0,questions:requested.flatMap(r=>r.questions),error,durationMs:Date.now()-started});
    console.log(JSON.stringify({id,calls,structuralPass,durationMs:Date.now()-started}));
  }
  const output=path.resolve(process.env.CONVERSATION_EVAL_OUTPUT || path.join(root,'results.json'));
  fs.writeFileSync(output,JSON.stringify(records,null,2));console.log(JSON.stringify({report:output}));
  process.exitCode=records.some(r=>!r.structuralPass)?1:0;
} finally {await daemon.stop();source.close();fs.rmSync(project,{recursive:true,force:true});}
