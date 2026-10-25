import {registerDocumentProposals} from './document_proposals.js';
import {registrationOwner,toolOwners} from './harness/ownership.js';
import {validateArguments} from './harness/schema.js';
import {rootIdentity, isSecretPath, HOST_EXECUTION_TOOLS} from './project_scope.js';
import {createWorkspaceSandbox} from './sandbox/index.js';
import {describeRuntime,executeHostShell,ShellJobManager} from './local_runtime.js';
import {buildDocx,buildXlsx,readOffice,appendDocxParagraphs,editXlsxCell} from './office.js';
import {editTextFile} from './file_edits.js';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

export class ToolRegistry {
  constructor(db, workspaceRoot = process.cwd(), {hostEnabled = false, sandbox = createWorkspaceSandbox()} = {}) {
    this.db = db;
    this.workspaceRoot = workspaceRoot;
    this.hostEnabled = hostEnabled;
    this.sandbox = sandbox;
    this.activeChildProcesses = new Map(); // runId -> Set<ChildProcess>
    this.shellJobs = new ShellJobManager({activeChildProcesses: this.activeChildProcesses});
    this.tools = new Map();
    this.fileEditLocks = new Map();
    this.registerBuiltins();
  }

  forStandalone(scope) {
    const scoped = new ToolRegistry(this.db, os.homedir(), {hostEnabled:this.hostEnabled, sandbox:this.sandbox});
    const hostTools = ['shell_host', 'shell_job_start', 'shell_job_poll', 'shell_job_kill', 'shell_job_list', 'runtime_info'].map(name => scoped.get(name)).filter(Boolean);
    scoped.tools.clear();
    if (this.hostEnabled) for (const tool of hostTools) if (this.tools.has(tool.name)) scoped.register(tool);
    for(const [name,tool] of this.tools) if((!tool.scopeIds||tool.scopeIds.includes('standalone'))&&(['memory_save','memory_search','web_search','html_preview','skill_load'].includes(name)||name.startsWith('browser_')||tool.scopes?.includes('standalone'))) scoped.register(tool);
    scoped.browserBridge=this.browserBridge;
    scoped.browserUse=this.browserUse;
    scoped.scope=scope;
    scoped.activeChildProcesses=this.activeChildProcesses;
    scoped.shellJobs=this.shellJobs;
    scoped.fileEditLocks=this.fileEditLocks;
    scoped.describeRuntime=()=>this.hostEnabled ? {...describeRuntime(os.homedir(), true), mode:'standalone', projectSelected:false, filesystemAccess:true, shellModes:['host']} : {mode:'standalone',projectSelected:false,filesystemAccess:false,shellModes:[]};
    return scoped;
  }

  forWorkspace(workspaceRoot, scope = null) {
    // Each run gets closures bound to its own root; process tracking stays shared for abort.
    const scoped = new ToolRegistry(this.db, workspaceRoot, { hostEnabled: this.hostEnabled && !scope?.projectId, sandbox:this.sandbox });
    for (const name of scoped.tools.keys()) if (!this.tools.has(name)) scoped.tools.delete(name);
    for (const [name, tool] of this.tools) if ((!tool.scopeIds||tool.scopeIds.includes(scope?.scopeId))&&!scoped.tools.has(name) && (!scope?.projectId || tool.scopes?.includes('project') || name.startsWith('browser_') && !name.startsWith('browser_use_'))) scoped.register(tool);
    scoped.activeChildProcesses = this.activeChildProcesses;
    scoped.shellJobs = this.shellJobs;
    scoped.fileEditLocks = this.fileEditLocks;
    scoped.scope = scope;
    scoped.webSearch = this.webSearch;
    scoped.webReader = this.webReader;
    scoped.browserBridge = this.browserBridge;
    if (this.browserBridge) for (const [name, tool] of this.tools) if (!scoped.tools.has(name) && name.startsWith('browser_') && (!scope?.projectId || !name.startsWith('browser_use_'))) scoped.register(tool);
    if (!scope?.projectId) scoped.browserUse = this.browserUse;
    if (scope) {
      if(scope.projectId)for(const name of HOST_EXECUTION_TOOLS)scoped.tools.delete(name);
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
      else if(input.name==='fs_read') {const fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink>1||stat.size>2097152)throw Error('Unsupported file');const bytes=fs.readFileSync(fd),content=bytes.toString('utf8');console.log(JSON.stringify({content,size:bytes.length,lines:content.split('\\n').length,sha256:require('crypto').createHash('sha256').update(bytes).digest('hex')}));}finally{fs.closeSync(fd);}}
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

  async executeFileEdit(args,context={}) {
    context.signal?.throwIfAborted();
    const resolved=this.resolveWorkspacePath(args.path);
    const key=path.resolve(resolved),previous=this.fileEditLocks.get(key)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      context.signal?.throwIfAborted();
      this.resolveWorkspacePath(args.path);
      if(!this.scope)return {...editTextFile({...args,root:this.workspaceRoot},{fs,path,createHash,randomUUID}),path:args.path};
      const payload=JSON.stringify({...args,path:path.relative(this.workspaceRoot,resolved),root:'/workspace'});
      const script=`const fs=require('fs'),path=require('path'),{createHash,randomUUID}=require('crypto');const input=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify((${editTextFile.toString()})(input,{fs,path,createHash,randomUUID})));`;
      const quote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
      const result=await this.sandbox.execute({command:`node -e ${quote(script)}`,workspaceRoot:this.workspaceRoot,scope:this.scope},{...context,fileBroker:true,stdin:payload});
      if(!result.success)throw Error(result.stderr||'File edit sandbox failed');
      return {...JSON.parse(result.stdout),path:args.path};
    });
    this.fileEditLocks.set(key,task);
    try{return await task;}finally{if(this.fileEditLocks.get(key)===task)this.fileEditLocks.delete(key);}
  }

  describeRuntime() {
    const runtime = describeRuntime(this.workspaceRoot, this.hostEnabled);
    const sandbox = this.sandbox.status();
    return {...runtime,sandbox,backgroundJobs:this.hostEnabled ? 'available via shell_job_start/poll/kill/list' : 'unavailable',execution:{...runtime.execution,workspace:sandbox.available ? runtime.execution.workspace : 'unavailable'}};
  }

  registerBuiltins() {
    registerDocumentProposals(this);
    this.register({
      name: 'html_preview', readOnly:true, exclusive:true,
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
    this.register({name:'runtime_info',readOnly:true,exclusive:true,description:'Describe the actual local execution environment, OS, workspace and available shell modes. Check this before machine-specific commands. Host means the machine running the local service, never a remote client.',parameters:{type:'object',properties:{reason:{type:'string',description:'Optional explanation for inspecting the runtime; metadata only, does not change the operation.'}},additionalProperties:false},execute:async()=>this.describeRuntime()});
    if (this.hostEnabled) this.register({
      name:'shell_host',description:'Execute a native OS shell command on the machine running sky. Uses PowerShell on Windows and /bin/sh on Unix. Has host filesystem/network access, governed by shell_host permission rules. Use shell_exec for isolated workspace commands.',
      parameters:{type:'object',properties:{command:{type:'string'},cwd:{type:'string'},timeout:{type:'number'}},required:['command'],additionalProperties:false},
      execute:async ({command,cwd=this.workspaceRoot,timeout},context)=>executeHostShell({command,cwd,timeout},context,this.activeChildProcesses)
    });
    if (this.hostEnabled) this.register({
      name:'shell_job_start',description:'Start a long-running native OS shell command (dev server, build, watcher, install) as a background job and return a jobId immediately instead of waiting for it to finish. Uses the same host shell and permission class as shell_host. Watch progress with shell_job_poll; stop with shell_job_kill.',
      parameters:{type:'object',properties:{command:{type:'string',description:'Shell command to run in the background'},cwd:{type:'string',description:'Working directory (defaults to the current workspace)'},timeout:{type:'number',description:'Auto-terminate the job after this many ms (1000-3600000, default 900000)'}},required:['command'],additionalProperties:false},
      execute:async ({command,cwd=this.workspaceRoot,timeout},context)=>this.shellJobs.start({command,cwd,timeout},context)
    });
    if (this.hostEnabled) this.register({
      name:'shell_job_poll',readOnly:true,exclusive:true,description:'Read the status and the output appended since the previous poll of a background shell job started with shell_job_start. Output deltas are bounded; poll again to drain more. Use waitMs to wait briefly for completion instead of polling blind.',
      parameters:{type:'object',properties:{jobId:{type:'string',description:'Job handle returned by shell_job_start'},waitMs:{type:'number',description:'Wait up to this many ms for the job to finish before returning (max 30000, default 0)'}},required:['jobId'],additionalProperties:false},
      execute:async (args,context)=>this.shellJobs.poll(args,context)
    });
    if (this.hostEnabled) this.register({
      name:'shell_job_kill',description:'Terminate a background shell job started in this session, including its child processes, and return its final status and counters.',
      parameters:{type:'object',properties:{jobId:{type:'string',description:'Job handle returned by shell_job_start'}},required:['jobId'],additionalProperties:false},
      execute:async ({jobId},context)=>this.shellJobs.kill(jobId,context)
    });
    if (this.hostEnabled) this.register({
      name:'shell_job_list',readOnly:true,exclusive:true,description:'List background shell jobs of the current session with status and runtime. Use it to recover a jobId after context loss.',
      parameters:{type:'object',properties:{},additionalProperties:false},
      execute:async (_args,context)=>this.shellJobs.list(context)
    });
    // 1. fs_read
    this.register({
      name: 'fs_read', readOnly:true, exclusive:true,
      description: 'Read a workspace text file and its byte-level SHA-256. Use the returned sha256 as expectedHash for fs_edit; never guess a file version.',
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
        const bytes = fs.readFileSync(resolved);
        const content = bytes.toString('utf8');
        const lines = content.split('\n').length;
        return { path: filePath, fullPath: resolved, size: bytes.length, lines, content, sha256:createHash('sha256').update(bytes).digest('hex') };
      }
    });

    this.register({
      name:'fs_edit',exclusive:true,
      description:'Edit existing UTF-8 text by exact literal replacement. Read with fs_read first and pass its sha256 as expectedHash. Rejects stale files, ambiguous matches, symlinks and hardlinks. Use unique oldText including exact whitespace/line endings; replaceAll only when intentional. dryRun returns a bounded diff without writing. Success returns the new hash and diff; a conflict requires reading the current file, never blind replay.',
      parameters:{type:'object',properties:{path:{type:'string',minLength:1},expectedHash:{type:'string',pattern:'^[a-f0-9]{64}$'},oldText:{type:'string',minLength:1,maxLength:2097152},newText:{type:'string',maxLength:2097152},replaceAll:{type:'boolean'},dryRun:{type:'boolean'}},required:['path','expectedHash','oldText','newText'],additionalProperties:false},
      execute:(args,context)=>this.executeFileEdit(args,context)
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
      name: 'fs_list', readOnly:true, exclusive:true,
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

    // 3b. Office files (.docx/.xlsx): read, create and controlled edit.
    this.register({
      name: 'office_read', readOnly:true, exclusive:true,
      description: 'Đọc file Office trong workspace: .docx trả về các đoạn văn bản, .xlsx trả về lưới dữ liệu từng sheet. Dùng để xem lại sản phẩm Office trước/sau khi chỉnh sửa thay vì đoán nội dung.',
      parameters: {type:'object',properties:{path:{type:'string',description:'Đường dẫn file .docx hoặc .xlsx trong workspace'}},required:['path'],additionalProperties:false},
      execute: async ({path:filePath}) => {
        const resolved=this.resolveWorkspacePath(filePath);
        return {path:filePath,fullPath:resolved,...readOffice(fs.readFileSync(resolved),filePath)};
      }
    });
    this.register({
      name: 'office_write',
      description: 'Tạo hoặc ghi đè file Office trong workspace. .docx: doc={title, paragraphs:[...]}; .xlsx: doc={sheets:[{name, rows:[[...]]}]}. Cell chỉ nhận text/số/boolean. Ghi đè toàn bộ file: đọc office_read trước nếu cần giữ nội dung cũ.',
      parameters: {type:'object',properties:{path:{type:'string',description:'Đường dẫn .docx hoặc .xlsx'},doc:{type:'object',description:'Nội dung theo loại file'}},required:['path','doc'],additionalProperties:false},
      execute: async ({path:filePath,doc}) => {
        const resolved=this.resolveWorkspacePath(filePath,{allowMissing:true});
        const lower=filePath.toLowerCase();
        const buffer=lower.endsWith('.docx')?buildDocx(doc):lower.endsWith('.xlsx')?buildXlsx(doc):null;
        if(!buffer)throw new Error('office_write supports .docx and .xlsx paths only');
        fs.mkdirSync(path.dirname(resolved),{recursive:true});
        fs.writeFileSync(resolved,buffer);
        return {path:filePath,fullPath:resolved,bytesWritten:buffer.byteLength,success:true};
      }
    });
    this.register({
      name: 'office_edit',
      description: 'Chỉnh sửa có kiểm soát file Office có sẵn trong workspace: .docx dùng appendParagraphs (thêm đoạn cuối, không sửa đoạn cũ); .xlsx dùng cell (A1 như B2) + value (null để xóa cell) và sheet tùy chọn. Sau khi sửa nên office_read để xác minh.',
      parameters: {type:'object',properties:{path:{type:'string'},appendParagraphs:{type:'array',items:{type:'string'},maxItems:200},sheet:{type:'string'},cell:{type:'string'},value:{description:'Giá trị mới: text, số, boolean hoặc null để xóa cell'}},required:['path'],additionalProperties:false},
      execute: async ({path:filePath,appendParagraphs,sheet,cell,value}) => {
        const resolved=this.resolveWorkspacePath(filePath);
        const lower=filePath.toLowerCase();
        if(lower.endsWith('.docx')&&!appendParagraphs)throw new Error('Docx edit needs appendParagraphs');
        if(lower.endsWith('.xlsx')&&!cell)throw new Error('Xlsx edit needs cell');
        const current=fs.readFileSync(resolved);
        const updated=lower.endsWith('.docx')?appendDocxParagraphs(current,appendParagraphs):lower.endsWith('.xlsx')?editXlsxCell(current,{sheet:sheet??null,cell,value:value===undefined?null:value}):null;
        if(!updated)throw new Error('office_edit supports .docx and .xlsx paths only');
        fs.writeFileSync(resolved,updated);
        return {path:filePath,fullPath:resolved,bytesWritten:updated.byteLength,success:true};
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
        return this.sandbox.execute({command,cwd,timeout,workspaceRoot:this.workspaceRoot,scope:this.scope},context);
      }
    });

    // 5. web_search
    this.register({
      name: 'web_search', readOnly:true, exclusive:true,
      description: 'Tra cứu DuckDuckGo Instant Answers và chủ đề liên quan bằng từ khóa; không phải danh sách tìm kiếm web đầy đủ. Kết quả rỗng không chứng minh thông tin không tồn tại. Nếu có URL nguồn, dùng web_fetch hoặc trình duyệt được yêu cầu để đọc trực tiếp.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa hoặc câu hỏi cần tìm kiếm' }
        },
        required: ['query']
      },
      execute: async ({ query }, context = {}) => {
        if (!this.webSearch) throw new Error('Dịch vụ tìm kiếm chưa được khởi tạo. Khởi động lại sky.');
        return this.webSearch.search(query, { signal: context.signal });
      }
    });

    this.register({
      name:'web_fetch',readOnly:true,exclusive:false,resourceKeys:args=>['web-source:'+args.url],scopes:['standalone','project'],
      description:'Read ONE public HTTP/HTTPS source directly, including raw code, documentation and JSON. GET only; no login cookies, scripts or private network access. Returns actual URL, source text and links. Large outputs are saved as artifacts; use source_list/source_read to revisit evidence without fetching again. This does not run code or verify a whole repository. Never use it to bypass a denied browser action or destination.',
      parameters:{type:'object',properties:{url:{type:'string',minLength:1,maxLength:4096}},required:['url'],additionalProperties:false},
      execute:async({url},context={})=>{
        if(!this.webReader)throw Error('Public source reader unavailable; restart sky.');
        return this.webReader.read(url,{signal:context.signal});
      }
    });

    // 6. memory_save
    this.register({
      name: 'memory_save',
      description: 'Lưu một thông tin hoặc đặc điểm quan trọng của người dùng vào bộ nhớ dài hạn SQLite FTS5. Chat thường dùng chung bộ nhớ cá nhân giữa các chat của cùng agent; project có bộ nhớ riêng. Khi thông tin mới thay thế thông tin cũ đã lưu, dùng supersedes với id của memory cũ (lấy từ memory_search) thay vì lưu trùng. Chỉ xác nhận đã lưu sau khi công cụ thành công.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Phân loại: profile, semantic, project, episodic' },
          content: { type: 'string', description: 'Nội dung cần ghi nhớ chính xác' },
          supersedes: { type: 'string', description: 'Id của memory cũ mà thông tin này thay thế; memory cũ bị đánh dấu superseded và không còn hiện trong tìm kiếm' },
          ttlDays: { type: 'integer', description: 'Thời hạn giữ memory (ngày, 1-3650); hết hạn sẽ không còn hiện trong tìm kiếm' }
        },
        required: ['content'],
        additionalProperties: false
      },
      execute: async ({ category = 'semantic', content, supersedes = null, ttlDays }, context = {}) => {
        const agentId = context.agentId || 'default-assistant';
        const id = 'mem_' + Math.random().toString(36).substring(2, 10);
        let expiresAt = null;
        if (ttlDays !== undefined) {
          if (!Number.isSafeInteger(ttlDays) || ttlDays < 1 || ttlDays > 3650) throw new Error('ttlDays must be an integer between 1 and 3650');
          expiresAt = Date.now() + ttlDays * 86400000;
        }
        const mem = this.db.saveMemory(id, agentId, category, content, context.scopeId || 'legacy:unassigned', { source: 'agent', supersedes, expiresAt });
        return { success: true, savedMemory: { ...mem, version: mem.version ?? 1 }, ...(supersedes ? { superseded: supersedes } : {}) };
      }
    });

    // 7. memory_search
    this.register({
      name: 'memory_search', readOnly:true, exclusive:true,
      description: 'Tìm kiếm bộ nhớ dài hạn của agent theo từ khóa bằng SQLite FTS5. Chat thường tìm trong tất cả chat thường của cùng agent; project chỉ tìm trong project hiện tại. Kết quả chỉ gồm memory còn hiệu lực (không superseded, không forgotten, chưa hết hạn); dùng id từ kết quả cho memory_save supersedes hoặc memory_forget.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa cần tìm trong bộ nhớ' }
        },
        required: ['query']
      },
      execute: async ({ query }, context = {}) => {
        const agentId = context.agentId || 'default-assistant';
        const memories = this.db.searchMemories(query, 5, agentId, context.scopeId || 'legacy:unassigned')
          .map(mem => ({ ...mem, version: mem.version ?? 1, source: mem.source || 'agent' }));
        return { query, count: memories.length, memories };
      }
    });

    this.register({
      name: 'memory_forget', exclusive:true,
      description: 'Quên một memory đã lưu theo id (soft delete): biến mất khỏi tìm kiếm nhưng vẫn giữ trong database kèm dấu forgotten để truy vết. Lấy id từ memory_search. Chat thường chỉ được quên memory cá nhân của cùng agent; project chỉ quên memory của project đó.',
      parameters: {
        type: 'object',
        properties: {
          memoryId: { type: 'string', description: 'Id của memory cần quên' }
        },
        required: ['memoryId'],
        additionalProperties: false
      },
      execute: async ({ memoryId }, context = {}) => {
        const agentId = context.agentId || 'default-assistant';
        const mem = this.db.forgetMemory(memoryId, agentId, context.scopeId || 'legacy:unassigned');
        return { success: true, forgottenMemory: mem };
      }
    });
  }

  killProcessesForRun(runId) {
    const cancelled = this.sandbox.cancel(runId);
    this.shellJobs.killForRun(runId);
    const processes = this.activeChildProcesses.get(runId);
    if (!processes) return cancelled;
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
