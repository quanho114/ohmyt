import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDaemon} from '../server/index.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-local-'));
const d=createDaemon({dbPath:':memory:',workspaceRoot:dir,hostEnabled:true,port:0,authToken:'test-token'});
try {
 assert(d.tools.get('shell_host'));assert(d.tools.get('runtime_info'));
 assert.equal(d.permissions.evaluate('shell_host','echo test').action,'ASK');
 const cmd=process.platform==='win32'?"Write-Output 'host-runtime-ok'":"printf host-runtime-ok";
 const output=await d.tools.get('shell_host').execute({command:cmd,cwd:dir},{runId:'host-test'});
 assert(output.success);assert(output.stdout.includes('host-runtime-ok'));
 assert.equal(d.tools.activeChildProcesses.size,0);
 const address=await d.start();const base=`http://127.0.0.1:${address.port}/api/sessions`;
 assert.equal((await fetch(base)).status,401);
 assert.equal((await fetch(base,{headers:{Authorization:'Bearer wrong'}})).status,401);
 assert.equal((await fetch(base,{headers:{Authorization:'Bearer test-token'}})).status,200);
 const other=createDaemon({dbPath:':memory:',workspaceRoot:dir});
 assert.equal(other.tools.get('shell_host'),undefined);other.db.close();
 console.log('✓ Native execution, permission gate, cleanup, authenticated loopback API and opt-in host mode passed');
}finally{await d.stop();fs.rmSync(dir,{recursive:true,force:true});}
