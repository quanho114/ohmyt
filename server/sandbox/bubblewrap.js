import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {rootIdentity, isSecretPath} from '../project_scope.js';

// Linux implementation of the workspace sandbox contract. It does not grant
// permission: callers must pass through the canonical tool invocation pipeline.
export class BubblewrapSandbox {
  constructor({executable = '/usr/bin/bwrap'} = {}) {
    this.executable = executable;
    this.activeChildProcesses = new Map();
    this.children = new Set();
    this.closed = false;
  }

  status() {
    let available = process.platform === 'linux' && !this.closed;
    if (available) {
      try { fs.accessSync(this.executable, fs.constants.X_OK); } catch { available = false; }
    }
    return {provider:'bubblewrap',available,reason:available ? null : this.closed ? 'Sandbox disposed' : 'Linux bubblewrap executable unavailable'};
  }

  cancel(runId) {
    const children = this.activeChildProcesses.get(runId);
    if (!children?.size) return false;
    for (const child of children) this.stop(child);
    return true;
  }

  stop(child) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }

  async dispose() {
    this.closed = true;
    const children = [...this.children];
    const closed = children.map(child => new Promise(resolve => child.once('close', resolve)));
    for (const child of children) this.stop(child);
    await Promise.all(closed);
  }

  async execute({workspaceRoot: workspaceRootInput, command, argv, cwd = workspaceRootInput, timeout = 30000, scope = null}, context = {}) {
    if (!this.status().available) throw new Error('Workspace sandbox unavailable: ' + this.status().reason);
    if (argv !== undefined && (!Array.isArray(argv) || !argv.length || !argv[0] || argv.some(value => typeof value !== 'string' || value.includes('\0')) || command !== undefined)) throw new Error('Invalid sandbox argv request');
    if (argv !== undefined) command = JSON.stringify(argv);
    context.signal?.throwIfAborted();
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('Shell timeout must be between 1 and 300000ms');
    if (process.platform !== 'linux') throw new Error('shell_exec is unavailable: the Linux bubblewrap sandbox is required');
    const workspaceRoot = fs.realpathSync(workspaceRootInput);
    const requestedCwd = path.resolve(workspaceRoot, cwd);
    let realWorkingDir;
    try {
      realWorkingDir = fs.realpathSync(requestedCwd);
    } catch {
      throw new Error(`Thư mục làm việc không tồn tại: ${cwd}`);
    }
    const relativeCwd = path.relative(workspaceRoot, realWorkingDir);
    if (relativeCwd === '..' || relativeCwd.startsWith(`..${path.sep}`) || path.isAbsolute(relativeCwd)) {
      throw new Error(`Thư mục làm việc nằm ngoài workspace: ${cwd}`);
    }

    if (scope && (workspaceRoot !== scope.canonicalRoot || rootIdentity(workspaceRoot) !== scope.rootIdentity)) throw new Error('Project root changed');
    const args = [
      '--unshare-all', '--die-with-parent',
      '--tmpfs', '/',
      '--ro-bind', '/usr', '/usr',
      ...(scope ? ['--dir', '/etc'] : ['--ro-bind', '/etc', '/etc']),
      '--symlink', 'usr/bin', '/bin',
      '--symlink', 'usr/sbin', '/sbin',
      '--symlink', 'usr/lib', '/lib',
      '--symlink', 'usr/lib64', '/lib64',
      '--dev', '/dev', '--proc', '/proc',
      '--tmpfs', '/tmp', '--tmpfs', '/run',
      '--dir', '/home', '--dir', '/opt', '--dir', '/var',
      '--dir', '/runtime',
      '--ro-bind', process.execPath, '/runtime/node',
      '--dir', '/workspace',
      '--bind', '/proc/self/fd/3', '/workspace'
    ];
    if(process.versions.electron) {
      // Node mode still needs Electron's adjacent libraries and ICU/V8 data.
      // Mount only runtime artifacts: the directory may also contain the app and its data.
      const runtimeDir=path.dirname(process.execPath);
      for(const entry of fs.readdirSync(runtimeDir,{withFileTypes:true})) {
        if(entry.isFile() && (/^lib[^/]+\.so(?:\.[0-9.]+)?$/.test(entry.name) ||
          ['icudtl.dat','snapshot_blob.bin','v8_context_snapshot.bin'].includes(entry.name))) {
          args.push('--ro-bind',path.join(runtimeDir,entry.name),'/runtime/'+entry.name);
        }
      }
      args.push('--setenv','ELECTRON_RUN_AS_NODE','1');
    }
    if (!scope && fs.existsSync(path.join(workspaceRoot, 'data'))) args.push('--tmpfs', '/workspace/data');
    for (const secretFile of ['.env', '.env.local', '.env.development', '.env.production']) {
      if (fs.existsSync(path.join(workspaceRoot, secretFile))) {
        args.push('--ro-bind', '/dev/null', `/workspace/${secretFile}`);
      }
    }
    if (scope) {
      let visited=0;
      const collect = (directory, relative='') => {
        let masks=[];
        for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
          if (++visited>200000) throw new Error('Project quá lớn để kiểm tra sandbox.');
          const rel=path.join(relative,entry.name),full=path.join(directory,entry.name);
          if(isSecretPath(rel)||(entry.isFile()&&fs.statSync(full).nlink>1)) {
            if(!entry.isSymbolicLink())masks.push({relative:rel,directory:entry.isDirectory()});
          } else if(entry.isDirectory()) masks.push(...collect(full,rel));
        }
        // Conceal a crowded subtree as a unit instead of thousands of individual mounts.
        if(relative && masks.length>512)return [{relative,directory:true}];
        return masks;
      };
      let masks=collect(workspaceRoot);
      if(masks.length>2500){
        const groups=new Map();
        for(const mask of masks){const parts=mask.relative.split(path.sep);if(parts.length>1){const group=groups.get(parts[0])||[];group.push(mask);groups.set(parts[0],group);}}
        for(const [directory,group] of [...groups].sort((a,b)=>b[1].length-a[1].length)){
          if(masks.length<=2500)break;
          masks=masks.filter(mask=>!mask.relative.startsWith(directory+path.sep));masks.push({relative:directory,directory:true});
        }
      }
      if(masks.length>2500)throw new Error('Quá nhiều tệp nhạy cảm ngay tại gốc project. Chọn thư mục mã nguồn nhỏ hơn.');
      for(const mask of masks) {
        if(mask.directory)args.push('--tmpfs','/workspace/'+mask.relative);
        else args.push('--ro-bind','/dev/null','/workspace/'+mask.relative);
      }
    }

    args.push(
      '--chdir', relativeCwd ? path.posix.join('/workspace', relativeCwd.split(path.sep).join('/')) : '/workspace',
      '--setenv', 'PATH', '/runtime:/usr/bin:/bin:/workspace/node_modules/.bin',
      '--setenv', 'HOME', '/tmp',
      '--setenv', 'TMPDIR', '/tmp',
      '--setenv', 'XDG_CACHE_HOME', '/tmp/.cache',
      '--setenv', 'NPM_CONFIG_CACHE', '/tmp/npm-cache',
      '--setenv', 'NPM_CONFIG_USERCONFIG', '/dev/null',
      '--setenv', 'LC_ALL', 'C.UTF-8',
      '--', ...(argv ?? ['/bin/sh', '-c', command])
    );

    const runId = context.runId;
    const outputLimit = context.fileBroker ? 16_000_000 : 500_000;
    let stdout = '';
    let stderr = '';
    return new Promise((resolve, reject) => {
      let workspaceFd;
      let child;
      let timeoutTimer = null;
      let killTimer = null;
      let timedOut = false;
      try {
        workspaceFd = fs.openSync(workspaceRoot, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
        if (scope) {
          const stat=fs.fstatSync(workspaceFd);
          if (`${stat.dev}:${stat.ino}` !== scope.rootIdentity) throw new Error('Project root changed');
        }
        // Pass mount rules through a descriptor so large projects do not exceed execve's argument limit.
        const commandIndex=args.length - (argv?.length ?? 3) - 1;
        child = spawn(this.executable, ['--args', '4', ...args.slice(commandIndex)], {
          cwd: workspaceRoot,
          detached: true,
          windowsHide: true,
          env: {
            PATH: '/usr/bin:/bin',
            HOME: '/tmp',
            LANG: 'C.UTF-8',
            LC_ALL: 'C.UTF-8'
          },
          stdio: [context.fileBroker ? 'pipe' : 'ignore', 'pipe', 'pipe', workspaceFd, 'pipe']
        });
      } catch (err) {
        if (workspaceFd !== undefined) fs.closeSync(workspaceFd);
        reject(new Error(`Không thể khởi chạy Linux workspace sandbox: ${err.message}`));
        return;
      }
      fs.closeSync(workspaceFd);
      this.children.add(child);
      child.stdio[4].on('error',()=>{});
      child.stdio[4].end(args.slice(0,args.length - (argv?.length ?? 3) - 1).join('\0')+'\0');
      if (context.fileBroker) {child.stdin.on('error',()=>{});child.stdin.end(context.stdin);}

      if (runId) {
        if (!this.activeChildProcesses.has(runId)) this.activeChildProcesses.set(runId, new Set());
        this.activeChildProcesses.get(runId).add(child);
      }
      const releaseChild = () => {
        this.children.delete(child);
        context.signal?.removeEventListener('abort', abort);
        if (!runId) return;
        const processes = this.activeChildProcesses.get(runId);
        if (!processes) return;
        processes.delete(child);
        if (processes.size === 0) this.activeChildProcesses.delete(runId);
      };
      const appendBounded = (current, chunk, suffix) => {
        if (current.length >= outputLimit) return current;
        const text = chunk.toString();
        if (current.length + text.length <= outputLimit) return current + text;
        return current + text.slice(0, outputLimit - current.length) + suffix;
      };
      child.stderr.setEncoding('utf8');
      child.stdout.setEncoding('utf8');
      child.stderr.on('data', data => { stderr = appendBounded(stderr, data, '\n[Output truncated]'); });
      child.stdout.on('data', data => { stdout = appendBounded(stdout, data, '\n[... Output truncated at 500KB ...]'); });
      const signalSandbox = signal => {
        try { process.kill(-child.pid, signal); }
        catch { child.kill(signal); }
      };
      const abort = () => this.stop(child);
      context.signal?.addEventListener('abort', abort, {once:true});
      if (context.signal?.aborted) abort();
      if (timeout > 0) timeoutTimer = setTimeout(() => {
        timedOut = true;
        signalSandbox('SIGTERM');
        killTimer = setTimeout(() => signalSandbox('SIGKILL'), 250);
      }, timeout);
      child.once('error', err => {
        clearTimeout(timeoutTimer);
        clearTimeout(killTimer);
        releaseChild();
        reject(new Error(`Linux workspace sandbox failed: ${err.message}`));
      });
      child.once('close', (code, signal) => {
        clearTimeout(timeoutTimer);
        clearTimeout(killTimer);
        releaseChild();
        if (context.signal?.aborted) {
          reject(context.signal.reason || new Error('Sandbox execution cancelled'));
          return;
        }
        if (timedOut) {
          reject(new Error(`Lệnh shell bị hủy do quá thời gian (${timeout}ms): ${command}`));
          return;
        }
        resolve({ command, exitCode: code, signal, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
      });
    });
  }
}
