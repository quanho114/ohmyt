import assert from 'node:assert/strict';
import { AppDatabase } from '../../server/db.js';
import { createApiServer } from '../../server/api.js';
import { EventEmitter } from 'node:events';

const db = new AppDatabase(':memory:');
const timestamp = value => Date.parse(value);
const now = timestamp('2026-10-02T12:00:00Z');
try {
  const empty = db.getStatistics('2026-10', 0, now);
  assert.equal(empty.totals.runs, 0);
  assert.equal(empty.activity.daily.length, 365);
  assert.equal(empty.monthly.daily.length, 31);
  assert.equal(empty.monthly.tokens, null);
  assert.equal(empty.monthly.monthCost, null);

  db.createSession('sess-stat', 'default-assistant', 'Câu hỏi đầu tiên');
  db.addMessage('msg-one', 'sess-stat', 'user', 'hello');
  db.addMessage('msg-two', 'sess-stat', 'agent', 'hi');
  db.createRun('run-one', 'sess-stat');
  db.db.prepare('UPDATE runs SET started_at = ?, ended_at = ?, status = ? WHERE id = ?')
    .run(timestamp('2026-10-01T23:30:00Z'), timestamp('2026-10-01T23:30:11Z'), 'completed', 'run-one');
  db.db.prepare('UPDATE messages SET created_at = ? WHERE id IN (?, ?)')
    .run(timestamp('2026-10-01T23:30:00Z'), 'msg-one', 'msg-two');
  const stats = db.getStatistics('2026-10', -120, now);
  assert.equal(stats.totals.messages, 2);
  assert.equal(stats.activity.longestRunMs, 11_000);
  assert.equal(stats.monthly.daily[1].runs, 1, 'UTC+2 activity belongs to Oct 2');
  assert.equal(stats.monthly.daily[1].messages, 2);
  assert.equal(stats.monthly.runs, 1);
  assert.equal(stats.rankings.agents[0].count, 1);
  assert.equal(stats.rankings.conversations[0].name, 'Câu hỏi đầu tiên');
  assert.equal(stats.rankings.models[0].name, 'qwen2.5:14b');
  assert.equal(stats.rankings.models[0].count, 1);
  assert.equal(db.getStatistics('2026-09', 0, now).monthly.runs, 0);
  assert.equal(db.getStatistics('2026-10', 0, now).monthly.daily[0].runs, 1);

  db.db.exec(`
    CREATE TABLE IF NOT EXISTS harness_events (
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      user_message_id TEXT
    )
  `);
  db.db.prepare(`
    INSERT INTO providers (id, name, type, enabled, created_at, updated_at)
    VALUES ('anthropic', 'Anthropic', 'anthropic', 1, ?, ?)
  `).run(now, now);
  db.db.prepare(`
    INSERT INTO models (id, provider_id, model_id, display_name, capabilities_json, enabled, created_at, updated_at)
    VALUES ('ag/claude-sonnet-4-6', 'anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', '{}', 1, ?, ?)
  `).run(now, now);
  db.db.prepare(`
    INSERT INTO harness_events (session_id, seq, event_id, version, type, payload, created_at)
    VALUES (?, 1, 'evt-1', 1, 'attempt/end', ?, ?)
  `).run(
    'sess-stat',
    JSON.stringify({
      turnId: 'run-one',
      purpose: 'main',
      usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
      accounting: { modelId: 'ag/claude-sonnet-4-6', providerId: 'anthropic', tokens: 3000 }
    }),
    timestamp('2026-10-02T10:00:00Z')
  );
  const withUsage = db.getStatistics('2026-10', 0, now);
  assert.equal(withUsage.rankings.models[0].name, 'Claude Sonnet 4.6');
  assert.equal(withUsage.rankings.models[0].count, 1);
  assert.equal(withUsage.totals.tokens, 3000);
  assert.equal(withUsage.monthly.tokens, 3000);
  assert.equal(withUsage.monthly.todayCost, 0.021);
  assert.equal(withUsage.monthly.monthCost, 0.021);
  const agentLoop = new EventEmitter();
  const api = createApiServer({ db, agentLoop, port: 0 });
  try {
    const { port } = await api.listen(0);
    const base = `http://127.0.0.1:${port}/api/statistics`;
    const good = await fetch(`${base}?month=2026-10&offset=-120`);
    assert.equal(good.status, 200);
    assert.equal((await good.json()).monthly.runs, 1);
    for (const bad of ['2026-13', '2026-00', '2026-10-01']) {
      assert.equal((await fetch(`${base}?month=${bad}`)).status, 400);
    }
    assert.equal((await fetch(`${base}?month=2026-10&offset=no`)).status, 400);
  } finally {
    await api.close();
  }

  db.deleteSession('sess-stat');
  const removed = db.getStatistics('2026-10', 0, now);
  assert.equal(removed.totals.runs, 0);
  assert.equal(removed.totals.messages, 0);
  console.log('Statistics: empty, timezone, monthly aggregation, rankings, endpoint and deletion passed.');
} finally {
  db.close();
}
