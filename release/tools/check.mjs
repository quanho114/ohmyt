import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {targets} from '../platforms/targets.mjs';
export function check(root) {
  if(process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL!==undefined&&!/^[0-9]$/.test(process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL))throw Error('Compression level must be 0–9');
  if(Number(process.versions.node.split('.')[0])<24)throw Error('Release tooling requires Node 24 or newer');
  if(!targets[process.platform]||!['x64','arm64'].includes(process.arch))throw Error('Unsupported native release host');
  const require=createRequire(path.join(root,'package.json'));
  require('node:sqlite');
  const electron=require('electron');
  if(!fs.existsSync(electron))throw Error('Electron binary is missing; run npm ci with Electron install scripts enabled');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
  if(pkg.version!==lock.version||pkg.version!==lock.packages[''].version)throw Error('package-lock version does not match package.json');
  return {electron,electronDist:path.join(path.dirname(require.resolve('electron/package.json')),'dist'),pkg,target:targets[process.platform]};
}
