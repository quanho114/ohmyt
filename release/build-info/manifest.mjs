import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const sha256 = value=>createHash('sha256').update(value).digest('hex');
export function buildInfo(root, pkg) {
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const lock=JSON.parse(readFileSync(`${root}/package-lock.json`,'utf8'));
  return {schemaVersion:1,product:'sky',version:pkg.version,commit:git('rev-parse','HEAD'),
    dirty:Boolean(git('status','--porcelain')),platform:process.platform,arch:process.arch,
    node:process.version,compressionLevel:process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL||'3',electron:lock.packages['node_modules/electron'].version,
    lockSha256:sha256(readFileSync(`${root}/package-lock.json`)),builtAt:new Date().toISOString()};
}
