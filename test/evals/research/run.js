import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDaemon} from '../../../server/index.js';
import {SecretsVault} from '../../../server/providers/secrets.js';
import {Gateway} from '../../../server/providers/gateway.js';
import {sourceGrounding} from '../../../server/harness/research_sources.js';

// Opt-in: uses the configured model and public network, never the user's chat
// history. All new state and outputs stay in a disposable evaluation directory.
if(!process.argv.includes('--live'))throw Error('Live model evaluation requires --live');
const dataDir=path.resolve(process.env.RESEARCH_EVAL_DATA||'data');
const source=new DatabaseSync(path.join(dataDir,'app.db'),{readOnly:true});
const config={getProvider:id=>source.prepare('SELECT * FROM providers WHERE id=?').get(id),getProviders:()=>source.prepare('SELECT * FROM providers').all(),getModels:id=>source.prepare('SELECT * FROM models WHERE provider_id=?').all(id)};
const selected=source.prepare('SELECT s.model_override_json,a.model_provider,a.model_name FROM sessions s JOIN agents a ON a.id=s.agent_id ORDER BY s.updated_at DESC LIMIT 1').get();
const defaults=selected?.model_override_json?JSON.parse(selected.model_override_json):{providerId:selected?.model_provider,modelId:selected?.model_name};
const route={providerId:process.env.RESEARCH_EVAL_PROVIDER||defaults.providerId,modelId:process.env.RESEARCH_EVAL_MODEL||defaults.modelId};
class ReadOnlyVault extends SecretsVault{
  ensureKey(){const key=Buffer.from(fs.readFileSync(this.keyFile,'utf8').trim(),'hex');if(key.length!==32)throw Error('Invalid evaluation key');return this.key=key;}
  set(){throw Error('Evaluation vault is read-only');}remove(){throw Error('Evaluation vault is read-only');}
}
const gateway=new Gateway(config,new ReadOnlyVault(dataDir));gateway.resolve(route.providerId,route.modelId);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-research-live-'));
const daemon=createDaemon({dbPath:':memory:',dataDir:root,workspaceRoot:root,port:0,harnessConfig:{maxRequests:20,maxToolCalls:16},
  pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:options=>gateway.streamChat({...options,...route})});}}}});
const started=Date.now();
try{
  await daemon.harness.ready;
  const id='research-live';daemon.db.createSession(id,daemon.db.getAgents()[0].id,'Read-only research evaluation');
  daemon.db.db.prepare("UPDATE sessions SET title_manual=1,title_topic_set=1,approval_mode='full' WHERE id=?").run(id);
  daemon.db.createProvider({id:route.providerId,name:'Evaluation route',type:'custom',base_url:'http://127.0.0.1:1'});
  const model=config.getModels(route.providerId).find(model=>model.model_id===route.modelId);
  daemon.db.createModel({provider_id:route.providerId,model_id:route.modelId,capabilities_json:model?.capabilities_json||{tools:true},context_window:model?.context_window});
  daemon.db.setSessionModelOverride(id,route);
  daemon.harness.profiles.save({id:'research-eval',version:1,name:'Read-only research',plugins:['tools/web','research/sources']});daemon.harness.profiles.select('research-eval',{sessionId:id});
  // The preset exposes only these read tools. Do not add a browser-destination
  // DENY as a stand-in for capability filtering: web_fetch must honor that DENY.
  for(const name of ['web_search','web_fetch','source_list','source_read'])daemon.db.setPolicy(name+':*','ALLOW');
  daemon.agentLoop.on('event',event=>{if(event.type==='ToolCallCompleted')console.log(JSON.stringify({tool:event.payload.toolName,status:event.payload.executionStatus,url:event.payload.output?.url,code:event.payload.output?.code}));});
  const timer=setTimeout(()=>daemon.agentLoop.abortRun(id,'Live research evaluation deadline'),180000);
  try{await daemon.agentLoop.run({runId:id,sessionId:id,responseLanguage:'vi',prompt:process.env.RESEARCH_EVAL_PROMPT||'Nghiên cứu repo https://github.com/deepseek-ai/deepseek-harness giúp tôi. Giải thích kiến trúc, kiểm tra một luồng agent trong mã triển khai và tìm test liên quan, rồi đánh giá giới hạn. Đọc nguồn trực tiếp, dẫn link cạnh nhận định, nêu chính xác những gì chưa kiểm chứng. Không chạy mã, cài đặt, sửa file hoặc tạo goal; giới hạn trong một lượt nghiên cứu chỉ đọc.'});}finally{clearTimeout(timer);}
  const events=daemon.harness.sessions.log.readAll(id),receipts=events.filter(e=>e.type==='tool/result').map(e=>({...e.payload,output:undefined}));
  const sources=[...new Map(receipts.filter(r=>r.executionReceipt?.source).map(r=>[r.executionReceipt.source.id,r.executionReceipt.source])).values()];
  const final=daemon.db.getMessages(id).filter(m=>m.sender==='agent').at(-1),answer=final?.content||'';
  const run=daemon.db.db.prepare('SELECT status FROM runs WHERE id=?').get(id);
  const grounding=sourceGrounding(answer,receipts);
  const report={model:route.modelId,durationMs:Date.now()-started,runStatus:run?.status,outcome:daemon.harness.sessions.outcome(id),observedSources:sources,grounding,
    toolCalls:events.filter(e=>e.type==='tool/call').map(e=>({name:e.payload.name,args:e.payload.arguments})),
    settlements:receipts.map(receipt=>({name:receipt.name,status:receipt.status,callId:receipt.callId})),
    usage:final?JSON.parse(final.metadata||'{}').activity?.usage:null,
    structuralChecks:{completed:run?.status==='completed',readMultipleSources:sources.length>=3,citesReadSource:grounding.citedSources>0,onlyReadTools:events.filter(e=>e.type==='tool/start').every(e=>['web_search','web_fetch','source_list','source_read'].includes(e.payload.name))},
    limitation:'One live trial. Structural checks do not prove factual correctness or long-horizon completion quality.',answer};
  const output=path.join(root,'report.json');fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({output,...Object.fromEntries(Object.entries(report).filter(([key])=>!['answer','toolCalls','usage','observedSources'].includes(key)))}));
  if(!Object.values(report.structuralChecks).every(Boolean))process.exitCode=1;
}finally{await daemon.stop();source.close();}
