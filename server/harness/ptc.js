import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('./ptc_worker.js',import.meta.url));
export class PtcRuntime {
  constructor({call}){this.call=call;this.executable=process.execPath;if(process.versions.electron){this.executable=null;const directories=[...new Set((process.env.PATH || '').split(path.delimiter).filter(Boolean))].slice(0,20);for(const directory of directories){const candidate=path.join(directory,'node');if(!fs.existsSync(candidate))continue;const check=spawnSync(candidate,['-p','Boolean(process.versions.node && !process.versions.electron)'],{timeout:1000,encoding:'utf8',env:{PATH:'/usr/bin'}});if(check.status===0&&check.stdout.trim()==='true'){this.executable=fs.realpathSync(candidate);break;}}}}
  probe(){return this.probeTask ||= this.execute({code:'output(1);',probe:true,wallTimeMs:5000}).then(()=>({available:true})).catch(()=>({available:false,reason:'PTC requires a working Linux bubblewrap process sandbox.'}));}
  async execute({code,signal,wallTimeMs=30000,maxSubcalls=20,context,probe=false}){
    if(!this.executable)throw new Error('PTC requires an available native Node runtime');
    if(process.platform!=='linux'||process.arch!=='x64'||(!fs.existsSync('/usr/bin/bwrap')||!fs.existsSync('/usr/bin/prlimit')))throw new Error('PTC OS isolation unavailable');
    if(typeof code!=='string'||Buffer.byteLength(code)>100000||!Number.isSafeInteger(wallTimeMs)||wallTimeMs<1||wallTimeMs>30000||!Number.isSafeInteger(maxSubcalls)||maxSubcalls<1||maxSubcalls>20)throw new Error('Invalid PTC limits or program');
    signal?.throwIfAborted();
    const args=['--unshare-all','--die-with-parent','--tmpfs','/','--ro-bind','/usr','/usr','--dir','/etc','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--dev','/dev','--proc','/proc','--tmpfs','/tmp','--dir','/runtime','--ro-bind',this.executable,'/runtime/node','--ro-bind',worker,'/runtime/worker.mjs','--clearenv','--setenv','PATH','/usr/bin','--chdir','/tmp'];
    if(process.versions.electron&&this.executable===process.execPath){for(const entry of fs.readdirSync(path.dirname(process.execPath),{withFileTypes:true}))if(entry.isFile()&&(/^lib.*\.so(?:\.[0-9.]+)?$/.test(entry.name)||['icudtl.dat','snapshot_blob.bin','v8_context_snapshot.bin'].includes(entry.name)))args.push('--ro-bind',path.join(path.dirname(process.execPath),entry.name),'/runtime/'+entry.name);args.push('--setenv','ELECTRON_RUN_AS_NODE','1');}
    args.push('--seccomp','3','/runtime/node','--max-old-space-size=64','/runtime/worker.mjs');
    // Deny processes while permitting Node's own worker threads. clone3 returns
    // ENOSYS so libc uses clone with inspectable CLONE_THREAD flags.
    const filter=seccomp();
    return new Promise((resolve,reject)=>{
      const child=spawn('/usr/bin/prlimit',['--as=2147483648','--cpu=30','--nofile=128','--','/usr/bin/bwrap',...args],{stdio:['pipe','pipe','pipe','pipe'],detached:true,env:{PATH:'/usr/bin'}});
      child.stdio[3].end(filter);let buffer='',stderr='',bytes=0,subcalls=0,done=false,failure,closed=false;const outputs=[],jobs=new Set(),ids=new Set(),controller=new AbortController();
      const stop=reason=>{failure ||= new Error(reason);controller.abort(reason);try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
      const abort=()=>stop('PTC cancelled');signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>stop('PTC wall time limit exceeded'),wallTimeMs);
      const reply=value=>{if(!closed&&!child.stdin.destroyed)child.stdin.write(JSON.stringify(value)+'\n');};child.stdin.on('error',()=>{});
      child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024){stop('PTC output limit exceeded');return;}buffer+=chunk.toString();let newline;
        while((newline=buffer.indexOf('\n'))>=0){const raw=buffer.slice(0,newline);buffer=buffer.slice(newline+1);let message;try{message=JSON.parse(raw);}catch{stop('Invalid PTC protocol');return;}
          if(message.kind==='call'){
            if(++subcalls>maxSubcalls||ids.has(message.id)||jobs.size>0||typeof message.name!=='string'){stop('PTC subcall limit or concurrency violation');return;}
            ids.add(message.id);const job=Promise.resolve().then(()=>{if(probe)throw new Error('Probe cannot call tools');return this.call(message.name,message.args,{...context,signal:controller.signal});}).then(value=>reply({kind:'result',id:message.id,value}),error=>reply({kind:'result',id:message.id,error:error.message})).finally(()=>jobs.delete(job));jobs.add(job);
          }else if(message.kind==='output')outputs.push(message.value);else if(message.kind==='error')stop(message.error);else if(message.kind==='done'){done=true;child.stdin.end();}
        }
      });
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(0,10000);});child.on('error',error=>{failure=error;});
      child.on('close',async code=>{closed=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(!done||failure||code!==0)controller.abort('PTC worker stopped');await Promise.allSettled([...jobs]);if(failure||!done||code!==0)reject(failure || new Error(`PTC isolation failed: ${stderr || code}`));else resolve({output:outputs,subcalls});});
      reply({kind:'start',code});
    });
  }
}
function seccomp(){
  const instructions=[];const ins=(code,jt,jf,k)=>instructions.push({code,jt,jf,k});
  ins(0x20,0,0,4);ins(0x15,1,0,0xc000003e);ins(0x06,0,0,0x80000000);ins(0x20,0,0,0);
  for(const syscall of [57,58]){ins(0x15,0,1,syscall);ins(0x06,0,0,0x50001);}
  ins(0x15,0,1,435);ins(0x06,0,0,0x50026);
  ins(0x15,0,4,56);ins(0x20,0,0,16);ins(0x45,1,0,0x10000);ins(0x06,0,0,0x50001);ins(0x06,0,0,0x7fff0000);ins(0x06,0,0,0x7fff0000);
  const bytes=Buffer.alloc(instructions.length*8);instructions.forEach((i,n)=>{bytes.writeUInt16LE(i.code,n*8);bytes[n*8+2]=i.jt;bytes[n*8+3]=i.jf;bytes.writeUInt32LE(i.k,n*8+4);});return bytes;
}
