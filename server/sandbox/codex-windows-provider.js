import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isSecretPath, rootIdentity} from '../project_scope.js';
import {CODEX_WINDOWS_SUPPORTED_VERSION} from './codex-windows.js';

let queue = Promise.resolve();
const quote = JSON.stringify;
export function buildWindowsLaunch({workspaceRoot,cwd,argv,command,nodeExecutable=process.execPath,home,env=process.env}) {
  const entries = new Map([[':root','read'],[workspaceRoot,'write']]);
  let visited = 0;
  const walk = (directory,relative='') => {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      if (++visited > 200000) throw Error('Project too large to inspect Windows sandbox secrets');
      const rel=path.join(relative,entry.name),full=path.join(directory,entry.name);
      if (isSecretPath(rel) || entry.isSymbolicLink() || entry.isFile() && fs.statSync(full).nlink>1) entries.set(full,'none');
      else if(entry.isDirectory()) walk(full,rel);
    }
  };
  walk(workspaceRoot);
  for(const name of ['.ssh','.aws','.azure','.gnupg','.codex','.dsh','.npmrc','.pypirc']) {
    const full=path.join(env.USERPROFILE || '',name);
    if(env.USERPROFILE && fs.existsSync(full)) entries.set(full,'none');
  }
  if(home) entries.set(path.join(home,'.sandbox-secrets'),'none');
  const filesystem=[...entries].map(([key,value])=>`${quote(key)}=${quote(value)}`).join(',');
  const permissions=`{\"ohmyt-project\"={filesystem={${filesystem}},network={enabled=false}}}`;
  const system=env.SystemRoot || 'C:\\Windows';
  const set={SystemRoot:system,WINDIR:system,SystemDrive:path.win32.parse(system).root.replace(/\\$/,''),OHMYT_SANDBOX_WORKSPACE:workspaceRoot};
  if(process.versions.electron) set.ELECTRON_RUN_AS_NODE='1';
  let program;
  if(argv) {program=[...argv];if(/^node(?:\.exe)?$/i.test(program[0]))program[0]=nodeExecutable;}
  else program=[path.join(system,'System32','WindowsPowerShell','v1.0','powershell.exe'),'-NoLogo','-NoProfile','-NonInteractive','-Command',command];
  return ['sandbox','-P','ohmyt-project','-C',cwd || workspaceRoot,
    '-c',`permissions=${permissions}`,'-c','default_permissions="ohmyt-project"','-c','windows.sandbox="elevated"',
    '-c',`shell_environment_policy={inherit="none",set={${Object.entries(set).map(([key,value])=>`${quote(key)}=${quote(value)}`).join(',')}}}`,
    '--',...program];
}

// Optional trusted boot provider. Setup/repair can occur during execution, never status().
// User consent to Codex's broad-read model is required before setting the opt-in flag.
export class CodexWindowsSandbox {
  constructor({env=process.env,platform=process.platform,spawnProcess=spawn,spawnSyncProcess=spawnSync}={}) {
    this.env=env;this.platform=platform;this.spawnProcess=spawnProcess;this.spawnSyncProcess=spawnSyncProcess;
    this.home=path.join(env.LOCALAPPDATA || '', 'ohmyt','codex-sandbox-host-read');
    this.executable=path.join(env.LOCALAPPDATA || '', 'Programs','OpenAI','Codex','bin','codex.exe');
    this.active=new Map();this.children=new Set();this.pending=new Set();this.closed=false;
  }
  status() {
    let reason=null;
    if(this.closed) reason='Sandbox disposed';
    else if(this.platform!=='win32' || this.env.OHMYT_WINDOWS_SANDBOX!=='codex') reason='Set OHMYT_WINDOWS_SANDBOX=codex after consenting to Codex setup and broad host reads';
    else if(!this.env.LOCALAPPDATA || !fs.existsSync(this.executable)) reason='Pinned Codex CLI is not installed';
    else if(!fs.existsSync(path.join(this.home,'.sandbox','setup_marker.json'))) reason='Run the explicitly consented Codex Windows setup first';
    else {
      if(!this.versionCheck) {
        const result=this.spawnSyncProcess(this.executable,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000});
        this.versionCheck=!result.error && result.status===0 && result.stdout?.trim()===`codex-cli ${CODEX_WINDOWS_SUPPORTED_VERSION}`;
      }
      if(!this.versionCheck)reason=`Codex CLI ${CODEX_WINDOWS_SUPPORTED_VERSION} is required`;
    }
    return {provider:'sky-windows',platform:'win32',available:!reason,reason,shell:'PowerShell',execution:'sky Windows Sandbox: broad host reads, scoped writes, network disabled',isolation:'broad-host-read',lifecycle:'Codex runner owns Job Object; wrapper-tree termination requested on cancellation; descendant cleanup requires platform verification'};
  }
  execute(request,context={}) {
    const task=queue.catch(()=>{}).then(()=>this.run(request,context));
    queue=task.catch(()=>{});this.pending.add(task);task.finally(()=>this.pending.delete(task)).catch(()=>{});return task;
  }
  stop(child) {
    if(child.pid) this.spawnSyncProcess(path.join(this.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000});
    child.kill();
  }
  cancel(runId) {let found=false;for(const child of this.active.get(runId)||[]){found=true;this.stop(child);}return found;}
  async dispose() {this.closed=true;for(const child of this.children)this.stop(child);await Promise.allSettled([...this.pending]);}
  async run(request,context) {
    context.signal?.throwIfAborted();const status=this.status();if(!status.available)throw Error(`Workspace sandbox unavailable: ${status.reason}`);
    const {workspaceRoot,scope,timeout=30000}=request;
    if(scope && (fs.realpathSync(workspaceRoot)!==scope.canonicalRoot || rootIdentity(workspaceRoot)!==scope.rootIdentity))throw Error('Project root changed');
    const args=buildWindowsLaunch({...request,home:this.home,env:this.env});
    if(scope && rootIdentity(workspaceRoot)!==scope.rootIdentity)throw Error('Project root changed');
    // Codex's named profile loader reads CODEX_HOME/<name>.config.toml. Keep
    // unbounded policy data off CreateProcessW's 32,767-character command line.
    const profile='sky-run-'+randomUUID();
    const profilePath=path.join(this.home,profile+'.config.toml');
    const settings=[];
    const launch=[];
    for(let index=0;index<args.length;index++) {
      if(args[index]==='--') {launch.push(...args.slice(index));break;}
      if(args[index]==='-c') {settings.push(args[++index]);continue;}
      launch.push(args[index]);
    }
    fs.writeFileSync(profilePath,settings.join('\n').replaceAll('ohmyt-project',profile)+'\n',{flag:'wx',mode:0o600});
    launch[launch.indexOf('-P')+1]=profile;
    launch.splice(1,0,'-p',profile);
    // Resolve Codex configuration only from trusted host storage, never the
    // selected project's .codex/config.toml (which can widen named profiles).
    const cwdIndex=launch.indexOf('-C');
    launch[cwdIndex+1]=this.home;
    const delimiter=launch.indexOf('--');
    const workload=launch.slice(delimiter+1);
    const workingDirectory=request.cwd || workspaceRoot;
    const wrapper='process.chdir(process.argv[1]);const r=require("child_process").spawnSync(process.argv[2],process.argv.slice(3),{stdio:"inherit",env:process.env,windowsHide:true});if(r.error){console.error(r.error.message);process.exit(1)}process.exit(r.status===null?1:r.status)';
    launch.splice(delimiter+1,launch.length,process.execPath,'-e',wrapper,workingDirectory,...workload);
    try { return await new Promise((resolve,reject)=>{
      let stdout='',stderr='',timedOut=false,settled=false;
      const child=this.spawnProcess(this.executable,launch,{cwd:this.home,env:{SystemRoot:this.env.SystemRoot || 'C:\\Windows',WINDIR:this.env.SystemRoot || 'C:\\Windows',USERPROFILE:this.env.USERPROFILE,LOCALAPPDATA:this.env.LOCALAPPDATA,CODEX_HOME:this.home},windowsHide:true,stdio:['pipe','pipe','pipe']});
      this.children.add(child);if(context.runId){if(!this.active.has(context.runId))this.active.set(context.runId,new Set());this.active.get(context.runId).add(child);}
      const abort=()=>this.stop(child),timer=setTimeout(()=>{timedOut=true;this.stop(child);},timeout);
      context.signal?.addEventListener('abort',abort,{once:true});if(context.signal?.aborted)abort();
      const limit=context.fileBroker?16000000:500000;
      const append=(current,data)=>current.length>=limit?current:(current+data).slice(0,limit);
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',data=>{stdout=append(stdout,data);});child.stderr.on('data',data=>{stderr=append(stderr,data);});
      child.stdin.on('error',()=>{});child.stdin.end(context.stdin || '');
      const finish=(error,code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);context.signal?.removeEventListener('abort',abort);this.children.delete(child);this.active.get(context.runId)?.delete(child);if(!this.active.get(context.runId)?.size)this.active.delete(context.runId);
        if(error)return reject(error);if(context.signal?.aborted)return reject(context.signal.reason || Error('Sandbox execution cancelled'));if(timedOut)return reject(Error(`Sandbox execution timed out (${timeout}ms)`));
        resolve({command:request.command || JSON.stringify(request.argv),exitCode:code,signal,stdout:stdout.trim(),stderr:stderr.trim(),success:code===0});};
      child.once('error',error=>finish(error));child.once('close',(code,signal)=>finish(null,code,signal));
    }); } finally {
      // Exact generated host-owned path; never a project/model-supplied target.
      fs.unlinkSync(profilePath);
    }
  }
}
