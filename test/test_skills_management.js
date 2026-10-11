import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SkillManager, isPrivateIp, validateRemoteUrl, parseGitHubRepo } from '../server/skills.js';
import { createDaemon } from '../server/index.js';
import { AgentLoop } from '../server/agent_loop.js';

console.log('🧪 Starting Skill Management Comprehensive Test Suite...');

// --- Helper: Build a minimal zip buffer in-memory with local file header ---
function createZipBuffer(filename, contentString) {
  const contentBuf = Buffer.from(contentString, 'utf8');
  const compressed = zlib.deflateRawSync(contentBuf);
  const nameBuf = Buffer.from(filename, 'utf8');

  // Local File Header (30 bytes + name length + extra length)
  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0); // signature
  lfh.writeUInt16LE(20, 4); // version needed
  lfh.writeUInt16LE(0, 6); // flags
  lfh.writeUInt16LE(8, 8); // compression: Deflate
  lfh.writeUInt16LE(0, 10); // mod time
  lfh.writeUInt16LE(0, 12); // mod date
  lfh.writeUInt32LE(0, 14); // crc32 placeholder
  lfh.writeUInt32LE(compressed.length, 18); // compressed size
  lfh.writeUInt32LE(contentBuf.length, 22); // uncompressed size
  lfh.writeUInt16LE(nameBuf.length, 26); // filename length
  lfh.writeUInt16LE(0, 28); // extra field length

  const localFileRecord = Buffer.concat([lfh, nameBuf, compressed]);

  // Central Directory Record (46 bytes + name length)
  const cdfh = Buffer.alloc(46);
  cdfh.writeUInt32LE(0x02014b50, 0);
  cdfh.writeUInt16LE(20, 4);
  cdfh.writeUInt16LE(20, 6);
  cdfh.writeUInt16LE(0, 8);
  cdfh.writeUInt16LE(8, 10); // Deflate
  cdfh.writeUInt16LE(0, 12);
  cdfh.writeUInt16LE(0, 14);
  cdfh.writeUInt32LE(0, 16);
  cdfh.writeUInt32LE(compressed.length, 20);
  cdfh.writeUInt32LE(contentBuf.length, 24);
  cdfh.writeUInt16LE(nameBuf.length, 28);
  cdfh.writeUInt16LE(0, 30);
  cdfh.writeUInt16LE(0, 32);
  cdfh.writeUInt16LE(0, 34);
  cdfh.writeUInt16LE(0, 36);
  cdfh.writeUInt32LE(0, 38);
  cdfh.writeUInt32LE(0, 42); // local header offset

  const cdRecord = Buffer.concat([cdfh, nameBuf]);

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // total entries on disk
  eocd.writeUInt16LE(1, 10); // total entries in cd
  eocd.writeUInt32LE(cdRecord.length, 12); // size of cd
  eocd.writeUInt32LE(localFileRecord.length, 16); // offset of start of cd
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localFileRecord, cdRecord, eocd]);
}

// -------------------------------------------------------------
// Test 1: SSRF Validation & Private IP Denylist
// -------------------------------------------------------------
console.log('  1. Checking SSRF Protection & IP filtering...');
assert.equal(isPrivateIp('127.0.0.1'), true, 'Should block IPv4 loopback');
assert.equal(isPrivateIp('10.0.4.15'), true, 'Should block 10.0.0.0/8');
assert.equal(isPrivateIp('172.16.5.1'), true, 'Should block 172.16.0.0/12');
assert.equal(isPrivateIp('192.168.1.100'), true, 'Should block 192.168.0.0/16');
assert.equal(isPrivateIp('169.254.169.254'), true, 'Should block link-local/cloud metadata');
assert.equal(isPrivateIp('0.0.0.0'), true, 'Should block 0.0.0.0/8');
assert.equal(isPrivateIp('::1'), true, 'Should block IPv6 loopback');
assert.equal(isPrivateIp('fe80::1'), true, 'Should block IPv6 link-local');
assert.equal(isPrivateIp('fc00::1'), true, 'Should block IPv6 unique local');
assert.equal(isPrivateIp('8.8.8.8'), false, 'Should allow public IP');
assert.equal(isPrivateIp('1.1.1.1'), false, 'Should allow public IP');

await assert.rejects(async () => {
  await validateRemoteUrl('http://127.0.0.1/admin');
}, /private or loopback/i, 'Should reject loopback URL');

await assert.rejects(async () => {
  await validateRemoteUrl('http://169.254.169.254/latest/meta-data');
}, /private or loopback/i, 'Should reject AWS metadata URL');

await assert.rejects(async () => {
  await validateRemoteUrl('ftp://example.com/file');
}, /Invalid protocol/i, 'Should reject non-http/https protocol');

// -------------------------------------------------------------
// Test 2: GitHub URL Parser
// -------------------------------------------------------------
console.log('  2. Checking GitHub repository URL parser...');
const gh1 = parseGitHubRepo('lobehub/lobe-chat');
assert.equal(gh1.owner, 'lobehub');
assert.equal(gh1.repo, 'lobe-chat');

const gh2 = parseGitHubRepo('https://github.com/ant-design/ant-design.git');
assert.equal(gh2.owner, 'ant-design');
assert.equal(gh2.repo, 'ant-design');

assert.throws(() => parseGitHubRepo('invalid-repo-name'), /Invalid GitHub repository/i);

// -------------------------------------------------------------
// Test 3: SkillManager Core Lifecycle & Builtin Guards
// -------------------------------------------------------------
console.log('  3. Checking SkillManager Core Lifecycle & Builtin Guards...');
const tempTestDir = path.resolve(process.cwd(), '.test_skills_env_' + Date.now());
fs.mkdirSync(tempTestDir, { recursive: true });

try {
  const manager = new SkillManager(tempTestDir);

  // Default skills initialization
  const initialSkills = manager.loadAllSkills();
  assert.ok(initialSkills.length >= 2, 'Should initialize builtin skills');
  const workspaceAnalyzer = manager.getSkill('workspace-analyzer');
  assert.ok(workspaceAnalyzer, 'workspace-analyzer must exist');
  assert.equal(workspaceAnalyzer.builtin, true);
  assert.equal(workspaceAnalyzer.enabled, true);

  const safeTerminal = manager.getSkill('safe-terminal');
  assert.ok(safeTerminal, 'safe-terminal must exist');
  assert.equal(safeTerminal.builtin, true);

  // Builtin protection
  assert.throws(() => {
    manager.deleteSkill('workspace-analyzer');
  }, /Cannot delete built-in system skill/i, 'Should prevent deleting builtin skill');

  // Create custom skill
  const created = manager.createSkill({
    id: 'custom-linter',
    name: 'Custom Linter',
    description: 'Tự động kiểm tra cú pháp và định dạng mã nguồn',
    version: '1.0.0',
    author: 'tester',
    icon: 'FileCode',
    requiredTools: ['fs_read'],
    instructions: '# Linter Instructions\nKiểm tra mã nguồn cẩn thận.'
  });

  assert.equal(created.id, 'custom-linter');
  assert.equal(created.builtin, false);
  assert.equal(created.enabled, true);

  // Path Traversal & Invalid ID check
  assert.throws(() => {
    manager.createSkill({ id: '../malicious', instructions: 'hacked' });
  }, /Invalid skill ID/i, 'Should reject directory traversal ID');

  assert.throws(() => {
    manager.createSkill({ id: 'bad@id', instructions: 'bad' });
  }, /Invalid skill ID/i, 'Should reject special chars in ID');

  // Update / Patch status
  const patched = manager.updateSkill('custom-linter', { enabled: false });
  assert.equal(patched.enabled, false);

  // Verify persistence on disk
  const reloaded = manager.getSkill('custom-linter');
  assert.equal(reloaded.enabled, false);
  assert.ok(reloaded.instructions.includes('Linter Instructions'));

  // Delete custom skill
  const deleted = manager.deleteSkill('custom-linter');
  assert.equal(deleted, true);
  assert.equal(manager.getSkill('custom-linter'), null);

  // -------------------------------------------------------------
  // Test 4: Zip Extraction Pure Node.js
  // -------------------------------------------------------------
  console.log('  4. Checking zero-dependency Zip archive decompression...');
  const sampleSkillMd = `---
name: "zipped-skill"
description: "Kỹ năng được giải nén từ file zip"
version: "2.1.0"
required_tools: ["fs_list"]
author: "archiver"
---
# Workflow from Zip
1. Chạy tiến trình.`;

  const zipBuf = createZipBuffer('SKILL.md', sampleSkillMd);
  const installedFromZip = manager.installFromZipBuffer(zipBuf);
  assert.equal(installedFromZip.name, 'zipped-skill');
  assert.equal(installedFromZip.version, '2.1.0');
  assert.ok(installedFromZip.instructions.includes('Workflow from Zip'));

  // Clean up zipped skill
  manager.deleteSkill(installedFromZip.id);

  // -------------------------------------------------------------
  // Test 5: AgentLoop Context Injection Filtering
  // -------------------------------------------------------------
  console.log('  5. Checking AgentLoop active skills prompt filtering...');
  const agentLoop = new AgentLoop({
    tools: { getDefinitions: () => [] },
    skills: manager
  });

  // Enable a custom skill and disable another
  manager.createSkill({
    id: 'active-skill',
    name: 'Active Skill',
    description: 'Kỹ năng hoạt động',
    instructions: 'ACTIVE_PROMPT_KEYWORD',
    enabled: true
  });

  manager.createSkill({
    id: 'disabled-skill',
    name: 'Disabled Skill',
    description: 'Kỹ năng bị tắt',
    instructions: 'DISABLED_PROMPT_KEYWORD',
    enabled: false
  });

  const systemPrompt = agentLoop.buildSystemPrompt('You are ohmyt.');
  assert.ok(systemPrompt.includes('ACTIVE_PROMPT_KEYWORD'), 'Active skill instructions must be in system prompt');
  assert.ok(!systemPrompt.includes('DISABLED_PROMPT_KEYWORD'), 'Disabled skill instructions must NOT be in system prompt');

  // Clean up
  manager.deleteSkill('active-skill');
  manager.deleteSkill('disabled-skill');

  // -------------------------------------------------------------
  // Test 6: HTTP REST API Endpoints with Daemon
  // -------------------------------------------------------------
  console.log('  6. Checking HTTP REST API endpoints in Daemon...');
  const testDbPath = path.join(tempTestDir, 'test_skills.db');
  const port = 0;

  const daemon = createDaemon({
    dbPath: testDbPath,
    workspaceRoot: tempTestDir,
    port
  });
  const address = await daemon.start();

  const BASE_URL = `http://127.0.0.1:${address.port}`;

  function fetchJson(endpoint, options = {}) {
    const url = new URL(endpoint, BASE_URL);
    return new Promise((resolve, reject) => {
      const req = http.request(url, {
        ...options,
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'close',
          ...options.headers
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, text: body });
          }
        });
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  // GET /api/skills
  const getRes = await fetchJson('/api/skills');
  assert.equal(getRes.status, 200);
  assert.ok(Array.isArray(getRes.data));
  assert.ok(getRes.data.some(s => s.id === 'workspace-analyzer'));

  // POST /api/skills (create)
  const postRes = await fetchJson('/api/skills', {
    method: 'POST',
    body: JSON.stringify({
      id: 'api-skill',
      name: 'API Skill',
      description: 'Tạo qua REST API',
      version: '1.0.0',
      instructions: '# Test REST API'
    })
  });
  assert.equal(postRes.status, 201);
  assert.equal(postRes.data.id, 'api-skill');

  // PATCH /api/skills/api-skill (toggle status)
  const patchRes = await fetchJson('/api/skills/api-skill', {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false })
  });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.data.enabled, false);

  // DELETE /api/skills/workspace-analyzer (should be blocked with 403)
  const delBuiltinRes = await fetchJson('/api/skills/workspace-analyzer', {
    method: 'DELETE'
  });
  assert.equal(delBuiltinRes.status, 403, 'Deleting builtin skill must return 403 Forbidden');

  // DELETE /api/skills/api-skill (custom skill should be allowed)
  const delCustomRes = await fetchJson('/api/skills/api-skill', {
    method: 'DELETE'
  });
  assert.equal(delCustomRes.status, 200);
  assert.equal(delCustomRes.data.success, true);

  // POST /api/skills/import-url SSRF block test
  const ssrfRes = await fetchJson('/api/skills/import-url', {
    method: 'POST',
    body: JSON.stringify({ url: 'http://127.0.0.1:8080/SKILL.md' })
  });
  assert.equal(ssrfRes.status, 400);
  assert.ok(ssrfRes.data.error.includes('SSRF') || ssrfRes.data.error.includes('private'));

  // POST /api/skills/upload with plain Markdown
  const uploadRes = await fetchJson('/api/skills/upload', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'uploaded-skill.md',
      content: sampleSkillMd,
      isBase64: false
    })
  });
  assert.equal(uploadRes.status, 201);
  assert.equal(uploadRes.data.name, 'zipped-skill');

  // Clean up uploaded skill
  await fetchJson(`/api/skills/${uploadRes.data.id}`, { method: 'DELETE' });

} finally {
  try {
    daemon?.apiServer?.server?.closeAllConnections?.();
    await daemon?.stop?.();
  } catch {}
  // Clean up test temp files
  try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  } catch {}
}

// -------------------------------------------------------------
// Test 7: Frontend Component Static Rendering (SSR) Check
// -------------------------------------------------------------
console.log('  7. Checking Frontend Component Static Rendering (Vite SSR)...');
const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
try {
  const { normalizeAppearance } = await vite.ssrLoadModule('/src/appearance.ts');
  const { SkillMarkdownViewer } = await vite.ssrLoadModule('/src/components/SkillMarkdownViewer.tsx');
  const { SkillSettings } = await vite.ssrLoadModule('/src/components/SkillSettings.tsx');

  const appearance = normalizeAppearance({});

  // Render SkillMarkdownViewer
  const testMarkdown = `# Tiêu đề Kỹ năng
- Bước 1: Chuẩn bị
- Bước 2: \`thực hiện\`
> Chú ý quan trọng`;

  const mdHtml = renderToStaticMarkup(React.createElement(SkillMarkdownViewer, {
    markdown: testMarkdown,
    appearance,
    activeTheme: 'dark'
  }));

  assert.ok(mdHtml.includes('Tiêu đề Kỹ năng'));
  assert.ok(mdHtml.includes('thực hiện'));
  assert.ok(mdHtml.includes('Chú ý quan trọng'));

  // Render SkillSettings
  const mockSkills = [
    {
      id: 'workspace-analyzer',
      name: 'Phân tích Không gian làm việc',
      description: 'Kiểm tra tệp tin',
      version: '1.0.0',
      requiredTools: ['fs_list', 'fs_read'],
      instructions: '# Workspace Analyzer',
      enabled: true,
      builtin: true,
      icon: 'Cpu'
    }
  ];

  const settingsHtml = renderToStaticMarkup(React.createElement(SkillSettings, {
    skills: mockSkills,
    onRefresh: () => {},
    locale: 'vi',
    appearance,
    activeTheme: 'dark'
  }));

  assert.ok(settingsHtml.includes('Kỹ năng'));
  assert.ok(settingsHtml.includes('Phân tích Không gian làm việc'));
  assert.ok(settingsHtml.includes('Kỹ năng tích hợp sẵn') || settingsHtml.includes('hệ thống'));
  assert.ok(settingsHtml.includes('Kho kỹ năng'));

} finally {
  await vite.close();
}

console.log('✅ ALL Skill Management tests passed successfully with 100% assertions!');
process.exit(0);
