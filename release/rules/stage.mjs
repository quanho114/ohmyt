import fs from 'node:fs';
import path from 'node:path';
import {buildInfo} from '../build-info/manifest.mjs';
export const runtimePaths=['server','shared','electron','dist','chrome-extension',
  'integrations/browser-use','integrations/cordis','integrations/file-viewer','integrations/harness-licenses','integrations/monocode',
  'public/sky-icon.png','public/sky.png','public/sky.svg',
  'scripts/daemon-windows-codex.js','scripts/setup-codex-windows-sandbox.js','scripts/verify-codex-windows-sandbox.js',
  'README.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json'];
const blocked=new Set(['data','node_modules','.git','.venv','__pycache__','.external-state.json']);
export function copyRuntime(root,destination) {
  fs.mkdirSync(destination,{recursive:true});
  for(const entry of runtimePaths){
    const source=path.join(root,entry);
    if(!fs.existsSync(source))throw Error(`Missing release input: ${entry}`);
    fs.cpSync(source,path.join(destination,entry),{recursive:true,filter:file=>{
      const name=path.basename(file);
      if(blocked.has(name)||name.startsWith('.env')||name.endsWith('.log')||name.endsWith('.pyc'))return false;
      if(fs.lstatSync(file).isSymbolicLink())throw Error(`Release inputs cannot be symlinks: ${file}`);
      return true;
    }});
  }
}
export function stage(root,destination) {
  // Caller owns this fixed staging directory. Do not accept arbitrary cleanup paths.
  const expected=path.join(root,'output/release/app');
  if(path.resolve(destination)!==expected)throw Error('Unexpected release staging path');
  if(fs.existsSync(destination)&&fs.lstatSync(destination).isSymbolicLink())throw Error('Staging path is a symlink');
  fs.rmSync(destination,{recursive:true,force:true});copyRuntime(root,destination);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const info=buildInfo(root,pkg);
  const stagedPackage={...pkg,main:'electron/main.cjs',description:pkg.description||'Local-first AI document and chat workspace'};
  delete stagedPackage.directories;
  fs.writeFileSync(path.join(destination,'package.json'),JSON.stringify(stagedPackage,null,2)+'\n');
  fs.writeFileSync(path.join(destination,'release-build.json'),JSON.stringify(info,null,2)+'\n');
  return info;
}
