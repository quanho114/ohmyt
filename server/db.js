import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

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
      SELECT s.*, a.name as agent_name, a.avatar as agent_avatar,
      (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM sessions s
      JOIN agents a ON s.agent_id = a.id
      ORDER BY s.updated_at DESC
    `).all();
  }

  getSession(id) {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  }

  createSession(id, agentId, title) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO sessions (id, agent_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, agentId, title, now, now);
    return this.getSession(id);
  }

  updateSession(id, title) {
    this.db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
    return this.getSession(id);
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
  saveMemory(id, agentId, category, content) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO memories (id, agent_id, category, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, agentId, category, content, now);
    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
  }

  searchMemories(query, limit = 5) {
    // Sanitizing FTS query (keep alphanumeric and words)
    const cleanQuery = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    if (!cleanQuery) return [];

    const terms = cleanQuery.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const ftsPattern = terms.map(t => `"${t}"*`).join(' OR ');

    try {
      const rows = this.db.prepare(`
        SELECT m.* FROM memories m
        JOIN memories_fts f ON m.rowid = f.rowid
        WHERE memories_fts MATCH ?
        ORDER BY bm25(memories_fts) ASC
        LIMIT ?
      `).all(ftsPattern, limit);
      return rows;
    } catch {
      // Fallback to LIKE if FTS expression has syntax quirk
      const likePattern = `%${terms[0]}%`;
      return this.db.prepare(`
        SELECT * FROM memories WHERE content LIKE ? LIMIT ?
      `).all(likePattern, limit);
    }
  }

  getAllMemories(agentId = null) {
    if (agentId) {
      return this.db.prepare('SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC').all(agentId);
    }
    return this.db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all();
  }

  deleteMemory(id) {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  // --- Tool Policies ---
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
