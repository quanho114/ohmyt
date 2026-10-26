import assert from 'node:assert/strict';
import {createPlatformSandbox} from '../../server/sandbox/platform.js';
import {createWorkspaceSandbox} from '../../server/sandbox/index.js';

// Structured launch preserves arguments without platform-specific shell quoting.
const requests = [];
const fixture = createWorkspaceSandbox({status:()=>({available:true,reason:null}),execute:async request=>{requests.push(request);return {success:true};},cancel:()=>false,dispose:async()=>{}});
await fixture.execute({workspaceRoot:process.cwd(),argv:['node','-e','console.log("a; b")']});
assert.deepEqual(requests[0].argv, ['node','-e','console.log("a; b")']);
for (const argv of [[], [''], ['node', 2], ['node', 'bad\0argument']]) {
  await assert.rejects(fixture.execute({workspaceRoot:process.cwd(),argv}), /argv/);
}
await assert.rejects(fixture.execute({workspaceRoot:process.cwd(),command:'echo no',argv:['node']}), /not both/);
assert.equal(requests.length, 1);
await fixture.dispose();
assert.equal(createPlatformSandbox('linux').status().provider, 'bubblewrap');
for (const platform of ['win32', 'darwin', 'freebsd']) {
  const provider = createPlatformSandbox(platform);
  assert.equal(provider.status().available, false);
  assert.notEqual(provider.status().provider, 'bubblewrap');
  assert.match(provider.status().reason, /Host execution is not a fallback/);
  await assert.rejects(provider.execute({command:'echo forbidden'}), /unavailable/);
  assert.equal(provider.cancel('missing'), false);
  await provider.dispose();
  await provider.dispose();
  assert.equal(provider.status().reason, 'Sandbox disposed');
}
const sandbox = createWorkspaceSandbox();
assert.equal(sandbox.status().provider, process.platform === 'linux' ? 'bubblewrap' : process.platform === 'win32' ? 'windows-unavailable' : 'unsupported');
await sandbox.dispose();
// Capability discovery follows the trusted provider, not the host OS.
const {ToolRegistry} = await import('../../server/tools.js');
let available = true;
const registry = Object.create(ToolRegistry.prototype);
registry.sandbox = {status: () => ({available})};
registry.tools = new Map([
  ['shell_exec', {name:'shell_exec', description:'isolated shell', parameters:{}}],
  ['runtime_info', {name:'runtime_info', description:'runtime', parameters:{}}],
]);
assert.deepEqual(registry.getAllDefinitions().map(t => t.name), ['shell_exec', 'runtime_info']);
available = false;
assert.deepEqual(registry.getAllDefinitions().map(t => t.name), ['runtime_info']);
// Exercise the real scoped filesystem route: unavailable Windows must never write.
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const {rootIdentity} = await import('../../server/project_scope.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-sandbox-'));
try {
  const windows = createWorkspaceSandbox(createPlatformSandbox('win32'));
  const tools = new ToolRegistry({}, root, {hostEnabled:true, sandbox:windows});
  const scoped = tools.forWorkspace(root, {projectId:'fixture', scopeId:'project:fixture', canonicalRoot:fs.realpathSync(root), rootIdentity:rootIdentity(root)});
  assert.equal(scoped.getAllDefinitions().some(t => t.name === 'shell_exec'), false);
  assert.equal(scoped.get('shell_host'), undefined);
  await assert.rejects(scoped.get('fs_write').execute({path:'must-not-exist.txt',content:'forbidden'}), /Windows workspace sandbox is not implemented/);
  assert.equal(fs.existsSync(path.join(root, 'must-not-exist.txt')), false);
  await windows.dispose();
  const launches = [];
  const broker = createWorkspaceSandbox({status:()=>({available:true,reason:null}),execute:async(request,context)=>{launches.push({request,context});return {success:true,stdout:'{"success":true}',stderr:''};},cancel:()=>false,dispose:async()=>{}});
  const brokerTools = new ToolRegistry({},root,{sandbox:broker}).forWorkspace(root,{projectId:'fixture',scopeId:'project:fixture',canonicalRoot:fs.realpathSync(root),rootIdentity:rootIdentity(root)});
  await brokerTools.get('fs_write').execute({path:"quote ' and ;.txt",content:'exact payload'});
  assert.deepEqual(launches[0].request.argv.slice(0,2), ['node','-e']);
  assert.equal(launches[0].request.command, undefined);
  assert.equal(launches[0].context.fileBroker,true);
  assert.equal(JSON.parse(launches[0].context.stdin).content,'exact payload');
  assert.equal(JSON.parse(launches[0].context.stdin).path,"quote ' and ;.txt");
  assert.equal(fs.existsSync(path.join(root,"quote ' and ;.txt")),false,'Fixture dispatch must not perform host writes');
  await broker.dispose();
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
console.log('Platform sandbox selection, capability discovery and real scoped no-fallback route: passed (no native isolation claims)');
