import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {CodexWindowsSandbox,buildWindowsLaunch} from '../../server/sandbox/codex-windows-provider.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-provider-'));
try {
  fs.writeFileSync(path.join(root,'.env'),'secret');
  const args=buildWindowsLaunch({workspaceRoot:root,argv:['node','-e','console.log(1)'],env:{SystemRoot:'C:\\Windows'}});
  assert(args.some(value=>value.startsWith('permissions=')&&value.includes(':root')&&value.includes('enabled=false')&&value.includes('.env')));
  assert(args.some(value=>value.includes('OHMYT_SANDBOX_WORKSPACE')));
  for(const key of ['permissions=','shell_environment_policy=']) {
    const inline=args.find(value=>value.startsWith(key));
    let braces=0,inString=false,escape=false;
    for(const char of inline.slice(key.length)) {
      if(escape){escape=false;continue;}
      if(inString&&char==='\\\\'){escape=true;continue;}
      if(char==='\"'){inString=!inString;continue;}
      if(!inString&&char==='{')braces++;
      if(!inString&&char==='}')braces--;
      assert(braces>=0,'Inline TOML cannot close before opening');
    }
    assert.equal(inString,false);assert.equal(braces,0,`${key} inline TOML tables must balance`);
  }
  assert.equal(args.at(-3),process.execPath);
  const provider=new CodexWindowsSandbox({env:{},platform:'win32'});
  assert.equal(provider.status().available,false);
  await assert.rejects(provider.execute({workspaceRoot:root,argv:['node']}),/unavailable/);
  const launches=[];
  const fixture=new CodexWindowsSandbox({spawnProcess:(exe,argv)=>{const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;launches.push(argv);setImmediate(()=>{child.stdout.end(' fixture ');child.emit('close',0,null);});return child;}});
  fixture.status=()=>({available:true});
  const output=await fixture.execute({workspaceRoot:root,argv:['node','-e','1']},{stdin:'payload',runId:'fixture'});
  assert.equal(output.stdout,'fixture');assert.equal(output.success,true);assert.equal(fixture.children.size,0);assert.equal(fixture.active.size,0);assert.equal(launches.length,1);
  await fixture.dispose();await provider.dispose();
  console.log('Codex Windows provider policy/lifecycle fixtures passed (not native isolation evidence)');
} finally {fs.rmSync(root,{recursive:true,force:true});}
