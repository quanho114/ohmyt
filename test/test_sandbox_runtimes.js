import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../',import.meta.url));
const runtimes=[
  {name:'Node',executable:process.execPath,env:{...process.env}},
  {name:'Electron',executable:require('electron'),env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}}
];
for(const runtime of runtimes) {
  const tests=['test/test_project_isolation.js'];
  if(process.platform==='linux')tests.push('test/test_large_sandbox.js');
  for(const test of tests) {
    console.log(`Checking ${runtime.name}: ${test}`);
    const result=spawnSync(runtime.executable,[test],{cwd:root,env:runtime.env,stdio:'inherit',timeout:60000});
    if(result.error)throw result.error;
    if(result.status!==0)throw new Error(`${runtime.name} sandbox test failed (${result.signal||result.status})`);
  }
}
