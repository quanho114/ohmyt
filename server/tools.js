import {registrationOwner,toolOwners} from './harness/ownership.js';
import {validateArguments} from './harness/schema.js';
import {rootIdentity, isSecretPath} from './project_scope.js';
import {describeRuntime,executeHostShell} from './local_runtime.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

export class ToolRegistry {
  constructor(db, workspaceRoot = process.cwd(), {hostEnabled = false} = {}) {
    this.db = db;
    this.workspaceRoot = workspaceRoot;
    this.hostEnabled = hostEnabled;
    this.activeChildProcesses = new Map(); // runId -> Set<ChildProcess>
    this.tools = new Map();
    this.registerBuiltins();
  }

  forStandalone(scope) {
    const scoped = new ToolRegistry(this.db, os.homedir(), {hostEnabled:this.hostEnabled});
    const hostTools = ['shell_host', 'runtime_info'].map(name => scoped.get(name)).filter(Boolean);
    scoped.tools.clear();
    if (this.hostEnabled) for (const tool of hostTools) if (this.tools.has(tool.name)) scoped.register(tool);
    for(const [name,tool] of this.tools) if((!tool.scopeIds||tool.scopeIds.includes('standalone'))&&(['memory_save','memory_search','web_search','html_preview','skill_load'].includes(name)||name.startsWith('browser_')||tool.scopes?.includes('standalone'))) scoped.register(tool);
    scoped.browserBridge=this.browserBridge;
    scoped.browserUse=this.browserUse;
    scoped.scope=scope;
    scoped.activeChildProcesses=this.activeChildProcesses;
    scoped.describeRuntime=()=>this.hostEnabled ? {...describeRuntime(os.homedir(), true), mode:'standalone', projectSelected:false, filesystemAccess:true, shellModes:['host']} : {mode:'standalone',projectSelected:false,filesystemAccess:false,shellModes:[]};
    return scoped;
  }

  forWorkspace(workspaceRoot, scope = null) {
    // Each run gets closures bound to its own root; process tracking stays shared for abort.
    const scoped = new ToolRegistry(this.db, workspaceRoot, { hostEnabled: this.hostEnabled });
    for (const name of scoped.tools.keys()) if (!this.tools.has(name)) scoped.tools.delete(name);
    for (const [name, tool] of this.tools) if ((!tool.scopeIds||tool.scopeIds.includes(scope?.scopeId))&&!scoped.tools.has(name) && (!scope?.projectId || tool.scopes?.includes('project') || name.startsWith('browser_') && !name.startsWith('browser_use_'))) scoped.register(tool);
    scoped.activeChildProcesses = this.activeChildProcesses;
    scoped.scope = scope;
    scoped.webSearch = this.webSearch;
    scoped.browserBridge = this.browserBridge;
    if (this.browserBridge) for (const [name, tool] of this.tools) if (!scoped.tools.has(name) && name.startsWith('browser_') && (!scope?.projectId || !name.startsWith('browser_use_'))) scoped.register(tool);
    if (!scope?.projectId) scoped.browserUse = this.browserUse;
    if (scope) {
      for (const name of ['fs_read', 'fs_list', 'fs_write']) {
        const tool = scoped.tools.get(name);
        if (tool) tool.execute = (args, context) => scoped.executeSandboxFile(name, args, context);
      }
    } else for (const [name, tool] of this.tools) if (!scoped.tools.has(name)) scoped.register(tool);
    return scoped;
  }

  register(tool, {owner = null} = {}) {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    const add = () => {
      const pluginId=registrationOwner.getStore();if(pluginId)toolOwners.set(tool,pluginId);
      this.tools.set(tool.name, tool);
      return () => { if (this.tools.get(tool.name) === tool) this.tools.delete(tool.name); };
    };
    return owner ? owner.effect(add, `tool:${tool.name}`) : add();
  }

  get(name) {
    return this.tools.get(name);
  }

  validateCall(call) {
    if (!call || typeof call !== 'object' || Array.isArray(call) || typeof call.name !== 'string') {
      throw new Error('Invalid tool call envelope');
    }
    const tool = this.get(call.name);
    if (!tool) throw new Error(`Unknown tool: ${call.name}`);
    const args = call.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error(`Arguments for ${call.name} must be an object`);
    }
    const schema = tool.parameters || {};
    if (schema.type !== 'object') throw new Error(`Unsupported input schema for ${call.name}`);
    for (const key of schema.required || []) {
      if (!Object.hasOwn(args, key)) throw new Error(`Missing required argument "${key}" for ${call.name}`);
    }
    for (const [key, value] of Object.entries(args)) {
      const property = schema.properties?.[key];
      if (!property) {
        if (schema.additionalProperties === false) throw new Error(`Unknown argument "${key}" for ${call.name}`);
        continue;
      }
      const valid = property.type === 'string' ? typeof value === 'string'
        : property.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
          : property.type === 'integer' ? Number.isSafeInteger(value)
            : property.type === 'boolean' ? typeof value === 'boolean'
              : property.type === 'array' ? Array.isArray(value)
                : property.type === 'object' ? Boolean(value) && typeof value === 'object' && !Array.isArray(value)
                  : true;
      if (!valid) throw new Error(`Argument "${key}" for ${call.name} must be ${property.type}`);
      if (property.enum && !property.enum.includes(value)) throw new Error(`Argument "${key}" for ${call.name} has an unsupported value`);
    }
    validateArguments(schema,args);
    return { tool, arguments: args };
  }

  getAllDefinitions() {
    return Array.from(this.tools.values()).filter(t => t.name !== 'shell_exec' || process.platform === 'linux').map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  resolveWorkspacePath(inputPath, { allowMissing = false } = {}) {
    if (typeof inputPath !== 'string' || !inputPath.trim()) throw new Error('Workspace path must be a non-empty string');
    const root = fs.realpathSync(this.workspaceRoot);
    if (this.scope && (root !== this.scope.canonicalRoot || rootIdentity(root) !== this.scope.rootIdentity)) throw new Error('Project root changed');
    const candidate = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(root, inputPath);
    const relative = path.relative(root, candidate);
    if (this.scope && isSecretPath(relative)) throw new Error('File credentials bị chặn trong project.');
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Path is outside workspace: ${inputPath}`);
    }

    const realExisting = target => {
      try { return fs.realpathSync(target); }
      catch (error) {
        if (!allowMissing || error.code !== 'ENOENT') throw error;
        const parent = path.dirname(target);
        if (parent === target) throw error;
        return path.join(realExisting(parent), path.basename(target));
      }
    };
    const resolved = realExisting(candidate);
    const resolvedRelative = path.relative(root, resolved);
    if (this.scope && isSecretPath(resolvedRelative)) throw new Error('File credentials bị chặn trong project.');
    if (resolvedRelative === '..' || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) {
      throw new Error(`Path is outside workspace: ${inputPath}`);
    }
    return candidate;
  }

  async executeSandboxFile(name, args = {}, context = {}) {
    const inputPath = args.path || '.';
    const resolved = this.resolveWorkspacePath(inputPath, {allowMissing: name === 'fs_write'});
    const relative = path.relative(this.workspaceRoot, resolved);
    const script = `const fs=require('fs'),path=require('path');
      const input=JSON.parse(fs.readFileSync(0,'utf8'));
      const target=path.resolve('/workspace',input.path);
      let ancestor=target;while(!fs.existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Missing root');ancestor=parent;}const real=fs.realpathSync(ancestor);
      if(real!='/workspace'&&!real.startsWith('/workspace/'))throw Error('Outside project');
      if(input.name==='fs_list') {const entries=fs.readdirSync(target,{withFileTypes:true}).map(e=>({name:e.name,isDirectory:e.isDirectory(),isFile:e.isFile()}));console.log(JSON.stringify({entries,total:entries.length}));}
      else if(input.name==='fs_read') {const fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink>1||stat.size>2097152)throw Error('Unsupported file');const content=fs.readFileSync(fd,'utf8');console.log(JSON.stringify({content,size:stat.size,lines:content.split('\\n').length}));}finally{fs.closeSync(fd);}}
      else {fs.mkdirSync(path.dirname(target),{recursive:true});const parent=fs.realpathSync(path.dirname(target));if(parent!='/workspace'&&!parent.startsWith('/workspace/'))throw Error('Outside project');const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);try{if(fs.fstatSync(fd).nlink>1)throw Error('Hardlink rejected');fs.ftruncateSync(fd);fs.writeFileSync(fd,input.content);console.log(JSON.stringify({success:true,bytesWritten:Buffer.byteLength(input.content)}));}finally{fs.closeSync(fd);}}`;
    // Create nested parents inside the mounted namespace, never on the host.
    if (name === 'fs_write' && (typeof args.content !== 'string' || Buffer.byteLength(args.content) > 2097152)) throw new Error('File write content must be text up to 2MB');
    const payload = JSON.stringify({name,path:relative,content:args.content});
    const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
    const result = await this.get('shell_exec').execute({command:`node -e ${quote(script)}`},{...context,fileBroker:true,stdin:payload});
    if (!result.success) throw new Error(result.stderr || 'Project filesystem sandbox failed');
    const output = JSON.parse(result.stdout);
    if (output.entries) {output.entries=output.entries.filter(entry=>!isSecretPath(path.join(relative,entry.name)));output.total=output.entries.length;}
    return {...output,path:inputPath,fullPath:resolved};
  }

  describeRuntime() { return describeRuntime(this.workspaceRoot, this.hostEnabled); }

  registerBuiltins() {
    this.register({
      name: 'html_preview',
      description: 'Xuất một trang HTML tự chứa (CSS và JavaScript inline) thành thẻ file có preview canvas, tải xuống và mở Chrome ở cuối câu trả lời. Không chạy mã hoặc ghi tệp trên máy.',
      parameters: {
        type: 'object',
        properties: {name: {type:'string', description:'Tên file, ví dụ game.html'}, content: {type:'string', description:'Toàn bộ HTML tự chứa'}},
        required: ['name', 'content']
      },
      execute: async ({name, content}) => {
        if (typeof name !== 'string' || !/^[^/\\]+\.html?$/i.test(name) || name.length > 120) throw new Error('Tên preview cần là tên file HTML.');
        if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > 2097152) throw new Error('Preview HTML phải nhỏ hơn 2 MB.');
        return {name, success:true, preview:true};
      }
    });
    this.register({name:'runtime_info',description:'Describe the actual local execution environment, OS, workspace and available shell modes. Check this before machine-specific commands. Host means the machine running the local service, never a remote client.',parameters:{type:'object',properties:{reason:{type:'string',description:'Optional explanation for inspecting the runtime; metadata only, does not change the operation.'}},additionalProperties:false},execute:async()=>this.describeRuntime()});
    if (this.hostEnabled) this.register({
      name:'shell_host',description:'Execute a native OS shell command on the machine running ohmyt. Uses PowerShell on Windows and /bin/sh on Unix. Has host filesystem/network access, governed by shell_host permission rules. Use shell_exec for isolated workspace commands.',
      parameters:{type:'object',properties:{command:{type:'string'},cwd:{type:'string'},timeout:{type:'number'}},required:['command'],additionalProperties:false},
      execute:async ({command,cwd=this.workspaceRoot,timeout},context)=>executeHostShell({command,cwd,timeout},context,this.activeChildProcesses)
    });
    // 1. fs_read
    this.register({
      name: 'fs_read',
      description: 'Đọc nội dung văn bản của một tập tin từ hệ thống tập tin cục bộ.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn tương đối hoặc tuyệt đối tới file cần đọc' }
        },
        required: ['path']
      },
      execute: async ({ path: filePath }) => {
        const resolved = this.resolveWorkspacePath(filePath);
        if (!fs.existsSync(resolved)) {
          throw new Error(`File không tồn tại: ${filePath}`);
        }
        const stat = fs.statSync(resolved);
        if (stat.isFile() && stat.nlink > 1) throw new Error(`Hard-linked files are unsupported in workspace tools: ${filePath}`);
        if (stat.isDirectory()) {
          throw new Error(`Đường dẫn là thư mục, không phải file: ${filePath}. Dùng fs_list thay thế.`);
        }
        if (stat.size > 2 * 1024 * 1024) {
          throw new Error(`File quá lớn (> 2MB): ${stat.size} bytes. Không thể đọc toàn bộ.`);
        }
        const content = fs.readFileSync(resolved, 'utf-8');
        const lines = content.split('\n').length;
        return { path: filePath, fullPath: resolved, size: stat.size, lines, content };
      }
    });

    // 2. fs_write
    this.register({
      name: 'fs_write',
      description: 'Ghi hoặc tạo mới một tập tin trên hệ thống tập tin cục bộ.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn file cần tạo hoặc ghi' },
          content: { type: 'string', description: 'Nội dung văn bản cần ghi vào file' }
        },
        required: ['path', 'content']
      },
      execute: async ({ path: filePath, content }) => {
        const resolved = this.resolveWorkspacePath(filePath, { allowMissing: true });
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        this.resolveWorkspacePath(filePath, { allowMissing: true });
        if (fs.existsSync(resolved) && fs.statSync(resolved).nlink > 1) {
          throw new Error(`Hard-linked files are unsupported in workspace tools: ${filePath}`);
        }
        fs.writeFileSync(resolved, content, 'utf-8');
        return { path: filePath, fullPath: resolved, bytesWritten: Buffer.byteLength(content, 'utf-8'), success: true };

      }
    });
    // 3. fs_list
    this.register({
      name: 'fs_list',
      description: 'Liệt kê danh sách thư mục và tập tin trong một đường dẫn.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Đường dẫn thư mục cần xem (để trống nếu xem thư mục gốc dự án)' }
        }
      },
      execute: async ({ path: dirPath = '.' }) => {
        const resolved = this.resolveWorkspacePath(dirPath);
        if (!fs.existsSync(resolved)) {
          throw new Error(`Thư mục không tồn tại: ${dirPath}`);
        }
        const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          isFile: e.isFile()
        }));
        return { path: dirPath, fullPath: resolved, total: entries.length, entries };
      }
    });

    // 4. shell_exec
    this.register({
      name: 'shell_exec',
      description: 'Thực thi một lệnh shell hoặc command line trong hệ điều hành.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Câu lệnh shell cần chạy' },
          cwd: { type: 'string', description: 'Thư mục làm việc (mặc định là thư mục dự án)' },
          timeout: { type: 'number', description: 'Thời gian tối đa (ms), mặc định 30000ms (30 giây)' }
        },
        required: ['command']
      },
      execute: async ({ command, cwd = this.workspaceRoot, timeout = 30000 }, context = {}) => {
        if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('Shell timeout must be between 1 and 300000ms');
        if (process.platform !== 'linux') throw new Error('shell_exec is unavailable: the Linux bubblewrap sandbox is required');
        const workspaceRoot = fs.realpathSync(this.workspaceRoot);
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

        if (this.scope && (workspaceRoot !== this.scope.canonicalRoot || rootIdentity(workspaceRoot) !== this.scope.rootIdentity)) throw new Error('Project root changed');
        const args = [
          '--unshare-all', '--die-with-parent',
          '--tmpfs', '/',
          '--ro-bind', '/usr', '/usr',
          ...(this.scope ? ['--dir', '/etc'] : ['--ro-bind', '/etc', '/etc']),
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
        if (!this.scope && fs.existsSync(path.join(workspaceRoot, 'data'))) args.push('--tmpfs', '/workspace/data');
        for (const secretFile of ['.env', '.env.local', '.env.development', '.env.production']) {
          if (fs.existsSync(path.join(workspaceRoot, secretFile))) {
            args.push('--ro-bind', '/dev/null', `/workspace/${secretFile}`);
          }
        }
        if (this.scope) {
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
          '--', '/bin/sh', '-c', command
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
            if (this.scope) {
              const stat=fs.fstatSync(workspaceFd);
              if (`${stat.dev}:${stat.ino}` !== this.scope.rootIdentity) throw new Error('Project root changed');
            }
            // Pass mount rules through a descriptor so large projects do not exceed execve's argument limit.
            const commandIndex=args.lastIndexOf('--');
            child = spawn('/usr/bin/bwrap', ['--args', '4', ...args.slice(commandIndex)], {
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
          child.stdio[4].on('error',()=>{});
          child.stdio[4].end(args.slice(0,args.lastIndexOf('--')).join('\0')+'\0');
          if (context.fileBroker) {child.stdin.on('error',()=>{});child.stdin.end(context.stdin);}

          if (runId) {
            if (!this.activeChildProcesses.has(runId)) this.activeChildProcesses.set(runId, new Set());
            this.activeChildProcesses.get(runId).add(child);
          }
          const releaseChild = () => {
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
          child.stderr.on('data', data => { stderr = appendBounded(stderr, data, '\n[Output truncated]'); });
          child.stdout.on('data', data => { stdout = appendBounded(stdout, data, '\n[... Output truncated at 500KB ...]'); });
          const signalSandbox = signal => {
            try { process.kill(-child.pid, signal); }
            catch { child.kill(signal); }
          };
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
            if (timedOut) {
              reject(new Error(`Lệnh shell bị hủy do quá thời gian (${timeout}ms): ${command}`));
              return;
            }
            resolve({ command, exitCode: code, signal, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
          });
        });
      }
    });

    // 5. web_search
    this.register({
      name: 'web_search',
      description: 'Tìm kiếm thông tin tức thời trên mạng Internet bằng từ khóa.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa hoặc câu hỏi cần tìm kiếm' }
        },
        required: ['query']
      },
      execute: async ({ query }, context = {}) => {
        if (!this.webSearch) throw new Error('Dịch vụ tìm kiếm chưa được khởi tạo. Khởi động lại ohmyt.');
        return this.webSearch.search(query, { signal: context.signal });
      }
    });

    // 6. memory_save
    this.register({
      name: 'memory_save',
      description: 'Lưu một thông tin hoặc đặc điểm quan trọng của người dùng vào bộ nhớ dài hạn SQLite FTS5. Chat thường dùng chung bộ nhớ cá nhân giữa các chat của cùng agent; project có bộ nhớ riêng. Chỉ xác nhận đã lưu sau khi công cụ thành công.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Phân loại: profile, semantic, project, episodic' },
          content: { type: 'string', description: 'Nội dung cần ghi nhớ chính xác' }
        },
        required: ['content']
      },
      execute: async ({ category = 'semantic', content }, context = {}) => {
        const agentId = context.agentId || 'default-assistant';
        const id = 'mem_' + Math.random().toString(36).substring(2, 10);
        const mem = this.db.saveMemory(id, agentId, category, content, context.scopeId || 'legacy:unassigned');
        return { success: true, savedMemory: mem };
      }
    });

    // 7. memory_search
    this.register({
      name: 'memory_search',
      description: 'Tìm kiếm bộ nhớ dài hạn của agent theo từ khóa bằng SQLite FTS5. Chat thường tìm trong tất cả chat thường của cùng agent; project chỉ tìm trong project hiện tại.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa cần tìm trong bộ nhớ' }
        },
        required: ['query']
      },
      execute: async ({ query }, context = {}) => {
        const agentId = context.agentId || 'default-assistant';
        const memories = this.db.searchMemories(query, 5, agentId, context.scopeId || 'legacy:unassigned');
        return { query, count: memories.length, memories };
      }
    });
  }

  killProcessesForRun(runId) {
    const processes = this.activeChildProcesses.get(runId);
    if (!processes) return false;
    for (const child of processes) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
        } else if (child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {}
    }
    return true;
  }
}
