import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {executeHostShell} from '../../server/local_runtime.js';
import {BubblewrapSandbox} from '../../server/sandbox/bubblewrap.js';

for(const kind of ['host','workspace'])test(`${kind} shell preserves Vietnamese and emoji across stdout/stderr chunks`,{skip:kind==='workspace'&&process.platform!=='linux'},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-shell-unicode-'));
  const sandbox=kind==='workspace'?new BubblewrapSandbox():null;
  const text='Tiếng Việt 📚';
  fs.writeFileSync(path.join(root,'unicode.mjs'),"const bytes=Buffer.from('Tiếng Việt 📚'); for(const stream of [process.stdout,process.stderr])for(const byte of bytes){stream.write(Buffer.from([byte]));await new Promise(r=>setTimeout(r,3));}");
  try {
    const request={command:'node unicode.mjs',cwd:root,workspaceRoot:root,timeout:5000};
    const result=sandbox?await sandbox.execute(request):await executeHostShell(request);
    assert.equal(result.success,true);assert.equal(result.stdout,text);assert.equal(result.stderr,text);
  } finally {await sandbox?.dispose();fs.rmSync(root,{recursive:true,force:true});}
});
