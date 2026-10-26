import {createPlatformSandbox} from './platform.js';
import fs from 'node:fs';
import path from 'node:path';
import {rootIdentity} from '../project_scope.js';

// Provider contract: status(), execute(request, context), cancel(runId), dispose().
// Providers are trusted host code, selected at boot, never by model/tool arguments.
// This facade has no host fallback and is shared by all scoped tool registries.
export class WorkspaceSandbox {
  constructor(provider) {
    for (const method of ['status','execute','cancel','dispose']) {
      if (typeof provider?.[method] !== 'function') throw new Error(`Sandbox provider requires ${method}()`);
    }
    this.provider = provider;
    this.closed = false;
  }

  status() {
    if (this.closed) return {available:false,reason:'Sandbox disposed'};
    return this.provider.status();
  }

  async execute(request, context = {}) {
    context.signal?.throwIfAborted();
    const status = this.status();
    if (status.available !== true) throw new Error(`Workspace sandbox unavailable: ${status.reason || 'provider not ready'}`);
    const {command,argv,timeout = 30000,scope = null} = request;
    if (argv !== undefined) {
      if (!Array.isArray(argv) || argv.length === 0 || argv.some(value => typeof value !== 'string' || value.includes('\0')) || !argv[0]) throw new Error('Sandbox argv must be a nonempty array of NUL-free strings');
      if (command !== undefined) throw new Error('Sandbox request must specify command or argv, not both');
    } else if (typeof command !== 'string') throw new Error('Shell command must be text');
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('Shell timeout must be between 1 and 300000ms');
    const workspaceRoot = fs.realpathSync(request.workspaceRoot);
    if (scope && (workspaceRoot !== scope.canonicalRoot || rootIdentity(workspaceRoot) !== scope.rootIdentity)) throw new Error('Project root changed');
    let cwd;
    try { cwd = fs.realpathSync(path.resolve(workspaceRoot, request.cwd ?? workspaceRoot)); }
    catch { throw new Error(`Thư mục làm việc không tồn tại: ${request.cwd ?? workspaceRoot}`); }
    const relative = path.relative(workspaceRoot,cwd);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Thư mục làm việc nằm ngoài workspace');
    return this.provider.execute({...request,workspaceRoot,cwd,timeout,scope}, context);
  }

  cancel(runId) { return this.provider.cancel(runId); }

  dispose() {
    this.closed = true;
    return this.disposeTask ||= Promise.resolve().then(() => this.provider.dispose());
  }
}

export function createWorkspaceSandbox(provider = createPlatformSandbox()) {
  return new WorkspaceSandbox(provider);
}

export function sandboxPlugin(sandbox) {
  return {name:'core/sandbox',apply:ctx=>{
    ctx.provide('sandbox',sandbox);
    ctx.effect(() => () => sandbox.dispose());
  }};
}
