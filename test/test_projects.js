import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { AppDatabase } from '../server/db.js';
import { ToolRegistry } from '../server/tools.js';
import { AgentLoop } from '../server/agent_loop.js';
import { createApiServer } from '../server/api.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-projects-'));
fs.mkdirSync(path.join(temp, 'state'));
const dbPath = path.join(temp, 'state', 'test.db');
let db = new AppDatabase(dbPath);
const api = createApiServer({ db, agentLoop: new EventEmitter(), port: 0 });
try {
  const { port } = await api.listen(0);
  const base = `http://127.0.0.1:${port}/api`;
  const post = async (route, body, status = 201) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, status);
    return response.json();
  };
  const roots = ['A', 'B'].map(name => {
    const root = path.join(temp, name); fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'identity.txt'), name); return root;
  });
  const projects = [];
  for (const root of roots) projects.push(await post('/projects', { path: root }));
  assert.equal((await post('/projects', { path: roots[0] }, 200)).id, projects[0].id);
  await post('/projects', { path: 'relative' }, 400);
  await post('/projects', { path: path.join(temp, 'missing') }, 400);
  await post('/projects', { path: path.join(roots[0], 'identity.txt') }, 400);
  await post('/sessions', { projectId: 'unknown' }, 400);
  for (const [i, project] of projects.entries()) {
    await post('/sessions', { id: `session-${i}`, title: 'Manual project conversation', projectId: project.id });
    assert.equal(db.getSession(`session-${i}`).project_id, project.id);
  }
  const chosenModel = { providerId: 'configured-cloud-provider', modelId: 'chosen-model' };
  const savedModel = await fetch(base + '/sessions/session-0/model', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ override: chosenModel })
  });
  assert.equal(savedModel.status, 200);
  assert.deepEqual((await savedModel.json()).override, chosenModel);
  const anchor = db.addMessage('anchor', 'session-0', 'user', 'Question');
  const branch = await post('/sessions/branch', { sourceSessionId: 'session-0', anchorId: 'anchor' });
  assert.equal(branch.session.project_id, projects[0].id);
  const registry = new ToolRegistry(db, temp);
  const loop = new AgentLoop({ db, tools: registry, permissions: { evaluate: () => ({ action: 'ALLOW' }) }, skills: {}, llm: {
    streamChat: async ({ messages, onToolCall, onChunk }) => {
      if (!messages.some(m => m.content.includes('[TOOL_RESULT for'))) {
        onToolCall({ id: 'read', name: 'fs_read', arguments: { path: 'identity.txt' } });
      } else onChunk('Done');
      return { completed: true };
    }
  }});
  assert.deepEqual(loop.resolveModel(db.getSession('session-0'), db.getAgent('default-assistant')), chosenModel);
  // Inspect actual tool results, and interleave two project runs.
  const results = new Map();
  loop.on('event', event => {
    if (event.type === 'ToolCallCompleted') results.set(event.runId, event.payload.output);
  });
  await Promise.all([0, 1].map(i => loop.run({ runId: `run-${i}`, sessionId: `session-${i}`, prompt: 'Read identity' })));
  assert.equal(db.db.prepare('SELECT status FROM runs WHERE id = ?').get('run-0').status, 'completed');
  assert.equal(results.get('run-0').content, 'A');
  assert.equal(results.get('run-1').content, 'B');
  assert.equal(registry.workspaceRoot, temp);
  const scoped = registry.forWorkspace(roots[0]);
  assert.throws(() => scoped.resolveWorkspacePath('../B/identity.txt'), /outside workspace/);
  fs.symlinkSync(roots[1], path.join(roots[0], 'escape'));
  assert.throws(() => scoped.resolveWorkspacePath('escape/identity.txt'), /outside workspace/);
  await scoped.get('fs_write').execute({ path: 'new.txt', content: 'only A' });
  assert.equal(fs.readFileSync(path.join(roots[0], 'new.txt'), 'utf8'), 'only A');
  assert.equal(fs.existsSync(path.join(roots[1], 'new.txt')), false);
  assert.equal(scoped.describeRuntime().workspaceRoot, roots[0]);
  const hostScoped = new ToolRegistry(db, temp, { hostEnabled: true }).forWorkspace(roots[0]);
  const shell = await hostScoped.get('shell_host').execute({ command: process.platform === 'win32' ? 'Get-Content identity.txt' : 'cat identity.txt' }, { runId: 'host-root' });
  assert.equal(shell.stdout.trim(), 'A');
  if (process.platform === 'linux') {
    const isolated = await scoped.get('shell_exec').execute({ command: 'cat identity.txt' }, { runId: 'sandbox-root' });
    assert.equal(isolated.stdout, 'A');
  }
  fs.rmSync(roots[1], { recursive: true });
  await loop.run({ runId: 'missing-root', sessionId: 'session-1', prompt: 'Read identity' });
  assert.equal(db.db.prepare('SELECT status FROM runs WHERE id = ?').get('missing-root').status, 'failed');
  const patch = async (route, body, status = 200) => {
    const response = await fetch(base + route, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, status);
    return response.json();
  };
  await patch(`/projects/${projects[0].id}`, { name: '   ' }, 400);
  await patch(`/projects/${projects[0].id}`, { pinned: 'yes' }, 400);
  await patch(`/projects/${projects[0].id}`, { section: 123 }, 400);
  await patch('/projects/unknown', { name: 'Unknown' }, 404);
  const edited = await patch(`/projects/${projects[0].id}`, { name: '  Work project  ', pinned: true, section: '  Work  ' });
  assert.equal(edited.name, 'Work project');
  assert.equal(edited.pinned, 1);
  assert.equal(edited.section, 'Work');
  assert.equal(edited.path, roots[0]);
  assert.equal(db.getSession('session-0').project_name, 'Work project');
  await post(`/projects/${projects[0].id}/archive`, { archived: 'yes' }, 400);
  const archived = await post(`/projects/${projects[0].id}/archive`, { archived: true }, 200);
  assert.equal(archived.count, 2);
  assert.ok(db.getSession('session-0').archived_at);
  assert.ok(db.getSession(branch.session.id).archived_at);
  assert.equal(db.getSession('session-1').archived_at, null);
  assert.equal((await post(`/projects/${projects[0].id}/archive`, { archived: true }, 200)).count, 0);
  const fresh = await post('/sessions', { id: 'after-archive', projectId: projects[0].id });
  assert.equal(fresh.archived_at, null);
  await patch('/sessions/session-0/archive', { archived: false });
  assert.equal(db.getSession('session-0').archived_at, null);
  assert.ok(db.getSession(branch.session.id).archived_at);
  await patch('/sessions/missing/archive', { archived: false }, 404);
  await patch('/sessions/session-0/archive', { archived: 'no' }, 400);
  db.createRun('busy-remove', 'session-0');
  assert.equal((await fetch(base + `/projects/${projects[0].id}`, { method: 'DELETE' })).status, 409);
  assert.ok(db.getSession('session-0'));
  db.updateRunStatus('busy-remove', 'completed');
  db.saveMemory('project-memory', 'default-assistant', 'fact', 'old project', `project:${projects[0].id}`);
  db.setScopedPolicy(`project:${projects[0].id}`, 'fs_read:*', 'ALLOW');
  const remove = await fetch(base + `/projects/${projects[0].id}`, { method: 'DELETE' });
  assert.equal(remove.status, 200);
  assert.equal((await (await fetch(base + '/projects')).json()).length, 1);
  assert.equal(db.getSession('session-0'), undefined);
  assert.equal(db.getSession(branch.session.id), undefined);
  assert.equal(db.getSession('after-archive'), undefined);
  assert.equal(db.getMessages('session-0').length, 0);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM runs WHERE session_id = ?').get('session-0').n, 0);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM run_events WHERE run_id = ?').get('run-0').n, 0);
  assert.equal(db.getScopedPolicies(`project:${projects[0].id}`).length, 0);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM memories WHERE scope_id = ?').get(`project:${projects[0].id}`).n, 0);
  assert.ok(db.getSession('session-1'));
  assert.equal(fs.readFileSync(path.join(roots[0], 'identity.txt'), 'utf8'), 'A');
  assert.equal((await fetch(base + '/projects/unknown', { method: 'DELETE' })).status, 404);
  const restored = await post('/projects', { path: roots[0] });
  assert.notEqual(restored.id, projects[0].id);
  assert.equal(restored.pinned, 0);
  assert.equal(restored.section, null);
  assert.equal(db.getSessions().some(session => session.project_id === restored.id), false);
  assert.equal(db.getProjects().length, 2);
  // Old versions only hid projects. Reopening one must discard its old history too.
  db.createSession('legacy-hidden-chat', 'default-assistant', 'Old hidden history', restored.id);
  db.db.prepare('UPDATE projects SET removed_at = ? WHERE id = ?').run(Date.now(), restored.id);
  const newAgain = await post('/projects', { path: roots[0] });
  assert.notEqual(newAgain.id, restored.id);
  assert.equal(db.getSession('legacy-hidden-chat'), undefined);
  await api.close();
  db.close(); db = new AppDatabase(dbPath);
  assert.equal(db.getProjects().length, 2);
  assert.equal(db.getProjects(true).length, 2);
  assert.equal(db.getProject(projects[0].id), undefined);
  assert.equal(db.getSession('session-0'), undefined);
  assert.equal(db.getProject(newAgain.id).path, roots[0]);
  console.log('✓ Projects: API validation, deduplication, persistence, branches, concurrent roots, filesystem boundaries and missing roots');
} finally {
  await api.close(); db.close(); fs.rmSync(temp, { recursive: true, force: true });
}
