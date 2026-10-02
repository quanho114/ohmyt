import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

export class ToolRegistry {
  constructor(db, workspaceRoot = process.cwd()) {
    this.db = db;
    this.workspaceRoot = workspaceRoot;
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

  getAllDefinitions() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  registerBuiltins() {
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
        const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(this.workspaceRoot, filePath);
        if (!fs.existsSync(resolved)) {
          throw new Error(`File không tồn tại: ${filePath}`);
        }
        const stat = fs.statSync(resolved);
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
        const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(this.workspaceRoot, filePath);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
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
        const resolved = path.isAbsolute(dirPath) ? dirPath : path.resolve(this.workspaceRoot, dirPath);
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
        return new Promise((resolve, reject) => {
          const isWin = process.platform === 'win32';
          const shell = isWin ? 'cmd.exe' : '/bin/sh';
          const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command];

          const workingDir = path.isAbsolute(cwd) ? cwd : path.resolve(this.workspaceRoot, cwd);
          let stdout = '';
          let stderr = '';

          const child = spawn(shell, shellArgs, {
            cwd: workingDir,
            windowsHide: true,
            env: { ...process.env }
          });

          const runId = context.runId;
          if (runId) {
            if (!this.activeChildProcesses.has(runId)) {
              this.activeChildProcesses.set(runId, new Set());
            }
            this.activeChildProcesses.get(runId).add(child);
          }

          let timer = null;
          if (timeout > 0) {
            timer = setTimeout(() => {
              try {
                child.kill('SIGTERM');
              } catch (_) {}
              reject(new Error(`Lệnh shell bị hủy do quá thời gian (${timeout}ms): ${command}`));
            }, timeout);
          }

          child.stdout.on('data', data => {
            stdout += data.toString();
            if (stdout.length > 500000) {
              stdout = stdout.substring(0, 500000) + '\n[... Output truncated at 500KB ...]';
            }
          });

          child.stderr.on('data', data => {
            stderr += data.toString();
            if (stderr.length > 500000) {
              stderr = stderr.substring(0, 500000) + '\n[... Stderr truncated at 500KB ...]';
            }
          });

          child.on('error', err => {
            clearTimeout(timer);
            if (runId && this.activeChildProcesses.has(runId)) {
              this.activeChildProcesses.get(runId).delete(child);
            }
            reject(err);
          });

          child.on('close', code => {
            clearTimeout(timer);
            if (runId && this.activeChildProcesses.has(runId)) {
              this.activeChildProcesses.get(runId).delete(child);
            }
            resolve({
              command,
              exitCode: code,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              success: code === 0
            });
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
      execute: async ({ query }) => {
        const memories = this.db.searchMemories(query, 5);
        return { query, count: memories.length, memories };
      }
    });
  }

  killProcessesForRun(runId) {
    if (this.activeChildProcesses.has(runId)) {
      const set = this.activeChildProcesses.get(runId);
      for (const child of set) {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
          } else {
            child.kill('SIGKILL');
          }
        } catch (_) {}
      }
      this.activeChildProcesses.delete(runId);
      return true;
    }
    return false;
  }
}
