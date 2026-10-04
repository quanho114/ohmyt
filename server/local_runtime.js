import os from 'node:os';
import fs from 'node:fs';
import {spawn} from 'node:child_process';

export function describeRuntime(workspaceRoot, hostEnabled = false) {
  return {
    platform: process.platform, architecture: process.arch,
    workspaceRoot, homeDirectory: os.homedir(),
    execution: {
      workspace: process.platform === 'linux' ? 'bubblewrap: workspace files, isolated network, no host devices' : 'unavailable',
      host: hostEnabled ? 'native OS shell; subject to permission policies' : 'disabled',
      shell: process.platform === 'win32' ? 'PowerShell' : '/bin/sh'
    },
    isolation: fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv') ? 'container detected; host means this runtime, not an external machine' : 'not detected; not a guarantee of bare-metal execution'
  };
}

export function executeHostShell({command,cwd,timeout=30000}, {runId} = {}, processes = new Map()) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('Command must be non-empty');
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('Timeout must be between 1 and 300000ms');
  if (!fs.statSync(cwd).isDirectory()) throw new Error('Working directory is not a directory');
  const executable = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['-NoLogo','-NoProfile','-NonInteractive','-Command',command] : ['-c',command];
  return new Promise((resolve,reject) => {
    const child=spawn(executable,args,{cwd,windowsHide:true,detached:process.platform!=='win32',env:process.env});
    let stdout='',stderr='',timedOut=false;
    const append=(current,data)=> (current+data.toString()).slice(0,500000);
    child.stdout.on('data',data=>{stdout=append(stdout,data);});
    child.stderr.on('data',data=>{stderr=append(stderr,data);});
    if(runId) {if(!processes.has(runId)) processes.set(runId,new Set());processes.get(runId).add(child);}
    const stop=()=>{
      if(process.platform==='win32') spawn('taskkill',['/pid',String(child.pid),'/f','/t'],{windowsHide:true}).on('error',()=>{});
      else {try {process.kill(-child.pid,'SIGKILL');}catch {child.kill('SIGKILL');}}
    };
    const timer=setTimeout(()=>{timedOut=true;stop();},timeout);
    const cleanup=()=>{clearTimeout(timer);const group=processes.get(runId);group?.delete(child);if(group?.size===0) processes.delete(runId);};
    child.on('error',error=>{cleanup();reject(error);});
    child.on('close',(exitCode,signal)=>{cleanup();resolve({command,cwd,execution:'host',exitCode,signal,stdout,stderr,timedOut,success:exitCode===0&&!timedOut});});
  });
}
