import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../server/db.js';
import { SecretsVault } from '../server/providers/secrets.js';
import { WebSearchService } from '../server/web_search.js';
import { ToolRegistry } from '../server/tools.js';
import { createApiServer } from '../server/api.js';
import { EventEmitter } from 'node:events';

const db = new AppDatabase(':memory:');
const vault = new SecretsVault();
let calls = [], mode = 'ok';
const mockFetch = async (url, options) => {
  calls.push({ url: String(url), options });
  if (mode === 'offline') throw new TypeError('fetch failed');
  if (mode === 'abort') return new Promise((resolve, reject) => { const fail = () => reject(new Error('aborted')); options.signal.addEventListener('abort', fail, { once: true }); if (options.signal.aborted) fail(); });
  if (mode === 'quota') return new Response('', { status: 429 });
  if (mode === 'forbidden') return new Response('', { status: 403 });
  if (mode === 'html') return new Response('<html>blocked</html>');
  if (mode === 'big') return new Response('x'.repeat(2 * 1024 * 1024 + 1));
  return Response.json(mode === 'empty' ? {} : {
    Heading: 'Source', AbstractText: 'Evidence', AbstractURL: 'https://example.org/article',
    RelatedTopics: [{ Text: 'Duplicate', FirstURL: 'https://example.org/article' },
      { Text: 'Bad', FirstURL: 'javascript:alert(1)' },
      { Topics: [{ Text: 'Nested', FirstURL: 'https://example.org/nested' }] }]
  });
};
const service = new WebSearchService(db, vault, { fetchImpl: mockFetch, timeoutMs: 25 });
assert.equal(service.publicConfig().provider, 'duckduckgo');
assert.throws(() => service.save({ provider: 'unknown' }), /không hợp lệ/);
assert.throws(() => service.save({ customUrl: 'https://example.org' }), /không hợp lệ/);
assert.deepEqual(service.save({ provider: 'duckduckgo' }), { provider: 'duckduckgo' });
const result = await service.search('hello');
assert.equal(result.resultsCount, 2); assert.equal(result.provider, 'duckduckgo');
assert.equal(result.limited, true);
assert.equal(new URL(calls.at(-1).url).hostname, 'api.duckduckgo.com');
await service.search('xin chào & test');
const searchUrl = new URL(calls.at(-1).url);
assert.equal(searchUrl.searchParams.get('q'), 'xin chào & test');
assert.equal(searchUrl.searchParams.get('format'), 'json');
assert(!calls.at(-1).options.headers?.Authorization);
for (const [value, message] of [['offline', /kết nối/], ['quota', /hạn mức/], ['forbidden', /từ chối/], ['html', /JSON/], ['big', /quá lớn/], ['abort', /thời gian/]]) {
  mode = value; await assert.rejects(service.search('hello'), message);
}
mode = 'empty'; assert.equal((await service.search('hello')).resultsCount, 0);
mode = 'ok';
const controller = new AbortController(); controller.abort(); mode = 'abort';
await assert.rejects(service.search('hello', { signal: controller.signal }), /hủy/);
mode = 'ok';
const restarted = new WebSearchService(db, vault, { fetchImpl: mockFetch });
assert.equal(restarted.publicConfig().provider, 'duckduckgo');
const tools = new ToolRegistry(db); tools.webSearch = restarted;
assert.equal((await tools.forWorkspace(process.cwd()).get('web_search').execute({ query: 'workspace' })).provider, 'duckduckgo');
assert.equal((await tools.forStandalone({ scopeId: 'standalone:test' }).get('web_search').execute({ query: 'standalone' })).provider, 'duckduckgo');

// Retired configuration is discarded and its secret is removed on restart.
db.db.exec('CREATE TABLE web_search_config (id INTEGER PRIMARY KEY, config_json TEXT NOT NULL)');
const legacyRef = vault.set('legacy-search', 'retired-secret');
db.db.prepare('INSERT INTO web_search_config VALUES (1, ?)').run(JSON.stringify({ provider: 'retired-provider', legacyKeyRef: legacyRef, legacyUrl: 'https://example.org' }));
const migrated = new WebSearchService(db, vault, { fetchImpl: mockFetch });
assert(!vault.has(legacyRef));
assert.deepEqual(migrated.publicConfig(), { provider: 'duckduckgo' });
assert.equal(db.db.prepare("SELECT name FROM sqlite_master WHERE name='web_search_config'").get(), undefined);
assert.equal((await migrated.search('after upgrade')).provider, 'duckduckgo');
const api = createApiServer({ db, tools, permissions: {}, skills: {}, llm: {}, agentLoop: new EventEmitter(), webSearch: migrated, authToken: 'test-token' });
try {
  const { port } = await api.listen(0);
  const base = `http://127.0.0.1:${port}/api/web-search`;
  assert.equal((await fetch(`${base}/config`)).status, 401);
  const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
  const rejected = await fetch(`${base}/config`, { method: 'PUT', headers, body: JSON.stringify({ provider: 'retired-provider' }) });
  assert.equal(rejected.status, 400);
  const tested = await fetch(`${base}/test`, { method: 'POST', headers, body: '{}' });
  const response = await tested.json();
  assert.equal(response.connected, true); assert.equal(response.resultsCount, 2);
  assert.deepEqual(await (await fetch(`${base}/config`, { headers })).json(), { provider: 'duckduckgo' });
} finally { await api.close(); db.close(); }
// Encrypted key survives service restart.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-search-vault-'));
try { const diskVault = new SecretsVault(dir); const ref = diskVault.set('search', 'persistent-key'); assert.equal(new SecretsVault(dir).get(ref), 'persistent-key'); }
finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('PASS web search: DuckDuckGo, retired config migration, encrypted keys, errors, cancellation, scoped tools and authenticated HTTP API');
