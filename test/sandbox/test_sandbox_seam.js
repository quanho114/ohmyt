import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDaemon} from '../../server/index.js';
import {ToolRegistry} from '../../server/tools.js';
import {rootIdentity} from '../../server/project_scope.js';
import {createWorkspaceSandbox} from '../../server/sandbox/index.js';
import {BubblewrapSandbox} from '../../server/sandbox/bubblewrap.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-sandbox-seam-'));
const root = path.join(temp,'project');
fs.mkdirSync(root);
const scope = {scopeId:'project:fixture',canonicalRoot:root,rootIdentity:rootIdentity(root)};
const calls = [], cancellations = [];
let disposals = 0;
const provider = {
  status:()=>({provider:'fixture',available:true,reason:null}),
  execute:async(request,context)=>{calls.push({request,context});return {command:request.command,exitCode:0,signal:null,stdout:'fixture',stderr:'',success:true};},
  cancel:runId=>{cancellations.push(runId);return true;},
  dispose:async()=>{disposals++;}
};
let daemon;
try {
  assert.throws(()=>createWorkspaceSandbox({}),/requires status/);
  const sandbox = createWorkspaceSandbox(provider);
  const registry = new ToolRegistry({},root,{sandbox});
  const scoped = registry.forWorkspace(root,scope);
  assert.equal(scoped.sandbox,sandbox);
  assert.equal(registry.forStandalone({scopeId:'standalone:fixture'}).sandbox,sandbox);
  const controller = new AbortController();
  const context = {runId:'fixture',signal:controller.signal};
  assert.equal((await scoped.get('shell_exec').execute({command:'fixture-command'},context)).stdout,'fixture');
  assert.equal(calls[0].request.scope,scope);
  assert.equal(calls[0].request.workspaceRoot,root);
  assert.equal(calls[0].context.signal,controller.signal);
  assert.equal(registry.killProcessesForRun('fixture'),true);
  assert.deepEqual(cancellations,['fixture']);
  await assert.rejects(()=>scoped.get('shell_exec').execute({command:'escape',cwd:temp}),/ngoài workspace/);
  await assert.rejects(()=>scoped.get('shell_exec').execute({command:'missing',cwd:'missing'}),/không tồn tại/);
  await assert.rejects(()=>scoped.get('shell_exec').execute({command:'invalid',timeout:0}),/timeout/);
  controller.abort();
  await assert.rejects(()=>scoped.get('shell_exec').execute({command:'aborted'},context),/abort/i);
  fs.renameSync(root,root+'-old');fs.mkdirSync(root);
  await assert.rejects(()=>scoped.get('shell_exec').execute({command:'replaced'}),/root changed/);
  assert.equal(calls.length,1,'Invalid scope/cwd/cancellation must not dispatch to provider');

  const unavailable = createWorkspaceSandbox({...provider,status:()=>({available:false,reason:'disabled fixture'})});
  const unavailableTools = new ToolRegistry({},root,{hostEnabled:true,sandbox:unavailable});
  await assert.rejects(()=>unavailableTools.get('shell_exec').execute({command:'touch fallback-must-not-exist'}),/unavailable/);
  await assert.rejects(()=>unavailableTools.forWorkspace(root,{...scope,rootIdentity:rootIdentity(root)}).get('fs_write').execute({path:'fallback-must-not-exist',content:'blocked'}),/unavailable/);
  assert.equal(calls.length,1,'No provider or host fallback when sandbox is unavailable');
  assert.equal(fs.existsSync(path.join(root,'fallback-must-not-exist')),false);
  assert.equal(unavailableTools.describeRuntime().execution.workspace,'unavailable');

  daemon = createDaemon({dbPath:':memory:',workspaceRoot:root,port:0,sandboxProvider:provider});
  await daemon.harness.ready;
  assert.equal(daemon.harness.ctx.sandbox,daemon.tools.sandbox);
  daemon.db.createSession('s','default-assistant','Fixture');
  daemon.db.createRun('r','s');daemon.db.addMessage('u','s','user','fixture');
  daemon.harness.sessions.begin('r','s','u');
  const runScope = {scopeId:'project:fixture',canonicalRoot:root,rootIdentity:rootIdentity(root),approvalMode:'ask'};
  const runTools = daemon.tools.forWorkspace(root,runScope);
  daemon.harness.runContexts.set('r',{runId:'r',sessionId:'s',agentId:'default-assistant',scope:runScope,runTools,
    capabilities:[...runTools.tools.keys()],signal:new AbortController().signal,agent:daemon.db.getAgent('default-assistant'),session:daemon.db.getSession('s'),messages:[],prompt:'fixture'});
  daemon.permissions.evaluate=()=>({action:'DENY'});
  await assert.rejects(()=>daemon.harness.executeTool({id:'denied',name:'shell_exec',arguments:{command:'denied'}},runTools,{runId:'r'}));
  assert.equal(calls.length,1,'Canonical authorization must deny before provider dispatch');
  daemon.harness.runContexts.clear();
  await daemon.stop();daemon=null;
  assert.equal(disposals,1,'Cordis owns provider cleanup');
  await sandbox.dispose();await sandbox.dispose();
  assert.equal(disposals,2,'Facade disposal is idempotent');
  await assert.rejects(()=>sandbox.execute({workspaceRoot:root,command:'closed'}),/disposed/);

  const missing = createWorkspaceSandbox(new BubblewrapSandbox({executable:path.join(temp,'missing-bwrap')}));
  assert.equal(missing.status().available,false);
  await assert.rejects(()=>missing.execute({workspaceRoot:root,command:'touch fallback-must-not-exist'}),/unavailable/);
  await missing.dispose();

  if (process.platform === 'linux') {
    const real = new BubblewrapSandbox();
    const realSandbox = createWorkspaceSandbox(real);
    try {
      const waitForFile = async file => {
        for(let i=0;i<200&&!fs.existsSync(file);i++)await new Promise(resolve=>setTimeout(resolve,10));
        assert(fs.existsSync(file),'Sandbox child must start before cancellation');
      };
      const signal = new AbortController();
      const marker = path.join(root,'abort-started');
      const pending = realSandbox.execute({workspaceRoot:root,command:'touch abort-started; sleep 5; touch abort-late'}, {runId:'abort',signal:signal.signal});
      const rejected = assert.rejects(pending,/abort/i);
      await waitForFile(marker);signal.abort();await rejected;
      assert.equal(real.children.size,0);assert.equal(real.activeChildProcesses.size,0);
      assert.equal(fs.existsSync(path.join(root,'abort-late')),false);
      const cancelled = realSandbox.execute({workspaceRoot:root,command:'touch cancel-started; sleep 5; touch cancel-late'}, {runId:'cancel-only'});
      const survivor = realSandbox.execute({workspaceRoot:root,command:'touch survivor-started; sleep 0.2; touch survivor-finished'}, {runId:'survivor'});
      await waitForFile(path.join(root,'cancel-started'));
      await waitForFile(path.join(root,'survivor-started'));
      assert.equal(realSandbox.cancel('cancel-only'),true);
      assert.equal((await cancelled).success,false);
      assert.equal((await survivor).success,true);
      assert.equal(fs.existsSync(path.join(root,'cancel-late')),false);
      assert.equal(fs.existsSync(path.join(root,'survivor-finished')),true);
      await assert.rejects(()=>realSandbox.execute({workspaceRoot:root,command:'sleep 5',timeout:25}),/quá thời gian/);
      const output = await realSandbox.execute({workspaceRoot:root,command:"node -e \"process.stdout.write('x'.repeat(600000))\""});
      assert.equal(output.success,true);assert(output.stdout.length<501000);assert(output.stdout.includes('truncated'));
      const closing = realSandbox.execute({workspaceRoot:root,command:'touch dispose-started; sleep 5; touch dispose-late'});
      await waitForFile(path.join(root,'dispose-started'));
      await realSandbox.dispose();assert.equal((await closing).success,false);
      assert.equal(real.children.size,0);assert.equal(fs.existsSync(path.join(root,'dispose-late')),false);
    } finally {await realSandbox.dispose();}
  }
  console.log('Sandbox seam: scoped dispatch, DENY, unavailable/no fallback, Cordis disposal, real abort/timeout/output limits passed');
} finally {
  if(daemon)await daemon.stop();
  fs.rmSync(temp,{recursive:true,force:true});
}
