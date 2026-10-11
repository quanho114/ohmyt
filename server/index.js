import {Connectors} from './harness/connectors.js';
import { HarnessHost } from './harness/host.js';
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
import { BrowserBridge } from './browser_bridge.js';
import { WebSearchService } from './web_search.js';
import { STTManager } from './stt.js';
import { BrowserFiles } from './browser_files.js';
import { BrowserUseRuntime, browserUseConfig } from './browser_use.js';

export function createDaemon({ dbPath = null, port = 3188, workspaceRoot = process.cwd(), dataDir = null, hostEnabled = false, authToken = null, browserUse = browserUseConfig(), harnessConfig = {}, plugins = [], pluginOverrides = {} } = {}) {
  const browserUseRuntime = new BrowserUseRuntime(browserUse);
  if (dataDir) { fs.mkdirSync(dataDir, {recursive:true}); dbPath ||= path.join(dataDir,'app.db'); }
  const db = new AppDatabase(dbPath);
  const permissions = new PermissionEngine(db);
  const tools = new ToolRegistry(db, workspaceRoot, {hostEnabled});
  const browserBridge = new BrowserBridge();
  browserUseRuntime.browserBridge = browserBridge;
  browserBridge.registerTools(tools);
  browserUseRuntime.files = new BrowserFiles(db, path.join(dataDir || (dbPath && dbPath !== ':memory:' ? path.dirname(path.resolve(dbPath)) : path.resolve(workspaceRoot, 'data')), 'browser-files'));
  browserUseRuntime.initializeSettings(db, tools);
  browserUseRuntime.registerTools(tools);
  const skills = new SkillsManager(path.resolve(workspaceRoot, 'skills'));
  const llm = new LLMClient({
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    model: 'qwen2.5:14b'
  });
  const vault = new SecretsVault(dbPath === ':memory:' ? null : dataDir || path.resolve(workspaceRoot, 'data'));
  const webSearch = new WebSearchService(db, vault);
  tools.webSearch = webSearch;
  const registry = new ProviderRegistry(db, vault);
  const gateway = new Gateway(db, vault, registry);
  browserUseRuntime.gateway = gateway;browserUseRuntime.llm = llm;

  const agentLoop = new AgentLoop({ db, tools, permissions, skills, llm, gateway, registry });
  const harness = new HarnessHost({db,tools,permissions,skills,gateway,llm,agentLoop,config:harnessConfig,plugins,overrides:pluginOverrides});
  agentLoop.harness = harness;
  harness.connectors=new Connectors({db,host:harness,vault});
  browserUseRuntime.harness = harness;
  const stt = new STTManager(dataDir || path.resolve(workspaceRoot, 'data'));
  const apiServer = createApiServer({ db, tools, permissions, skills, llm, agentLoop, registry, gateway, vault, webSearch, browserBridge, browserUse: browserUseRuntime, stt, port, authToken });

  let stopTask;
  return {
    db,
    permissions,
    tools,
    browserBridge,
    browserUse: browserUseRuntime,
    stt,
    skills,
    llm,
    registry,
    gateway,
    vault,
    webSearch,
    agentLoop,
    apiServer,
    harness,
    start: async () => { await harness.ready; const address=await apiServer.listen(port);for(const row of db.db.prepare("SELECT DISTINCT session_id FROM harness_inbox WHERE status='queued' AND kind='queued'").all())agentLoop.pumpInbox(row.session_id);return address; },
    stop: () => stopTask ||= (async () => {
      harness.closing = true;
      await agentLoop.drain('Daemon stopped');
      const errors = [];
      // Attempt every dependent cleanup, even when an individual resource fails.
      for (const close of [() => harness.connectors.dispose(), () => browserUseRuntime.close(), () => browserBridge.close(), () => stt.close(), () => apiServer.close(), () => harness.dispose(), () => db.close()]) {
        try { await close(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Daemon cleanup failed');
    })()
  };
}

// Auto-run if executed directly
const isMain = process.argv[1] && (
  process.argv[1].replace(/\\/g, '/').endsWith('server/index.js')
);
if (isMain) {
  // Crash protection belongs to the executable, not processes importing this module.
  process.on('uncaughtException', (err) => {
    console.error('[Daemon UncaughtException]:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Daemon UnhandledRejection]:', reason);
  });

  const daemon = createDaemon({ hostEnabled: true });
  daemon.start().then(addr => {
    console.log(`🚀 Desktop AI Agent Daemon running at http://localhost:${addr.port}`);
    console.log(`📁 Workspace Root: ${process.cwd()}`);
    console.log(`💾 SQLite DB: ${daemon.db.dbPath}`);
  }).catch(err => {
    console.error('Failed to start daemon:', err);
    process.exit(1);
  });
}
