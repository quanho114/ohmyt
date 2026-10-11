import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {AppDatabase} from '../server/db.js';
import {ToolRegistry} from '../server/tools.js';
import {PermissionEngine} from '../server/permissions.js';
import {BrowserUseRuntime} from '../server/browser_use.js';
import {createApiServer} from '../server/api.js';
const db=new AppDatabase(':memory:');db.createSession('chat','default-assistant','Browser API');db.createSession('other','default-assistant','Other');
const tools=new ToolRegistry(db),permissions=new PermissionEngine(db),loop=new EventEmitter();loop.activeRuns=new Map([['parent',{sessionId:'chat',abortController:new AbortController()}]]);loop.resolveModel=()=>({providerId:'ollama',modelId:'fixture'});loop.emitEvent=(_run,type,payload)=>{if(type==='PermissionRequired')permissions.resolveApproval(payload.requestId,'ALLOW_ONCE');};
const runtime=new BrowserUseRuntime({enabled:true,mode:'standalone',python:process.execPath,domains:['example.com']},{spawnProcess:(_python,_args,options)=>spawn(process.execPath,[new URL('./fixtures/browser_use_sidecar.cjs',import.meta.url).pathname],options)});runtime.initializeSettings(db,tools);runtime.registerTools(tools);
const api=createApiServer({db,tools,permissions,agentLoop:loop,browserUse:runtime,port:0,authToken:'test-token'});const address=await api.listen(0);const base=`http://127.0.0.1:${address.port}/api/`;
const request=(url,body,token='test-token')=>fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
try{
 assert.equal((await request('browser-use/runs?sessionId=chat',undefined,'wrong')).status,401);
 const rpc=async(method,params={})=>(await request('browser-use/mcp?sessionId=chat&runId=parent',{jsonrpc:'2.0',id:1,method,params})).json();
 assert((await rpc('initialize',{protocolVersion:'2024-11-05'})).result);assert.equal((await request('browser-use/mcp?sessionId=chat&runId=parent',{jsonrpc:'2.0',method:'notifications/initialized'})).status,204);
 assert.equal((await rpc('tools/call',{name:'browser_use_read',arguments:{}})).result.isError,false);
 assert.equal((await request('browser-use/runs/parent/control?sessionId=other',{action:'pause'})).status,409);
 assert.equal((await request('browser-use/runs/parent/control?sessionId=chat',{action:'pause'})).status,200);
 assert.equal((await (await request('browser-use/runs?sessionId=chat')).json()).runs[0].state,'paused');
 assert.equal((await request('browser-use/runs/parent/control?sessionId=chat',{action:'resume'})).status,200);
 const controller=new AbortController();const stream=await fetch(base+'browser-use/runs/parent/events?sessionId=chat&stream=1',{headers:{Authorization:'Bearer test-token'},signal:controller.signal});const reader=stream.body.getReader();let data='';while(!data.includes('action_completed')){const chunk=await reader.read();assert(!chunk.done);data+=new TextDecoder().decode(chunk.value);}assert(data.includes('action_completed'));assert(!data.includes('example.com'));controller.abort();await reader.cancel().catch(()=>{});
 assert.equal((await request('browser-use/workflow?sessionId=chat&runId=parent',{steps:[{name:'browser_use_read',arguments:{}}]})).status,200);
 const client=spawn(process.execPath,['integrations/browser-use/mcp.js'],{env:{...process.env,OHMYT_MCP_API:base,OHMYT_MCP_RUN:'parent',OHMYT_MCP_CHAT:'chat',OHMYT_MCP_TOKEN:'test-token'},stdio:['pipe','pipe','pipe']});
 let wire='',diagnostics='';client.stdout.on('data',chunk=>{wire+=chunk;});client.stderr.on('data',chunk=>{diagnostics+=chunk;});
 const timeout=setTimeout(()=>client.kill(),5000);
 client.stdin.end([{jsonrpc:'2.0',id:41,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:42,method:'tools/list'}].map(value=>JSON.stringify(value)).join('\n')+'\n');
 const code=await new Promise(resolve=>client.once('close',resolve));clearTimeout(timeout);assert.equal(code,0,diagnostics);
 const responses=wire.trim().split('\n').map(line=>JSON.parse(line));assert.equal(responses.length,2);assert.equal(responses[0].id,41);assert(responses[1].result.tools.some(tool=>tool.name==='browser_use_task'));assert.equal(diagnostics,'');

 console.log('PASS authenticated browser APIs: MCP stdio transport, parent ownership, control endpoints, event SSE and bounded workflow');
}finally{await runtime.close();await api.close();db.close();}
