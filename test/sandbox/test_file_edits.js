import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {AppDatabase} from '../../server/db.js';
import {ToolRegistry} from '../../server/tools.js';
import {rootIdentity} from '../../server/project_scope.js';
import {PermissionEngine} from '../../server/permissions.js';
import {editTextFile} from '../../server/file_edits.js';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sky-file-edits-'));
const root=path.join(temp,'project');fs.mkdirSync(root);
const db=new AppDatabase(':memory:');
const registry=new ToolRegistry(db,root);
const scope={projectId:'p',scopeId:'project:p',canonicalRoot:root,rootIdentity:rootIdentity(root),approvalMode:'ask'};
const scoped=registry.forWorkspace(root,scope);
const digest=value=>createHash('sha256').update(value).digest('hex');
try{
 for(const tools of [registry,scoped]){
  const file=path.join(root,'script.sh');
  const original='#!/bin/sh\r\n# tiếng Việt 🦈\r\necho old\r\n# untouched\r\n';
  fs.writeFileSync(file,original,{mode:0o755});fs.chmodSync(file,0o755);
  const read=await tools.get('fs_read').execute({path:'script.sh'});
  assert.equal(read.sha256,digest(original),'fs_read returns a hash of the actual bytes');
  const edit=tools.get('fs_edit');assert(edit,'a scoped exact edit tool is available');
  const args={path:'script.sh',expectedHash:read.sha256,oldText:'echo old',newText:'echo new'};
  const preview=await edit.execute({...args,dryRun:true});
  assert.equal(fs.readFileSync(file,'utf8'),original,'preview never writes');
  assert.equal(preview.applied,false);assert(preview.diff.includes('-echo old'));assert(preview.diff.includes('+echo new'));
  const result=await edit.execute(args);
  const updated='#!/bin/sh\r\n# tiếng Việt 🦈\r\necho new\r\n# untouched\r\n';
  assert.equal(fs.readFileSync(file,'utf8'),updated);
  assert.equal(fs.statSync(file).mode&0o777,0o755,'executable mode is preserved');
  assert.equal(result.applied,true);assert.equal(result.previousHash,read.sha256);assert.equal(result.sha256,digest(updated));
  assert.equal(result.replacements,1);

  const stale=await edit.execute(args);
  assert.equal(stale.success,false);assert.equal(stale.code,'FILE_CHANGED');
  assert.equal(fs.readFileSync(file,'utf8'),updated,'a stale edit cannot overwrite a newer version');
  const missing=await edit.execute({...args,expectedHash:result.sha256,oldText:'missing'});
  assert.equal(missing.code,'EDIT_NOT_FOUND');assert.equal(missing.success,false);
  fs.writeFileSync(file,'old old\n');
  const ambiguous=await edit.execute({...args,expectedHash:digest('old old\n'),oldText:'old',newText:'new'});
  assert.equal(ambiguous.code,'EDIT_AMBIGUOUS');assert.equal(fs.readFileSync(file,'utf8'),'old old\n');
  const all=await edit.execute({...args,expectedHash:digest('old old\n'),oldText:'old',newText:'$& new',replaceAll:true});
  assert.equal(all.replacements,2);assert.equal(fs.readFileSync(file,'utf8'),'$& new $& new\n','replacement text is literal');
  assert(!fs.readdirSync(root).some(name=>name.startsWith('.sky-edit-')),'temporary writes are cleaned up');
 }

 const file=path.join(root,'parallel.txt');fs.writeFileSync(file,'original');
 const args={path:'parallel.txt',expectedHash:digest('original'),oldText:'original'};
 const other=registry.forWorkspace(root,scope);
 const outcomes=await Promise.all([scoped.get('fs_edit').execute({...args,newText:'first'}),other.get('fs_edit').execute({...args,newText:'second'})]);
 assert.equal(outcomes.filter(r=>r.success).length,1,'concurrent edits with one version have a single winner');
 assert.equal(outcomes.filter(r=>r.code==='FILE_CHANGED').length,1);

 fs.writeFileSync(file,'original');
 const wide=await scoped.get('fs_edit').execute({...args,newText:'changed\n'.repeat(300),dryRun:true});
 assert.equal(wide.diffTruncated,true);assert(wide.diff.length<16500);
 assert.equal(fs.readFileSync(file,'utf8'),'original');
 const utf8='\uFEFFconst label = "cũ";\n';fs.writeFileSync(file,utf8);
 const bom=await scoped.get('fs_edit').execute({path:'parallel.txt',expectedHash:digest(utf8),oldText:'cũ',newText:'mới 🦈'});
 assert.equal(bom.success,true);assert.equal(fs.readFileSync(file,'utf8'),'\uFEFFconst label = "mới 🦈";\n');
 const racingFs=Object.create(fs);
 racingFs.fsyncSync=fd=>{fs.fsyncSync(fd);fs.writeFileSync(file,'external writer wins\n');};
 const raced=editTextFile({root,path:'parallel.txt',expectedHash:bom.sha256,oldText:'mới',newText:'replacement'},{fs:racingFs,path,createHash,randomUUID});
 assert.equal(raced.code,'FILE_CHANGED','changes during staging are checked again before commit');
 assert.equal(fs.readFileSync(file,'utf8'),'external writer wins\n');
 assert(!fs.readdirSync(root).some(name=>name.startsWith('.sky-edit-')));

 const deniedFile=path.join(temp,'outside.txt');fs.writeFileSync(deniedFile,'private');
 fs.symlinkSync(deniedFile,path.join(root,'escape.txt'));
 await assert.rejects(()=>scoped.get('fs_edit').execute({path:'escape.txt',expectedHash:digest('private'),oldText:'private',newText:'changed'}),/outside|symlink/i);
 fs.linkSync(deniedFile,path.join(root,'hard.txt'));
 const hard=await scoped.get('fs_edit').execute({path:'hard.txt',expectedHash:digest('private'),oldText:'private',newText:'changed'});
 assert.equal(hard.success,false);assert.equal(fs.readFileSync(deniedFile,'utf8'),'private');
 fs.symlinkSync('parallel.txt',path.join(root,'internal-link.txt'));
 const internal=await scoped.get('fs_edit').execute({path:'internal-link.txt',expectedHash:bom.sha256,oldText:'mới',newText:'other'});
 assert.equal(internal.success,false,'even in-project symlink edits are rejected');
 fs.writeFileSync(path.join(root,'.env'),'SECRET');
 await assert.rejects(()=>scoped.get('fs_edit').execute({path:'.env',expectedHash:digest('SECRET'),oldText:'SECRET',newText:'x'}),/credentials/);
 fs.writeFileSync(path.join(root,'binary.dat'),Buffer.from([0xff,0x00,0x61]));
 const binary=await scoped.get('fs_edit').execute({path:'binary.dat',expectedHash:digest(Buffer.from([0xff,0x00,0x61])),oldText:'a',newText:'b'});
 assert.equal(binary.code,'UNSUPPORTED_TEXT');
 assert.deepEqual(fs.readFileSync(path.join(root,'binary.dat')),Buffer.from([0xff,0x00,0x61]));

 const permissions=new PermissionEngine(db);
 assert.equal(permissions.evaluate('fs_edit','parallel.txt',scope).action,'ALLOW');
 db.setPolicy('fs_write:*','DENY');
 assert.equal(permissions.evaluate('fs_edit','parallel.txt',{...scope,approvalMode:'full'}).action,'DENY','edit cannot bypass write denial');
 db.setPolicy('fs_write:*','ASK');
 assert.equal(permissions.evaluate('fs_edit','parallel.txt').action,'ASK');
 db.setScopedPolicy(scope.scopeId,'fs_write:parallel.txt','ASK');
 assert.equal(permissions.evaluate('fs_edit','parallel.txt',scope).action,'ASK','write approval policy also covers edits');
 assert.throws(()=>scoped.validateCall({name:'fs_edit',arguments:{path:'parallel.txt',expectedHash:'invalid',oldText:'a',newText:'b'}}),/schema|pattern/i);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>scoped.get('fs_edit').execute({...args,newText:'cancelled'},{signal:controller.signal}),/abort/i);
 const before=fs.readFileSync(file,'utf8');
 const unavailable=new ToolRegistry(db,root,{sandbox:{status:()=>({available:false}),execute:async()=>{throw Error('Sandbox unavailable');}}}).forWorkspace(root,scope);
 await assert.rejects(()=>unavailable.get('fs_edit').execute({...args,newText:'fallback'}),/unavailable/);
 assert.equal(fs.readFileSync(file,'utf8'),before);
 console.log('File edits: exact versions, diff preview, CRLF/Unicode, atomic replacement, modes, concurrency and project boundaries passed');
}finally{await registry.sandbox.dispose();db.close();fs.rmSync(temp,{recursive:true,force:true});}
