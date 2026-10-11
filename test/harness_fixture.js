import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDaemon} from '../server/index.js';

// Production admission/driver/invocation; only model and external effects are fixtures.
export async function harnessFixture({stream,tools=[],config={},vision=false}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-contract-'));
  const daemon=createDaemon({dbPath:':memory:',port:0,workspaceRoot:root,dataDir:root,harnessConfig:config,
    pluginOverrides:{'core/llm':{name:'core/llm',apply(ctx){ctx.provide('llm',{streamChat:stream});}}},
    plugins:[{name:'test/contracts',inject:['tools'],apply(ctx){
      for(const tool of tools)ctx.effect(()=>ctx.tools.register({scopes:['standalone'],description:'Contract fixture',...tool}));
    }}]});
  await daemon.harness.ready;
  daemon.db.createProvider({id:'fixture',name:'Fixture',type:'custom',base_url:'http://127.0.0.1:1'});
  daemon.db.createModel({provider_id:'fixture',model_id:'fixture',capabilities_json:{vision,tools:true}});
  daemon.db.upsertAgent({id:'fixture',name:'Fixture',avatar:'F',system_prompt:'Fixture',model_provider:'fixture',model_name:'fixture',temperature:.7});
  daemon.permissions.evaluate=()=>({action:'ALLOW'});
  if(vision){daemon.browserBridge.nativeCommand=async()=>{};daemon.browserBridge.prepareSession=async()=>{};daemon.browserBridge.status=()=>({tabs:[]});}
  return Object.assign(daemon,{
    fixtureRoot:root,
    async runFixture(id,prompt='Complete the requested task',options={}){
      daemon.db.createSession(id,'fixture','Explicit fixture title');
      await daemon.agentLoop.run({runId:id,sessionId:id,prompt,...options});
      return {run:daemon.db.db.prepare('SELECT * FROM runs WHERE id=?').get(id),
        messages:daemon.db.getMessages(id),events:daemon.db.getRunEvents(id).map(e=>({type:e.event_type,payload:JSON.parse(e.payload)})),
        log:daemon.harness.sessions.log.readAll(id),history:daemon.harness.sessions.history(id)};
    },
    async closeFixture(){await daemon.stop();fs.rmSync(root,{recursive:true,force:true});}
  });
}
export const stringSchema={type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false};
