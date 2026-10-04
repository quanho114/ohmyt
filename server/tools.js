import {describeRuntime,executeHostShell} from './local_runtime.js';
import fs from 'node:fs';
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

  register(tool) {
    this.tools.set(tool.name, tool);
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
    const candidate = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(root, inputPath);
    const relative = path.relative(root, candidate);
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
    if (resolvedRelative === '..' || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) {
      throw new Error(`Path is outside workspace: ${inputPath}`);
    }
    return candidate;
  }

  describeRuntime() { return describeRuntime(this.workspaceRoot, this.hostEnabled); }

  registerBuiltins() {
    this.register({name:'runtime_info',description:'Describe the actual local execution environment, OS, workspace and available shell modes. Check this before machine-specific commands. Host means the machine running the local service, never a remote client.',parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>this.describeRuntime()});
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

        const args = [
          '--unshare-all', '--die-with-parent',
          '--tmpfs', '/',
          '--ro-bind', '/usr', '/usr',
          '--ro-bind', '/etc', '/etc',
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
        if (fs.existsSync(path.join(workspaceRoot, 'data'))) args.push('--tmpfs', '/workspace/data');
        for (const secretFile of ['.env', '.env.local', '.env.development', '.env.production']) {
          if (fs.existsSync(path.join(workspaceRoot, secretFile))) {
            args.push('--ro-bind', '/dev/null', `/workspace/${secretFile}`);
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
        const outputLimit = 500_000;
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
            child = spawn('/usr/bin/bwrap', args, {
              cwd: workspaceRoot,
              detached: true,
              windowsHide: true,
              env: {
                PATH: '/usr/bin:/bin',
                HOME: '/tmp',
                LANG: 'C.UTF-8',
                LC_ALL: 'C.UTF-8'
              },
              stdio: ['ignore', 'pipe', 'pipe', workspaceFd]
            });
          } catch (err) {
            if (workspaceFd !== undefined) fs.closeSync(workspaceFd);
            reject(new Error(`Không thể khởi chạy Linux workspace sandbox: ${err.message}`));
            return;
          }
          fs.closeSync(workspaceFd);

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
      execute: async ({ query }) => {
        // Real web query using DuckDuckGo Instant Answer API + HTML fallback
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        try {
          const data = await new Promise((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
              let body = '';
              res.on('data', chunk => (body += chunk));
              res.on('end', () => {
                try {
                  resolve(JSON.parse(body));
                } catch {
                  resolve(null);
                }
              });
            }).on('error', err => reject(err));
          });

          const results = [];
          if (data && data.AbstractText) {
            results.push({
              title: data.Heading || query,
              snippet: data.AbstractText,
              url: data.AbstractURL || ''
            });
          }

          if (data && data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
            for (const topic of data.RelatedTopics.slice(0, 5)) {
              if (topic.Text) {
                results.push({
                  title: topic.FirstURL ? path.basename(topic.FirstURL) : query,
                  snippet: topic.Text,
                  url: topic.FirstURL || ''
                });
              }
            }
          }

          if (results.length === 0) {
            return {
              query,
              message: `Đã tìm kiếm "${query}" trên internet. Không có kết quả tóm tắt tức thì trực tiếp từ API.`,
              results: []
            };
          }

          return { query, resultsCount: results.length, results };
        } catch (err) {
          return { query, error: err.message, results: [] };
        }
      }
    });

    // 6. memory_save
    this.register({
      name: 'memory_save',
      description: 'Lưu một thông tin hoặc đặc điểm quan trọng của người dùng vào bộ nhớ dài hạn SQLite FTS5.',
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
        const mem = this.db.saveMemory(id, agentId, category, content);
        return { success: true, savedMemory: mem };
      }
    });

    // 7. memory_search
    this.register({
      name: 'memory_search',
      description: 'Tìm kiếm bộ nhớ dài hạn của agent theo từ khóa bằng SQLite FTS5.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa cần tìm trong bộ nhớ' }
        },
        required: ['query']
      },
      execute: async ({ query }, context = {}) => {
        const agentId = context.agentId || 'default-assistant';
        const memories = this.db.searchMemories(query, 5, agentId);
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
