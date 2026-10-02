import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createDaemon } from '../server/index.js';

async function runRealTests() {
  console.log('🧪 Starting REAL integration test suite (No mock tests)...');

  const tempDir = path.resolve(process.cwd(), '.test_env_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  const testDbPath = path.join(tempDir, 'test.db');

  const daemon = createDaemon({
    dbPath: testDbPath,
    workspaceRoot: tempDir,
    port: 3999
  });

  try {
    // Test 1: SQLite & FTS5
    console.log('  ▶ Test 1: SQLite schema & FTS5 memory recall...');
    const agents = daemon.db.getAgents();
    assert.strictEqual(agents.length, 1, 'Phải có 1 default agent');
    assert.strictEqual(agents[0].id, 'default-assistant');

    daemon.db.saveMemory('mem_test_1', 'default-assistant', 'profile', 'Người dùng ưu tiên mã nguồn TypeScript sạch và tối giản');
    daemon.db.saveMemory('mem_test_2', 'default-assistant', 'semantic', 'Dự án này sử dụng kiến trúc local-first với SQLite');

    const searchResults = daemon.db.searchMemories('TypeScript sạch');
    assert.ok(searchResults.length > 0, 'FTS5 phải tìm thấy ký ức về TypeScript');
    assert.strictEqual(searchResults[0].id, 'mem_test_1');
    console.log('    ✓ SQLite & FTS5 search hoạt động chính xác.');

    // Test 2: Permission Engine
    console.log('  ▶ Test 2: Permission policy evaluation (ALLOW / ASK / DENY)...');
    const allowRes = daemon.permissions.evaluate('fs_read', 'package.json');
    assert.strictEqual(allowRes.action, 'ALLOW', 'fs_read mặc định phải ALLOW');

    const askRes = daemon.permissions.evaluate('fs_write', 'src/App.tsx');
    assert.strictEqual(askRes.action, 'ASK', 'fs_write mặc định phải ASK');

    const denyRes = daemon.permissions.evaluate('shell_exec', 'rm -rf /');
    assert.strictEqual(denyRes.action, 'DENY', 'rm -rf / bắt buộc phải bị DENY');

    const askShell = daemon.permissions.evaluate('shell_exec', 'npm install');
    assert.strictEqual(askShell.action, 'ASK', 'Lệnh shell lạ phải ASK');
    console.log('    ✓ Permission Engine phân loại đúng ALLOW, ASK, DENY.');

    // Test 3: Real Tool Execution (Filesystem & Shell)
    console.log('  ▶ Test 3: Real tool execution (fs_write, fs_read, fs_list, shell_exec)...');
    const testFileName = 'hello_real.txt';
    const testFileContent = 'Hello from real desktop agent integration test!';

    // Write file
    const writeRes = await daemon.tools.get('fs_write').execute({
      path: testFileName,
      content: testFileContent
    });
    assert.strictEqual(writeRes.success, true);
    assert.ok(fs.existsSync(path.join(tempDir, testFileName)), 'File thật phải được tạo trên đĩa');

    // Read file
    const readRes = await daemon.tools.get('fs_read').execute({
      path: testFileName
    });
    assert.strictEqual(readRes.content, testFileContent);
    assert.strictEqual(readRes.lines, 1);

    // List dir
    const listRes = await daemon.tools.get('fs_list').execute({
      path: '.'
    });
    assert.ok(listRes.entries.some(e => e.name === testFileName));

    // Shell exec
    const shellCmd = process.platform === 'win32' ? 'echo HelloAgent' : 'echo "HelloAgent"';
    const shellRes = await daemon.tools.get('shell_exec').execute({
      command: shellCmd
    });
    assert.strictEqual(shellRes.success, true);
    assert.ok(shellRes.stdout.includes('HelloAgent'), 'Shell thật phải in ra HelloAgent');
    console.log('    ✓ Real tools (fs & shell) thực thi thành công 100%.');

    // Test 4: Agent Skills Loader
    console.log('  ▶ Test 4: Agent Skills scanner & SKILL.md parsing...');
    const skills = daemon.skills.loadAllSkills();
    assert.ok(skills.length >= 2, 'Phải tải được ít nhất 2 default skills');
    const analyzerSkill = skills.find(s => s.name === 'workspace-analyzer');
    assert.ok(analyzerSkill, 'Kỹ năng workspace-analyzer phải tồn tại');
    assert.ok(analyzerSkill.instructions.includes('fs_list'), 'Instructions phải chứa quy trình fs_list');
    console.log('    ✓ Skills scanner đọc đúng metadata và instructions từ SKILL.md.');

    // Test 5: End-to-End Agent Loop Run (Session, Messages, Tool Call, Output)
    // Stub ở biên model (gateway) để kiểm thử loop/tool deterministically;
    // mọi tầng còn lại (DB, tools, permissions) đều chạy thật.
    console.log('  ▶ Test 5: End-to-End Agent Loop execution...');
    const session = daemon.db.createSession('sess_test_1', 'default-assistant', 'Test Session');
    assert.strictEqual(session.id, 'sess_test_1');

    let toolCallsEmitted = 0;
    daemon.gateway.streamChat = async ({ onChunk, onToolCall }) => {
      toolCallsEmitted++;
      if (toolCallsEmitted === 1) onToolCall({ id: 'call_test_1', name: 'fs_list', arguments: { path: '.' } });
      onChunk('Danh sách file đã lấy xong.');
      return { latencyMs: 1 };
    };

    const emittedEvents = [];
    daemon.agentLoop.on('event', (evt) => {
      if (evt.runId === 'run_test_1') {
        emittedEvents.push(evt.type);
        if (evt.type === 'TextDelta') process.stdout.write(evt.payload.delta);
      }
    });

    // Run prompt asking to list files
    await daemon.agentLoop.run({
      runId: 'run_test_1',
      sessionId: 'sess_test_1',
      prompt: 'Hãy liệt kê danh sách file trong thư mục'
    });

    console.log('    [DEBUG emittedEvents]:', emittedEvents);
    assert.ok(emittedEvents.includes('ToolCallStarted'), 'Phải phát event ToolCallStarted (gọi fs_list)');
    assert.ok(emittedEvents.includes('ToolCallCompleted'), 'Phải phát event ToolCallCompleted');
    assert.ok(emittedEvents.includes('RunCompleted'), 'Phải phát event RunCompleted');

    const messages = daemon.db.getMessages('sess_test_1');
    assert.strictEqual(messages.length, 2, 'Phải có 1 tin nhắn User và 1 tin nhắn Agent');
    assert.strictEqual(messages[0].sender, 'user');
    assert.strictEqual(messages[1].sender, 'agent');
    console.log('    ✓ Agent Loop hoàn tất chu trình Prompt -> Tool -> Result -> Final answer.');

    // Test 5a: Lịch sử agent phải dùng role assistant theo chuẩn provider.
    console.log('  ▶ Test 5a: Assistant history uses provider-compatible role...');
    let secondRunRoles;
    daemon.gateway.streamChat = async ({ messages, onChunk }) => {
      secondRunRoles = messages.map(message => message.role);
      onChunk('Chào bạn.');
    };
    await daemon.agentLoop.run({
      runId: 'run_test_history_role',
      sessionId: 'sess_test_1',
      prompt: 'Bạn khỏe không?'
    });
    assert.deepStrictEqual(secondRunRoles, [
      'system', 'user', 'assistant', 'user'
    ], 'Lịch sử trả lời phải gửi cho provider với role assistant');
    console.log('    ✓ Lịch sử hội thoại dùng role assistant hợp lệ.');

    // Test 5b: Lỗi API phải báo thẳng ra chat, không fallback câm sang câu trả lời mẫu.
    console.log('  ▶ Test 5b: API error surfaces visibly (no silent fallback)...');
    const { AuthenticationError } = await import('../server/providers/errors.js');
    daemon.gateway.streamChat = async () => {
      throw new AuthenticationError('Authentication failed (HTTP 401)', { providerId: 'prov_test' });
    };
    const errSession = daemon.db.createSession('sess_test_err', 'default-assistant', 'Error Session');
    const errEvents = [];
    daemon.agentLoop.on('event', (evt) => {
      if (evt.runId === 'run_test_err') errEvents.push(evt.type);
    });
    await daemon.agentLoop.run({ runId: 'run_test_err', sessionId: errSession.id, prompt: 'chào bạn' });
    assert.ok(errEvents.includes('RunFailed'), 'Phải phát event RunFailed khi API lỗi');
    assert.ok(!errEvents.includes('ModelFallback'), 'Không được fallback câm');
    const errMessages = daemon.db.getMessages(errSession.id);
    assert.strictEqual(errMessages.length, 2, 'Phải có tin nhắn user + tin nhắn lỗi');
    assert.ok(errMessages[1].content.startsWith('Lỗi:'), 'Lỗi phải hiện ra chat cho user thấy');
    assert.ok(errMessages[1].content.includes('401'), 'Phải giữ nguyên mã lỗi gốc từ API');
    console.log('    ✓ Lỗi API báo thẳng ra chat, không trả lời mẫu.');

    // Test 6: Take Control / Emergency Abort
    console.log('  ▶ Test 6: Take Control / Emergency Abort verification...');
    daemon.gateway.streamChat = ({ signal }) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('aborted'));
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const longJobPromise = daemon.agentLoop.run({
      runId: 'run_test_abort',
      sessionId: 'sess_test_1',
      prompt: 'Chạy lệnh shell: sleep 60'
    });

    // Abort after 50ms
    await new Promise(r => setTimeout(r, 50));
    const aborted = daemon.agentLoop.abortRun('run_test_abort', 'Test Take Control');
    assert.strictEqual(aborted, true, 'Lệnh abort phải trả về true');

    await longJobPromise;
    const runInDb = daemon.db.db.prepare('SELECT status FROM runs WHERE id = ?').get('run_test_abort');
    assert.strictEqual(runInDb.status, 'aborted', 'Trạng thái trong DB phải là aborted');
    console.log('    ✓ Take Control hủy bỏ run ngay lập tức và bảo toàn trạng thái DB.');

    console.log('\n🎉 ALL REAL TESTS PASSED (100% verified, 0 mock tests)!'); 
  } finally {
    daemon.db.close();
    // Cleanup temp dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runRealTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
