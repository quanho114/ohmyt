import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import {rootIdentity} from './project_scope.js';

export class AppDatabase {
  constructor(dbPath = null) {
    if (!dbPath) {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'app.db');
    } else {
      this.dbPath = dbPath;
    }

    this.db = new DatabaseSync(this.dbPath);
    this.init();
  }

  init() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        system_prompt TEXT NOT NULL,
        model_provider TEXT NOT NULL DEFAULT 'ollama',
        model_name TEXT NOT NULL DEFAULT 'qwen2.5:14b',
        temperature REAL NOT NULL DEFAULT 0.7,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        error TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        content='memories',
        content_rowid='rowid'
      );

      -- Triggers to keep memories_fts in sync
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TABLE IF NOT EXISTS tool_policies (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL UNIQUE,
        action TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        base_url TEXT,
        api_key_ref TEXT,
        config_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        capabilities_json TEXT NOT NULL DEFAULT '{}',
        context_window INTEGER,
        max_output_tokens INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS secrets_metadata (
        key_ref TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    try {
      const sessCols = this.db.prepare(`SELECT name FROM pragma_table_info('sessions')`).all().map(c => c.name);
      if (!sessCols.includes('title_topic_set')) this.db.exec('ALTER TABLE sessions ADD COLUMN title_topic_set INTEGER NOT NULL DEFAULT 0');
      if (!sessCols.includes('harness_parent_session_id')) this.db.exec('ALTER TABLE sessions ADD COLUMN harness_parent_session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE');
      if (!sessCols.includes('title_manual')) this.db.exec('ALTER TABLE sessions ADD COLUMN title_manual INTEGER NOT NULL DEFAULT 0');
      if (!sessCols.includes('model_override_json')) {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN model_override_json TEXT`);
      }
    } catch {}
    try {
      const evCols = this.db.prepare(`SELECT name FROM pragma_table_info('run_events')`).all().map(c => c.name);
      if (!evCols.includes('sequence')) {
        this.db.exec(`ALTER TABLE run_events ADD COLUMN sequence INTEGER`);
        this.db.exec(`UPDATE run_events SET sequence = id WHERE sequence IS NULL`);
      }
    } catch {}

    this.db.exec(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
    )`);
    if (!this.db.prepare("SELECT name FROM pragma_table_info('projects')").all().some(c => c.name === 'removed_at')) this.db.exec('ALTER TABLE projects ADD COLUMN removed_at INTEGER');
    const projectFields = this.db.prepare("SELECT name FROM pragma_table_info('projects')").all();
    for (const [name, type] of [['pinned', 'INTEGER NOT NULL DEFAULT 0'], ['section', 'TEXT']]) {
      if (!projectFields.some(c => c.name === name)) this.db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${type}`);
    }
    const projectColumns = this.db.prepare("SELECT name FROM pragma_table_info('sessions')").all();
    if (!projectColumns.some(c => c.name === 'approval_mode')) this.db.exec("ALTER TABLE sessions ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'ask'");
    if (!projectColumns.some(c => c.name === 'archived_at')) this.db.exec('ALTER TABLE sessions ADD COLUMN archived_at INTEGER');
    if (!projectColumns.some(c => c.name === 'project_id')) this.db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT REFERENCES projects(id)');
    const memoryColumns = this.db.prepare("SELECT name FROM pragma_table_info('memories')").all();
    if (!memoryColumns.some(c => c.name === 'scope_id') && this.dbPath !== ':memory:') {
      const backup = this.dbPath + '.before-project-isolation-' + Date.now() + '.bak';
      this.db.exec("VACUUM INTO '" + backup.replaceAll("'", "''") + "'");
      fs.chmodSync(backup, 0o600);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!memoryColumns.some(c => c.name === 'scope_id')) this.db.exec("ALTER TABLE memories ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'legacy:unassigned'");
      this.db.exec(`CREATE INDEX IF NOT EXISTS memory_scope ON memories(scope_id, agent_id, created_at);
        CREATE TABLE IF NOT EXISTS scoped_policies (scope_id TEXT NOT NULL, pattern TEXT NOT NULL, action TEXT NOT NULL, PRIMARY KEY(scope_id,pattern))`);
      const columns = this.db.prepare("SELECT name FROM pragma_table_info('projects')").all();
      if (!columns.some(c => c.name === 'root_identity')) {
        this.db.exec('ALTER TABLE projects ADD COLUMN root_identity TEXT');
        for (const project of this.getProjects()) {
          try { this.db.prepare('UPDATE projects SET root_identity = ? WHERE id = ?').run(rootIdentity(project.path), project.id); } catch {}
        }
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.seedDefaults();
  }

  seedDefaults() {
    const agentStmt = this.db.prepare('SELECT id FROM agents WHERE id = ?');
    const defaultAgent = agentStmt.get('default-assistant');
    if (!defaultAgent) {
      const insertAgent = this.db.prepare(`
        INSERT INTO agents (id, name, avatar, system_prompt, model_provider, model_name, temperature, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertAgent.run(
        'default-assistant',
        'ohmyt',
        'OT',
        'Bạn là ohmyt, trợ lý làm việc trực tiếp trên desktop cá nhân của người dùng. Bạn thực hiện các tác vụ đọc/ghi tập tin, chạy lệnh terminal, tìm kiếm web và lưu trữ bộ nhớ có kiểm soát phân quyền an toàn. Luôn trả lời ngắn gọn, thẳng thắn, chính xác, tự nhiên như một đồng nghiệp kỹ thuật, không giới thiệu vòng vo hay liệt kê các chi tiết kỹ thuật nội bộ trừ khi được yêu cầu.',
        'ollama',
        'qwen2.5:14b',
        0.7,
        Date.now()
      );
    }

    const defaultPolicies = [
      { id: 'pol_fs_read', pattern: 'fs_read:*', action: 'ALLOW' },
      { id: 'pol_fs_list', pattern: 'fs_list:*', action: 'ALLOW' },
      { id: 'pol_web_search', pattern: 'web_search:*', action: 'ALLOW' },
      { id: 'pol_memory', pattern: 'memory_*:*', action: 'ALLOW' },
      { id: 'pol_fs_write', pattern: 'fs_write:*', action: 'ASK' },
      { id: 'pol_shell_deny_rf', pattern: 'shell_exec:*rm -rf /*', action: 'DENY' },
      { id: 'pol_shell_deny_fmt', pattern: 'shell_exec:*format *', action: 'DENY' },
      { id: 'pol_shell_default', pattern: 'shell_exec:*', action: 'ASK' }
    ];

    const polCheck = this.db.prepare('SELECT id FROM tool_policies WHERE id = ?');
    const polInsert = this.db.prepare('INSERT INTO tool_policies (id, pattern, action) VALUES (?, ?, ?)');

    for (const p of defaultPolicies) {
      if (!polCheck.get(p.id)) {
        polInsert.run(p.id, p.pattern, p.action);
      }
    }

    try {
      const provCount = this.db.prepare('SELECT COUNT(*) as c FROM providers').get();
      if (provCount && provCount.c === 0) {
        const now = Date.now();
        this.db.prepare(`INSERT INTO providers (id,name,type,base_url,api_key_ref,config_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`)
          .run('prov_ollama_local', 'Ollama Local', 'ollama', 'http://localhost:11434', null, '{}', now, now);
        this.db.prepare(`INSERT INTO models (id,provider_id,model_id,display_name,capabilities_json,context_window,max_output_tokens,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run('model_ollama_qwen', 'prov_ollama_local', 'qwen2.5:14b', 'qwen2.5:14b', JSON.stringify({ chat: true, streaming: true, tools: true, vision: false, reasoning: false, json: true, embeddings: false }), null, null, 1, now, now);
      }
    } catch {}
  }

  // --- Agents ---
  getAgents() {
    return this.db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all();
  }

  getAgent(id) {
    return this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  }

  upsertAgent({ id, name, avatar, system_prompt, model_provider, model_name, temperature }) {
    const existing = this.getAgent(id);
    if (existing) {
      this.db.prepare(`
        UPDATE agents SET name = ?, avatar = ?, system_prompt = ?, model_provider = ?, model_name = ?, temperature = ?
        WHERE id = ?
      `).run(name, avatar, system_prompt, model_provider, model_name, temperature, id);
    } else {
      this.db.prepare(`
        INSERT INTO agents (id, name, avatar, system_prompt, model_provider, model_name, temperature, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, avatar, system_prompt, model_provider, model_name, temperature, Date.now());
    }
    return this.getAgent(id);
  }

  // --- Sessions ---
  getSessions() {
    return this.db.prepare(`
      SELECT s.*, p.name as project_name, p.path as project_path, a.name as agent_name, a.avatar as agent_avatar,
      (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM sessions s
      JOIN agents a ON s.agent_id = a.id
      LEFT JOIN projects p ON s.project_id = p.id
      WHERE s.harness_parent_session_id IS NULL
      ORDER BY s.updated_at DESC
    `).all();
  }

  getSession(id) {
    return this.db.prepare('SELECT s.*, p.name as project_name, p.path as project_path FROM sessions s LEFT JOIN projects p ON s.project_id = p.id WHERE s.id = ?').get(id);
  }

  getProjects(includeRemoved = false) { return this.db.prepare(`SELECT * FROM projects ${includeRemoved ? '' : 'WHERE removed_at IS NULL'} ORDER BY created_at DESC`).all(); }
  removeProject(id) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const active = this.db.prepare("SELECT r.id FROM runs r JOIN sessions s ON s.id = r.session_id WHERE s.project_id = ? AND r.status IN ('running', 'pending', 'waiting_approval') LIMIT 1").get(id);
      if (active) throw new Error('Dự án đang có tác vụ chạy. Dừng tác vụ trước khi gỡ dự án.');
      this.db.prepare('DELETE FROM sessions WHERE project_id = ?').run(id);
      this.db.prepare('DELETE FROM memories WHERE scope_id = ?').run(`project:${id}`);
      this.db.prepare('DELETE FROM scoped_policies WHERE scope_id = ?').run(`project:${id}`);
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  restoreProject(id) { this.db.prepare('UPDATE projects SET removed_at = NULL WHERE id = ?').run(id); return this.getProject(id); }
  updateProject(id, values) {
    const project = this.getProject(id);
    this.db.prepare('UPDATE projects SET name = ?, pinned = ?, section = ? WHERE id = ?').run(values.name ?? project.name, values.pinned === undefined ? project.pinned : Number(values.pinned), values.section === undefined ? project.section : values.section, id);
    return this.getProject(id);
  }
  archiveProjectSessions(id, archived) {
    return this.db.prepare(`UPDATE sessions SET archived_at = ? WHERE project_id = ? AND archived_at IS ${archived ? 'NULL' : 'NOT NULL'}`).run(archived ? Date.now() : null, id).changes;
  }
  getProject(id) { return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id); }
  addProject(id, name, projectPath) {
    this.db.prepare('INSERT INTO projects (id, name, path, created_at, root_identity) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO NOTHING').run(id, name, projectPath, Date.now(), rootIdentity(projectPath));
    return this.db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath);
  }

  createSession(id, agentId, title, projectId = null) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO sessions (id, agent_id, title, created_at, updated_at, project_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, agentId, title, now, now, projectId);
    return this.getSession(id);
  }

  updateSession(id, title) {
    this.db.prepare('UPDATE sessions SET title = ?, updated_at = ?, title_manual = 1 WHERE id = ?').run(title, Date.now(), id);
    return this.getSession(id);
  }

  updateAutoTitle(id, expectedTitle, title, topicSet = false) {
    const result = this.db.prepare('UPDATE sessions SET title = ?, title_topic_set = ? WHERE id = ? AND title = ? AND title_manual = 0 AND title_topic_set = 0').run(title, topicSet ? 1 : 0, id, expectedTitle);
    return result.changes ? this.getSession(id) : null;
  }

  resetGreetingTitle(id, expectedTitle, title) {
    const result = this.db.prepare('UPDATE sessions SET title = ?, title_topic_set = 0 WHERE id = ? AND title = ? AND title_manual = 0').run(title, id, expectedTitle);
    return result.changes ? this.getSession(id) : null;
  }

  deleteSession(id) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  // --- Messages ---
  getMessages(sessionId) {
    return this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
  }

  addMessage(id, sessionId, sender, content, metadata = null) {
    const now = Date.now();
    const metaStr = metadata ? JSON.stringify(metadata) : null;
    this.db.prepare(`
      INSERT INTO messages (id, session_id, sender, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, sender, content, metaStr, now);

    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  }

  deleteMessage(id) {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!row) return false;
    this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), row.session_id);
    return true;
  }

  truncateMessagesAfter(sessionId, afterId) {
    if (!afterId) {
      const result = this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), sessionId);
      return result.changes;
    }
    const anchor = this.db.prepare('SELECT rowid FROM messages WHERE id = ? AND session_id = ?').get(afterId, sessionId);
    if (!anchor) return 0;
    const result = this.db.prepare('DELETE FROM messages WHERE session_id = ? AND rowid > ?').run(sessionId, anchor.rowid);
    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), sessionId);
    return result.changes;
  }

  // --- Branch (Tạo chủ đề phụ kiểu LobeHub): clone lịch sử đến anchor sang session mới ---
  branchSession(newId, sourceSessionId, anchorId, includeAnchor = true) {
    const source = this.getSession(sourceSessionId);
    if (!source) return null;
    const anchor = anchorId
      ? this.db.prepare('SELECT rowid FROM messages WHERE id = ? AND session_id = ?').get(anchorId, sourceSessionId)
      : null;
    if (anchorId && !anchor) return null;
    const rows = anchor
      ? this.db.prepare(
          includeAnchor
            ? 'SELECT * FROM messages WHERE session_id = ? AND rowid <= ? ORDER BY rowid ASC'
            : 'SELECT * FROM messages WHERE session_id = ? AND rowid < ? ORDER BY rowid ASC'
        ).all(sourceSessionId, anchor.rowid)
      : this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY rowid ASC').all(sourceSessionId);
    const now = Date.now();
    const insertMsg = this.db.prepare(`
      INSERT INTO messages (id, session_id, sender, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const m of rows) {
      const nid = 'msg_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
      insertMsg.run(nid, newId, m.sender, m.content, m.metadata, m.created_at || now);
    }
    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, newId);
    return { copied: rows.length };
  }

  // --- Runs & Events ---
  createRun(id, sessionId) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO runs (id, session_id, status, started_at)
      VALUES (?, ?, 'running', ?)
    `).run(id, sessionId, now);
    return this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  }

  updateRunStatus(id, status, error = null) {
    if (this.isClosed) return;
    try {
      this.db.prepare('UPDATE runs SET status = ?, ended_at = ?, error = ? WHERE id = ?')
        .run(status, Date.now(), error, id);
    } catch {}
  }

  addRunEvent(runId, eventType, payload, sequence = null) {
    if (this.isClosed) return;
    try {
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      try {
        const cols = this.db.prepare(`SELECT name FROM pragma_table_info('run_events')`).all().map(c => c.name);
        if (cols.includes('sequence')) {
          let seq = sequence;
          if (seq == null) {
            const row = this.db.prepare(`SELECT MAX(sequence) as m FROM run_events WHERE run_id = ?`).get(runId);
            seq = (row && row.m != null ? row.m : 0) + 1;
          }
          this.db.prepare(`
            INSERT INTO run_events (run_id, event_type, payload, created_at, sequence)
            VALUES (?, ?, ?, ?, ?)
          `).run(runId, eventType, payloadStr, Date.now(), seq);
          return;
        }
      } catch {}
      this.db.prepare(`
        INSERT INTO run_events (run_id, event_type, payload, created_at)
        VALUES (?, ?, ?, ?)
      `).run(runId, eventType, payloadStr, Date.now());
    } catch {}
  }

  getRunEvents(runId) {
    try {
      const cols = this.db.prepare(`SELECT name FROM pragma_table_info('run_events')`).all().map(c => c.name);
      if (cols.includes('sequence')) {
        return this.db.prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY sequence ASC, id ASC').all(runId);
      }
    } catch {}
    return this.db.prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC').all(runId);
  }

  getStatistics(month, offsetMinutes = 0, now = Date.now()) {
    const day = (time) => new Date(time - offsetMinutes * 60_000).toISOString().slice(0, 10);
    const today = day(now);
    const yearStart = new Date(Date.parse(`${today}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
    const monthStart = `${month}-01`;
    const [year, number] = month.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
    const previousMonth = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
    const previousStart = `${previousMonth}-01`;
    const firstDay = [yearStart, monthStart, previousStart].sort()[0];
    const lastDay = [today, new Date(Date.parse(`${nextMonth}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)].sort().at(-1);
    const shiftedDate = (field) => `date((${field} - ? * 60000) / 1000, 'unixepoch')`;
    const countByDate = (table, timestamp) => this.db.prepare(`
      SELECT ${shiftedDate(timestamp)} AS day, COUNT(*) AS count FROM ${table}
      WHERE ${timestamp} >= ? AND ${timestamp} < ? GROUP BY day
    `).all(offsetMinutes, Date.parse(`${firstDay}T00:00:00Z`) + offsetMinutes * 60_000, Date.parse(`${lastDay}T00:00:00Z`) + 86_400_000 + offsetMinutes * 60_000);
    const daily = new Map();
    for (const row of countByDate('runs', 'started_at')) daily.set(row.day, { date: row.day, runs: row.count, messages: 0 });
    for (const row of countByDate('messages', 'created_at')) {
      const record = daily.get(row.day) || { date: row.day, runs: 0, messages: 0 };
      record.messages = row.count;
      daily.set(row.day, record);
    }
    const series = (start, end) => {
      const rows = [];
      for (let current = Date.parse(`${start}T00:00:00Z`); current < Date.parse(`${end}T00:00:00Z`); current += 86_400_000) {
        const key = new Date(current).toISOString().slice(0, 10);
        rows.push(daily.get(key) || { date: key, runs: 0, messages: 0 });
      }
      return rows;
    };
    const activity = series(yearStart, new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
    const monthly = series(monthStart, nextMonth);
    const previous = series(previousStart, monthStart);
    let longestStreak = 0;
    let streak = 0;
    for (const record of activity) {
      streak = record.runs || record.messages ? streak + 1 : 0;
      longestStreak = Math.max(longestStreak, streak);
    }
    const yesterday = activity.at(-2);
    const currentStreak = activity.at(-1)?.runs || activity.at(-1)?.messages ? streak : yesterday?.runs || yesterday?.messages ? (() => {
      let count = 0;
      for (let i = activity.length - 2; i >= 0 && (activity[i].runs || activity[i].messages); i--) count++;
      return count;
    })() : 0;
    const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
    const total = (table) => this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    const firstActivity = this.db.prepare(`SELECT MIN(created_at) AS time FROM (SELECT created_at FROM sessions UNION ALL SELECT created_at FROM messages)`).get().time;
    return {
      month, today, firstActivity,
      totals: { agents: total('agents'), sessions: total('sessions'), messages: total('messages'), runs: total('runs'), tokens: null },
      previous: { runs: sum(previous, 'runs'), messages: sum(previous, 'messages') },
      activity: { daily: activity, peakRuns: Math.max(0, ...activity.map(row => row.runs)), peakMessages: Math.max(0, ...activity.map(row => row.messages)), currentStreak, longestStreak,
        longestRunMs: this.db.prepare(`SELECT MAX(ended_at - started_at) AS ms FROM runs WHERE ended_at >= started_at AND status = 'completed'`).get().ms },
      rankings: {
        agents: this.db.prepare(`SELECT a.name, COUNT(r.id) AS count FROM agents a JOIN sessions s ON s.agent_id = a.id JOIN runs r ON r.session_id = s.id GROUP BY a.id ORDER BY count DESC LIMIT 5`).all(),
        conversations: this.db.prepare(`SELECT s.title AS name, COUNT(m.id) AS count FROM sessions s JOIN messages m ON m.session_id = s.id GROUP BY s.id ORDER BY count DESC LIMIT 5`).all()
      },
      monthly: { daily: monthly, runs: sum(monthly, 'runs'), messages: sum(monthly, 'messages'), activeModels: this.db.prepare('SELECT COUNT(*) AS count FROM models WHERE enabled = 1').get().count, todayCost: null, monthCost: null, tokens: null }
    };
  }

  // --- Memories & FTS5 ---
  saveMemory(id, agentId, category, content, scopeId = 'legacy:unassigned') {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO memories (id, agent_id, category, content, created_at, scope_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, agentId, category, content, now, scopeId);
    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
  }

  searchMemories(query, limit = 5, agentId = null, scopeId = null) {
    // Standalone chats share personal memory; session IDs retain save provenance.
    const personal = typeof scopeId === 'string' && scopeId.startsWith('standalone:');
    // Sanitizing FTS query (keep alphanumeric and words)
    const cleanQuery = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    if (!cleanQuery) return [];

    const terms = cleanQuery.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const ftsPattern = terms.map(t => `"${t}"*`).join(' OR ');

    try {
      return this.db.prepare(`
        SELECT m.* FROM memories m
        JOIN memories_fts f ON m.rowid = f.rowid
        WHERE memories_fts MATCH ? AND (? IS NULL OR m.agent_id = ?) AND (? IS NULL OR m.scope_id = ? OR (? AND m.scope_id LIKE 'standalone:%'))
        ORDER BY bm25(memories_fts) ASC
        LIMIT ?
      `).all(ftsPattern, agentId, agentId, scopeId, scopeId, personal ? 1 : 0, limit);
    } catch {
      const likePattern = `%${terms[0]}%`;
      return this.db.prepare(`
        SELECT * FROM memories WHERE content LIKE ? AND (? IS NULL OR agent_id = ?) AND (? IS NULL OR scope_id = ? OR (? AND scope_id LIKE 'standalone:%')) LIMIT ?
      `).all(likePattern, agentId, agentId, scopeId, scopeId, personal ? 1 : 0, limit);
    }
  }

  getAllMemories(agentId = null, scopeId = null) {
    if (scopeId) return this.db.prepare("SELECT * FROM memories WHERE (scope_id = ? OR (? AND scope_id LIKE 'standalone:%')) AND (? IS NULL OR agent_id = ?) ORDER BY created_at DESC,rowid DESC").all(scopeId,scopeId.startsWith('standalone:') ? 1 : 0,agentId,agentId);
    if (agentId) {
      return this.db.prepare('SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC').all(agentId);
    }
    return this.db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all();
  }

  getPersonalProfile(agentId,limit=8) {
    return this.db.prepare("SELECT * FROM memories WHERE agent_id=? AND scope_id LIKE 'standalone:%' AND category='profile' ORDER BY created_at DESC,rowid DESC LIMIT ?").all(agentId,limit);
  }

  deleteMemory(id) {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  // --- Tool Policies ---
  getScopedPolicies(scopeId) { return this.db.prepare('SELECT * FROM scoped_policies WHERE scope_id = ?').all(scopeId); }
  setScopedPolicy(scopeId, pattern, action) { this.db.prepare('INSERT INTO scoped_policies VALUES (?, ?, ?) ON CONFLICT(scope_id,pattern) DO UPDATE SET action = excluded.action').run(scopeId, pattern, action); }

  getPolicies() {
    return this.db.prepare('SELECT * FROM tool_policies ORDER BY id ASC').all();
  }

  setPolicy(pattern, action) {
    const existing = this.db.prepare('SELECT id FROM tool_policies WHERE pattern = ?').get(pattern);
    if (existing) {
      this.db.prepare('UPDATE tool_policies SET action = ? WHERE pattern = ?').run(action, pattern);
    } else {
      const id = 'pol_' + Math.random().toString(36).substring(2, 9);
      this.db.prepare('INSERT INTO tool_policies (id, pattern, action) VALUES (?, ?, ?)').run(id, pattern, action);
    }
    return this.getPolicies();
  }

  // --- Providers ---
  createProvider({ id, name, type, base_url = null, api_key_ref = null, config_json = '{}' }) {
    const pid = id || 'prov_' + Math.random().toString(36).substring(2, 10);
    const now = Date.now();
    this.db.prepare(`INSERT INTO providers (id,name,type,base_url,api_key_ref,config_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`)
      .run(pid, name, type, base_url, api_key_ref, typeof config_json === 'string' ? config_json : JSON.stringify(config_json), now, now);
    return this.getProvider(pid);
  }

  getProviders() {
    return this.db.prepare(`SELECT * FROM providers ORDER BY created_at ASC`).all();
  }

  getProvider(id) {
    return this.db.prepare(`SELECT * FROM providers WHERE id = ?`).get(id);
  }

  updateProvider(id, patch) {
    const cur = this.getProvider(id);
    if (!cur) throw new Error('Provider not found');
    const next = { ...cur, ...patch, updated_at: Date.now() };
    this.db.prepare(`UPDATE providers SET name=?,type=?,base_url=?,api_key_ref=?,config_json=?,enabled=?,updated_at=? WHERE id=?`)
      .run(next.name, next.type, next.base_url, next.api_key_ref, typeof next.config_json === 'string' ? next.config_json : JSON.stringify(next.config_json), next.enabled ? 1 : 0, next.updated_at, id);
    return this.getProvider(id);
  }

  deleteProvider(id) {
    this.db.prepare(`DELETE FROM models WHERE provider_id = ?`).run(id);
    this.db.prepare(`DELETE FROM providers WHERE id = ?`).run(id);
  }

  // --- Models ---
  createModel({ id, provider_id, model_id, display_name, capabilities_json = '{}', context_window = null, max_output_tokens = null }) {
    const mid = id || 'model_' + Math.random().toString(36).substring(2, 10);
    const now = Date.now();
    this.db.prepare(`INSERT INTO models (id,provider_id,model_id,display_name,capabilities_json,context_window,max_output_tokens,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(mid, provider_id, model_id, display_name || model_id, typeof capabilities_json === 'string' ? capabilities_json : JSON.stringify(capabilities_json), context_window, max_output_tokens, 1, now, now);
    return this.db.prepare(`SELECT * FROM models WHERE id = ?`).get(mid);
  }

  getModels(providerId) {
    return this.db.prepare(`SELECT * FROM models WHERE provider_id = ? ORDER BY created_at ASC`).all(providerId);
  }

  getAllModels() {
    return this.db.prepare(`SELECT * FROM models ORDER BY created_at ASC`).all();
  }

  updateModel(id, patch) {
    const cur = this.db.prepare(`SELECT * FROM models WHERE id = ?`).get(id);
    if (!cur) throw new Error('Model not found');
    const next = { ...cur, ...patch, updated_at: Date.now() };
    this.db.prepare(`UPDATE models SET model_id=?,display_name=?,capabilities_json=?,context_window=?,max_output_tokens=?,enabled=?,updated_at=? WHERE id=?`)
      .run(next.model_id, next.display_name, typeof next.capabilities_json === 'string' ? next.capabilities_json : JSON.stringify(next.capabilities_json), next.context_window, next.max_output_tokens, next.enabled ? 1 : 0, next.updated_at, id);
    return this.db.prepare(`SELECT * FROM models WHERE id = ?`).get(id);
  }

  deleteModel(id) {
    this.db.prepare(`DELETE FROM models WHERE id = ?`).run(id);
  }

  getSessionModelOverride(sessionId) {
    const s = this.getSession(sessionId);
    if (!s || !s.model_override_json) return null;
    try {
      return JSON.parse(s.model_override_json);
    } catch {
      return null;
    }
  }

  setSessionModelOverride(sessionId, override) {
    this.db.prepare(`UPDATE sessions SET model_override_json=?,updated_at=? WHERE id=?`)
      .run(override ? JSON.stringify(override) : null, Date.now(), sessionId);
    return this.getSessionModelOverride(sessionId);
  }

  close() {
    this.isClosed = true;
    this.db.close();
  }
}
