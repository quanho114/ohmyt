import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDaemon } from '../server/index.js';
import { browserUseConfig } from '../server/browser_use.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-bu-settings-'));
const options={dbPath:path.join(root,'test.db'),port:0,browserUse:{...browserUseConfig({}),enabled:false}};
let daemon=createDaemon(options);
try {
 const address=await daemon.start();const url=`http://127.0.0.1:${address.port}/api/browser-use/config`;
 const save=body=>fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 daemon.browserBridge.nativeCommand = async () => ({});
 const prompt=()=>daemon.agentLoop.buildSystemPrompt({system_prompt:''},'', 'vi',daemon.tools);
 assert.match(prompt(),/not a Chrome extension/);
 assert.match(prompt(),/must enable Browser Use in Settings/);
 const initial=await (await fetch(url)).json();assert.equal(initial.enabled,false);assert.equal(typeof initial.installed,'boolean');
 assert.equal((await save({enabled:true,domains:['*.example.com']})).status,400);assert.equal(daemon.tools.get('browser_use_read'),undefined);
 assert.equal((await save({enabled:true,domains:['EXAMPLE.COM','example.com']})).status,200);assert.ok(daemon.tools.get('browser_use_select_dropdown'));
 assert.match(prompt(),/call browser_use_pdf with a filename/);
 const projectTools=daemon.tools.forWorkspace(root,{projectId:'project-test',scopeId:'project:project-test'});
 assert.match(daemon.agentLoop.buildSystemPrompt({system_prompt:''},'', 'vi',projectTools,{projectId:'project-test',scopeId:'project:project-test',approvalMode:'ask'}),/unavailable in project chats/);
 assert.equal(daemon.browserUse.runs.size,0);assert.deepEqual(daemon.browserUse.config.domains,['example.com']);
 daemon.agentLoop.activeRuns.set('busy',{});assert.equal((await save({enabled:false,domains:[]})).status,409);daemon.agentLoop.activeRuns.delete('busy');
 await daemon.stop();daemon=createDaemon(options);assert.equal(daemon.browserUse.config.enabled,true);assert.equal(daemon.browserUse.config.mode,'integrated');
 await daemon.browserUse.saveSettings({enabled:false,domains:[]});assert.equal(daemon.tools.get('browser_use_read'),undefined);
 console.log('PASS Browser Use settings: API validation, atomic failure, no child processes, active-run protection, persistence and disable');
}finally{await daemon.stop();fs.rmSync(root,{recursive:true,force:true});}
