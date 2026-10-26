import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runtimePaths,copyRuntime,stage} from '../rules/stage.mjs';
import {sha256} from '../build-info/manifest.mjs';
const require=createRequire(import.meta.url);
const config=require('../rules/electron-builder.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sky-release-test-'));
try{
 for(const entry of runtimePaths){
  const file=path.join(root,entry);fs.mkdirSync(path.dirname(file),{recursive:true});
  if(path.extname(entry))fs.writeFileSync(file,'fixture');
  else {fs.mkdirSync(file,{recursive:true});fs.writeFileSync(path.join(file,'runtime.js'),'fixture');}
 }
 fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data','secrets.enc.json'),'PRIVATE');
 fs.writeFileSync(path.join(root,'server','.env'),'PRIVATE');
 fs.mkdirSync(path.join(root,'integrations/browser-use/.venv'));fs.writeFileSync(path.join(root,'integrations/browser-use/.venv','private'),'PRIVATE');
 const out=path.join(root,'staged');copyRuntime(root,out);
 assert(fs.existsSync(path.join(out,'server/runtime.js')));
 assert(!fs.existsSync(path.join(out,'data')));
 assert(!fs.existsSync(path.join(out,'server/.env')));
 assert(!fs.existsSync(path.join(out,'integrations/browser-use/.venv')));
 assert(!fs.existsSync(path.join(out,'node_modules')));
 assert.throws(()=>stage(root,path.join(root,'other')),/Unexpected/);
 fs.symlinkSync(path.join(root,'data'),path.join(root,'server','link'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>copyRuntime(root,path.join(root,'symlink-test')),/symlinks/);
 assert.equal(config.asar,false);
 assert.equal(config.extraMetadata.main,'electron/main.cjs');
 assert.equal(config.publish,null);
 assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 console.log('PASS release: runtime allowlist, credentials/cache exclusion, symlink rejection, safe staging, Electron entry and hashing');
}finally{fs.rmSync(root,{recursive:true,force:true});}
