import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {check} from './check.mjs';
import {stage} from '../rules/stage.mjs';
import {sha256} from '../build-info/manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
if(args.some(arg=>!['--check','--dir'].includes(arg)))throw Error('Use --check or --dir; build on the target OS/architecture');
const {electronDist,target}=check(root);
if(args.includes('--check')){console.log(`Release prerequisites OK: ${process.platform}/${process.arch}`);process.exit(0);}
const npmCli=process.env.npm_execpath;
if(!npmCli)throw Error('Invoke this tool with npm run release:build or npm run release:dir');
function run(command,args,cwd=root){const result=spawnSync(command,args,{cwd,stdio:'inherit',shell:false,env:{...process.env,ELECTRON_BUILDER_COMPRESSION_LEVEL:process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL||'3'}});if(result.error)throw result.error;if(result.status!==0)throw Error(`${command} failed (${result.status})`);}
run(process.execPath,[npmCli,'run','build']);
const app=path.join(root,'output/release/app');
const info=stage(root,app);
// Separate dependencies: native rebuilds must never overwrite the developer install.
run(process.execPath,[npmCli,'ci','--omit=dev','--no-audit','--no-fund'],app);
const cli=path.join(root,'node_modules/electron-builder/cli.js');
run(process.execPath,[cli,'--config','release/rules/electron-builder.cjs',target.flag,
  `--${process.arch}`,...(args.includes('--dir')?['--dir']:[]),'--publish','never',
  `-c.electronDist=${electronDist}`]);
if(args.includes('--dir')){console.log('Unpacked application ready under output/release/artifacts');process.exit(0);}
const artifacts=path.join(root,'output/release/artifacts');
const files=fs.readdirSync(artifacts).filter(name=>name.startsWith(`sky-${info.version}-`)&&name.endsWith(`.${target.artifact}`));
const checksums=files.map(name=>`${sha256(fs.readFileSync(path.join(artifacts,name)))}  ${name}`).join('\n');
if(!args.includes('--dir')&&!files.length)throw Error('Packager produced no release artifact');
fs.writeFileSync(path.join(artifacts,'SHA256SUMS'),checksums+(checksums?'\n':''));
fs.writeFileSync(path.join(artifacts,'build-info.json'),JSON.stringify(info,null,2)+'\n');
console.log(`Release outputs: ${artifacts}`);
