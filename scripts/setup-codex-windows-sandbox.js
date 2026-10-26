import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildCodexWindowsArguments, CODEX_WINDOWS_SUPPORTED_VERSION} from '../server/sandbox/codex-windows.js';

// Explicit human-operated setup only; never called by status() or an agent tool.
if (process.platform !== 'win32') throw new Error('Windows setup only');
if (!process.argv.includes('--consent-machine-setup')) throw new Error('Pass --consent-machine-setup after reviewing account, ACL and network setup effects');
const local = process.env.LOCALAPPDATA;
if (!local) throw new Error('LOCALAPPDATA missing');
const executable = path.join(local,'Programs','OpenAI','Codex','bin','codex.exe');
const version = spawnSync(executable,['--version'],{encoding:'utf8',windowsHide:true});
if (version.error) throw version.error;
if (version.status !== 0 || version.stdout.trim() !== `codex-cli ${CODEX_WINDOWS_SUPPORTED_VERSION}`) throw new Error('Unsupported Codex sandbox version');
const allowHostRead = process.argv.includes('--consent-host-read');
const home = path.join(local,'ohmyt',allowHostRead ? 'codex-sandbox-host-read' : 'codex-sandbox');
const root = path.join(home,'verification-project');
fs.mkdirSync(root,{recursive:true});
const denyPaths = [path.join(process.env.USERPROFILE,'.ssh'),path.join(process.env.USERPROFILE,'.aws'),path.join(process.env.USERPROFILE,'.azure'),path.join(process.env.USERPROFILE,'.codex'),path.join(process.env.USERPROFILE,'.dsh')].filter(value=>fs.existsSync(value));
const {policy,args} = buildCodexWindowsArguments({workspaceRoot:root,allowHostRead,denyPaths,argv:[path.join(process.env.SystemRoot || 'C:\\Windows','System32','cmd.exe'),'/d','/c','exit 0']});
const config = path.join(home,'config.toml');
if (fs.existsSync(config) && fs.readFileSync(config,'utf8') !== policy) throw new Error('Existing sandbox config differs; review it manually before setup');
fs.writeFileSync(config,policy,{flag:fs.existsSync(config)?'w':'wx'});
console.log('Starting explicitly consented Codex elevated sandbox setup. Windows may display UAC.');
console.log('This can provision sandbox accounts, ACLs and network rules. Successful exit is launch evidence only, not production readiness.');
const result = spawnSync(executable,args,{cwd:home,env:{...process.env,CODEX_HOME:home},stdio:'inherit',windowsHide:false});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
