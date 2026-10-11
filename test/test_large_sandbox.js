import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {ToolRegistry} from '../server/tools.js';import {rootIdentity} from '../server/project_scope.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohmyt-large-sandbox-'));
try{
 let nested=root;for(let depth=0;depth<8;depth++){nested=path.join(nested,'d'.repeat(200));fs.mkdirSync(nested);}
 for(let i=0;i<12000;i++)fs.writeFileSync(path.join(nested,`secrets.${i}`),'private');
 fs.writeFileSync(path.join(root,'README.md'),'project visible');
 const scope={canonicalRoot:root,rootIdentity:rootIdentity(root),scopeId:'project:large',projectId:'large'};
 const tools=new ToolRegistry({},root).forWorkspace(root,scope);
 const result=await tools.get('shell_exec').execute({command:'cat README.md; cat '+path.relative(root,path.join(nested,'secrets.0'))+' 2>/dev/null || true',timeout:30000},{});
 assert.equal(result.success,true,result.stderr);assert.equal(result.stdout,'project visible');
 console.log('PASS large sandbox: 12,000 sensitive files grouped into subtree masks launch successfully and secrets remain hidden');
}finally{fs.rmSync(root,{recursive:true,force:true});}
