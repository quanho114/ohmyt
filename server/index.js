import path from 'node:path';
import fs from 'node:fs';
import { AppDatabase } from './db.js';
import { PermissionEngine } from './permissions.js';
import { ToolRegistry } from './tools.js';
import { SkillsManager } from './skills.js';
import { LLMClient } from './llm.js';
import { AgentLoop } from './agent_loop.js';
import { createApiServer } from './api.js';
import { SecretsVault } from './providers/secrets.js';
import { ProviderRegistry } from './providers/registry.js';
import { Gateway } from './providers/gateway.js';

export function createDaemon({ dbPath = null, port = 3188, workspaceRoot = process.cwd(), dataDir = null, hostEnabled = false, authToken = null } = {}) {
  if (dataDir) { fs.mkdirSync(dataDir, {recursive:true}); dbPath ||= path.join(dataDir,'app.db'); }
  const db = new AppDatabase(dbPath);
  const permissions = new PermissionEngine(db);
  const tools = new ToolRegistry(db, workspaceRoot, {hostEnabled});
  const skills = new SkillsManager(path.resolve(workspaceRoot, 'skills'));
  const llm = new LLMClient({
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    model: 'qwen2.5:14b'
  });
  const vault = new SecretsVault(dbPath === ':memory:' ? null : dataDir || path.resolve(workspaceRoot, 'data'));
  const registry = new ProviderRegistry(db, vault);
  const gateway = new Gateway(db, vault, registry);

  const agentLoop = new AgentLoop({ db, tools, permissions, skills, llm, gateway, registry });
  const apiServer = createApiServer({ db, tools, permissions, skills, llm, agentLoop, registry, gateway, vault, port, authToken });

  return {
    db,
    permissions,
    tools,
    skills,
    llm,
    registry,
    gateway,
    vault,
    agentLoop,
    apiServer,
    start: () => apiServer.listen(port),
    stop: async () => {
      await apiServer.close();
      db.close();
    }
  };
}

// Crash protection for persistent daemon
process.on('uncaughtException', (err) => {
  console.error('[Daemon UncaughtException]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Daemon UnhandledRejection]:', reason);
});

// Auto-run if executed directly
const isMain = process.argv[1] && (
  process.argv[1].replace(/\\/g, '/').endsWith('server/index.js')
);
if (isMain) {
  const daemon = createDaemon();
  daemon.start().then(addr => {
    console.log(`🚀 Desktop AI Agent Daemon running at http://localhost:${addr.port}`);
    console.log(`📁 Workspace Root: ${process.cwd()}`);
    console.log(`💾 SQLite DB: ${daemon.db.dbPath}`);
  }).catch(err => {
    console.error('Failed to start daemon:', err);
    process.exit(1);
  });
}
