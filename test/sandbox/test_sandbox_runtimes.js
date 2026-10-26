import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const runtimes=[
  {name:'Node',executable:process.execPath,env:{...process.env}},
  {name:'Electron',executable:require('electron'),env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}}
];
for(const runtime of runtimes) {
  const tests=['test/sandbox/test_platform_selection.js','test/sandbox/test_sandbox_seam.js','test/sandbox/test_project_isolation.js'];
  if(process.platform==='linux')tests.push('test/sandbox/test_large_sandbox.js','test/sandbox/test_file_edits.js');
  for(const test of tests) {
    console.log(`Checking ${runtime.name}: ${test}`);
    const result=spawnSync(runtime.executable,[test],{cwd:root,env:runtime.env,stdio:'inherit',timeout:60000});
    if(result.error)throw result.error;
    if(result.status!==0)throw new Error(`${runtime.name} sandbox test failed (${result.signal||result.status})`);
  }
}
