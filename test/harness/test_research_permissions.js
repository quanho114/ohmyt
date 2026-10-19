import assert from 'node:assert/strict';
import {AppDatabase} from '../../server/db.js';
import {PermissionEngine} from '../../server/permissions.js';
import {toolTarget} from '../../server/harness/host.js';
import {authorizeTool} from '../../server/harness/authorization.js';
import {ToolRegistry} from '../../server/tools.js';

const db=new AppDatabase(':memory:'),permissions=new PermissionEngine(db);
const target='https://blocked.example/source',scope={scopeId:'project:p',projectId:'p',approvalMode:'full'};
try{
  assert.equal(toolTarget({name:'web_fetch',arguments:{url:target}}),target,'canonical approval must see the actual source URL');
  for(const alias of ['web_fetch','browser_navigate','browser_open','browser_use_navigate']){
    db.setPolicy(alias+':'+target,'DENY');
    assert.equal(permissions.evaluate('web_fetch',target,scope).action,'DENY',alias+' destination DENY must not be bypassed');
    db.db.prepare('DELETE FROM tool_policies WHERE pattern=?').run(alias+':'+target);
  }
  db.setPolicy('browser_click:*','DENY');
  assert.equal(permissions.evaluate('web_fetch',target,scope).action,'ALLOW','an action-specific click denial does not prohibit a public read');
  const decision=await authorizeTool({permissions,emitEvent(){}},{call:{name:'web_fetch',arguments:{url:target}},toolContext:{runId:'r',scope,signal:new AbortController().signal},agent:{policy_json:'{"execution":"LOCAL_ONLY"}'},session:{id:'s'},runTools:{},target});
  assert.equal(decision.action,'DENY');assert.match(decision.reason,/LOCAL_ONLY/);
  const registry=new ToolRegistry(db),service={read:async()=>({content:'ok'})};registry.webReader=service;
  assert.equal(registry.forWorkspace(process.cwd(),scope).webReader,service);
  assert.equal(await registry.forStandalone({scopeId:'standalone:s'}).get('web_fetch').execute({url:target}).then(r=>r.content),'ok');
  assert.equal(permissions.evaluate('source_list','',scope).action,'ALLOW');
  assert.equal(permissions.evaluate('source_read','',scope).action,'ALLOW');
  console.log('PASS research authorization: URL targets, destination DENY aliases, LOCAL_ONLY and scoped reader propagation');
}finally{db.close();}
