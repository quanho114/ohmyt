import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createDaemon } from '../server/index.js';
import { LLMClient } from '../server/llm.js';

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
    console.log('  ▶ Offline model providers never synthesize replies or tool calls...');
    const closedEndpoint = http.createServer();
    await new Promise(resolve => closedEndpoint.listen(0, '127.0.0.1', resolve));
    const unavailablePort = closedEndpoint.address().port;
    await new Promise(resolve => closedEndpoint.close(resolve));
    const offlineClient = new LLMClient({ provider: 'openai', endpoint: `http://127.0.0.1:${unavailablePort}`, model: 'offline-test' });
    let offlineChunks = 0;
    let offlineToolCalls = 0;
    await assert.rejects(
      offlineClient.streamChat({
        messages: [{ role: 'user', content: 'List files and report.' }],
        tools: [],
        onChunk: () => { offlineChunks++; },
        onToolCall: () => { offlineToolCalls++; }
      }),
      error => error?.code === 'UNREACHABLE'
    );
    assert.strictEqual(offlineChunks, 0);
    assert.strictEqual(offlineToolCalls, 0);
    console.log('    ✓ API outage is an explicit failure with no synthesized model content or actions.');

    // Test 1: SQLite & FTS5
    console.log('  ▶ Test 1: SQLite schema & FTS5 memory recall...');
    const agents = daemon.db.getAgents();
    assert.strictEqual(agents.length, 1, 'Phải có 1 default agent');
    assert.strictEqual(agents[0].id, 'default-assistant');

    const pinnedAgent = daemon.db.upsertAgent({
      id: 'agent_model_pin_test',
      name: 'Pinned model test',
      avatar: 'PM',
      system_prompt: 'Pinned model test agent',
      model_provider: 'selected-api',
      model_name: 'selected-api-model-v1',
      temperature: 0.7
    });
    const pinnedSession = daemon.db.createSession('sess_model_pin_test', pinnedAgent.id, 'Pinned model');
    assert.deepStrictEqual(daemon.agentLoop.resolveModel(pinnedSession, pinnedAgent), {
      providerId: 'selected-api',
      modelId: 'selected-api-model-v1'
    }, 'Missing session override must not reroute the agent-pinned provider');
    const otherAgent = daemon.db.upsertAgent({
      id: 'agent_memory_scope_test',
      name: 'Scoped Memory Test',
      avatar: 'SM',
      system_prompt: 'Scoped test agent',
      model_provider: 'ollama',
      model_name: 'qwen2.5:14b',
      temperature: 0.7
    });
    daemon.db.saveMemory('mem_scope_default', 'default-assistant', 'semantic', 'scopeprobe only_default_account');
    daemon.db.saveMemory('mem_scope_other', otherAgent.id, 'semantic', 'scopeprobe other_account_secret');
    const scopedMemoryPrompt = daemon.agentLoop.buildSystemPrompt(daemon.db.getAgent('default-assistant'), 'scopeprobe');
    assert.ok(scopedMemoryPrompt.includes('only_default_account'));
    assert.ok(!scopedMemoryPrompt.includes('other_account_secret'), 'Context must not include another agent memory');
    const scopedMemorySearch = await daemon.tools.get('memory_search').execute({ query: 'scopeprobe' }, { agentId: 'default-assistant' });
    assert.deepStrictEqual(scopedMemorySearch.memories.map(memory => memory.id), ['mem_scope_default']);
    console.log('    ✓ Memory context and tool retrieval stay within the active agent scope.');

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

    // Test 3a: shell_exec stays inside a rootless Linux project sandbox.
    console.log('  ▶ Test 3a: project sandbox file, network, cwd and cleanup boundaries...');
    const externalSentinel = path.join('/tmp', `ohmyt-host-sentinel-${process.pid}`);
    fs.writeFileSync(externalSentinel, 'host-private-canary');
    let receiverCount = 0;
    const receiver = http.createServer((_req, res) => { receiverCount++; res.end('unexpected'); });
    await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
    try {
      const readOutside = await daemon.tools.get('shell_exec').execute({ command: `cat ${externalSentinel}`, cwd: '.' });
      assert.notStrictEqual(readOutside.exitCode, 0, 'Host /tmp sentinel must be hidden');
      assert.strictEqual(readOutside.stdout, '', 'Host sentinel content must not enter tool output');

      const writeOutside = await daemon.tools.get('shell_exec').execute({ command: `printf changed > ${externalSentinel}`, cwd: '.' });
      assert.strictEqual(writeOutside.success, true, 'Sandbox /tmp is writable to a command');
      assert.strictEqual(fs.readFileSync(externalSentinel, 'utf8'), 'host-private-canary', 'Sandbox tmp write must not change host tmp');

      await assert.rejects(daemon.tools.get('fs_read').execute({ path: externalSentinel }), /outside workspace/);
      await assert.rejects(daemon.tools.get('fs_write').execute({ path: externalSentinel, content: 'overwritten' }), /outside workspace/);
      assert.strictEqual(fs.readFileSync(externalSentinel, 'utf8'), 'host-private-canary', 'Filesystem tools must not read/write outside workspace');
      const symlinkPath = path.join(tempDir, 'external-link.txt');
      fs.symlinkSync(externalSentinel, symlinkPath);
      await assert.rejects(daemon.tools.get('fs_read').execute({ path: symlinkPath }), /outside workspace/);
      await assert.rejects(daemon.tools.get('fs_write').execute({ path: symlinkPath, content: 'overwritten through symlink' }), /outside workspace/);
      assert.strictEqual(fs.readFileSync(externalSentinel, 'utf8'), 'host-private-canary', 'Static symlink escape must not mutate the target');
      await daemon.tools.get('fs_write').execute({ path: 'hardlink-source.txt', content: 'preserve original inode' });
      fs.linkSync(path.join(tempDir, 'hardlink-source.txt'), path.join(tempDir, 'hardlink-alias.txt'));
      await assert.rejects(daemon.tools.get('fs_read').execute({ path: 'hardlink-alias.txt' }), /Hard-linked files/);
      await assert.rejects(daemon.tools.get('fs_write').execute({ path: 'hardlink-alias.txt', content: 'must not overwrite' }), /Hard-linked files/);
      assert.strictEqual(fs.readFileSync(path.join(tempDir, 'hardlink-source.txt'), 'utf8'), 'preserve original inode');
      await assert.rejects(
        daemon.tools.get('shell_exec').execute({ command: 'pwd', cwd: path.dirname(tempDir) }),
        /nằm ngoài workspace/
      );

      const receiverPort = receiver.address().port;
      const networkProbe = await daemon.tools.get('shell_exec').execute({
        command: `node -e "fetch('http://127.0.0.1:${receiverPort}').then(()=>process.exit(0),()=>process.exit(17))"`,
        cwd: '.'
      });
      assert.strictEqual(networkProbe.exitCode, 17, 'Sandbox process cannot reach the host loopback receiver');
      assert.strictEqual(receiverCount, 0, 'Denied request must not reach the real receiver');

      const cleanupState = 'sandbox-cleanup-state.txt';
      const cleanupRun = 'run_sandbox_cleanup_probe';
      const cleanupPromise = daemon.tools.get('shell_exec').execute({
        command: `node -e "const fs=require('node:fs');fs.writeFileSync('${cleanupState}','started');setTimeout(()=>fs.writeFileSync('${cleanupState}','late'),3000)"`,
        timeout: 10000
      }, { runId: cleanupRun });
      for (let attempt = 0; attempt < 200 && !fs.existsSync(path.join(tempDir, cleanupState)); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(fs.existsSync(path.join(tempDir, cleanupState)), 'Descendant process reached the sandbox workspace before cancellation');
      assert.strictEqual(daemon.tools.killProcessesForRun(cleanupRun), true);
      const cleanupResult = await cleanupPromise;
      assert.strictEqual(cleanupResult.signal, 'SIGKILL', 'Cancellation waits for the sandbox supervisor to exit');
      assert.strictEqual(cleanupResult.success, false, 'Killed commands must not report success');
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.strictEqual(fs.readFileSync(path.join(tempDir, cleanupState), 'utf8'), 'started', 'Killing the sandbox parent must stop descendants before their later write');
    } finally {
      await new Promise(resolve => receiver.close(resolve));
      try { fs.unlinkSync(externalSentinel); } catch {}
    }
    console.log('    ✓ Workspace write succeeds; host data, network and out-of-root cwd stay blocked; cancellation stops descendants.');

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
      return { completed: true, finishReason: 'stop', latencyMs: 1 };
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
      return { completed: true, finishReason: 'stop' };
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
    // Test 5c: Reaching the tool-turn bound without a final response is not success.
    const boundedSession = daemon.db.createSession('sess_test_bounded', 'default-assistant', 'Bounded Loop');
    let boundedCalls = 0;
    daemon.gateway.streamChat = async ({ onToolCall }) => {
      boundedCalls++;
      onToolCall({ id: `call_bounded_${boundedCalls}`, name: 'fs_list', arguments: { path: '.' } });
      return { completed: true, finishReason: 'tool_calls' };
    };
    const boundedEvents = [];
    daemon.agentLoop.on('event', evt => {
      if (evt.runId === 'run_test_bounded') boundedEvents.push(evt.type);
    });
    await daemon.agentLoop.run({ runId: 'run_test_bounded', sessionId: boundedSession.id, prompt: 'List files.' });
    assert.strictEqual(boundedCalls, 5, 'The configured five-turn bound is enforced');
    assert.ok(boundedEvents.includes('RunFailed'), 'A run with no final provider response must fail');
    assert.ok(!boundedEvents.includes('RunCompleted'), 'The turn bound must not synthesize completion');
    assert.strictEqual(daemon.db.db.prepare('SELECT status FROM runs WHERE id = ?').get('run_test_bounded').status, 'failed');
    console.log('    ✓ Exhausting the model-turn bound does not mark the run complete.');

    // Test 5d: A denied required tool call is not overwritten by model final prose.
    const deniedSession = daemon.db.createSession('sess_test_denied_final', 'default-assistant', 'Denied Tool');
    daemon.db.setPolicy('fs_read:*', 'DENY');
    daemon.gateway.streamChat = async ({ onChunk, onToolCall }) => {
      onToolCall({ id: 'call_denied_final', name: 'fs_read', arguments: { path: 'hello_real.txt' } });
      onChunk('Đã đọc file và hoàn tất.');
      return { completed: true, finishReason: 'tool_calls' };
    };
    const deniedEvents = [];
    daemon.agentLoop.on('event', evt => {
      if (evt.runId === 'run_test_denied_final') deniedEvents.push(evt.type);
    });
    await daemon.agentLoop.run({ runId: 'run_test_denied_final', sessionId: deniedSession.id, prompt: 'Read the file.' });
    assert.ok(deniedEvents.includes('RunFailed'), 'Denied required action must not become success from prose');
    assert.ok(!deniedEvents.includes('RunCompleted'));
    assert.strictEqual(daemon.db.db.prepare('SELECT status FROM runs WHERE id = ?').get('run_test_denied_final').status, 'failed');
    daemon.db.setPolicy('fs_read:*', 'ALLOW');
    console.log('    ✓ A denied required tool action cannot be overridden by final model prose.');

    // Test 5f: A real nonzero process exit is not a successful tool observation.
    const failedCommandSession = daemon.db.createSession('sess_test_failed_command', 'default-assistant', 'Failed command');
    daemon.db.setPolicy('shell_exec:*', 'ALLOW');
    let failedCommandCalls = 0;
    daemon.gateway.streamChat = async ({ onChunk, onToolCall }) => {
      failedCommandCalls++;
      if (failedCommandCalls === 1) {
        onToolCall({ id: 'call_failed_command', name: 'shell_exec', arguments: { command: 'exit 23', cwd: '.' } });
        return { completed: true, finishReason: 'tool_calls' };
      }
      onChunk('The requested check completed.');
      return { completed: true, finishReason: 'stop' };
    };
    const failedCommandEvents = [];
    daemon.agentLoop.on('event', evt => {
      if (evt.runId === 'run_test_failed_command') failedCommandEvents.push(evt);
    });
    await daemon.agentLoop.run({ runId: 'run_test_failed_command', sessionId: failedCommandSession.id, prompt: 'Run the check.' });
    const failedTool = failedCommandEvents.find(evt => evt.type === 'ToolCallCompleted');
    assert.strictEqual(failedTool.payload.success, false, 'A nonzero command exit is an unsuccessful tool observation');
    assert.strictEqual(failedTool.payload.output.exitCode, 23, 'The real command exit code remains observable');
    assert.ok(failedCommandEvents.some(evt => evt.type === 'RunFailed'));
    assert.ok(!failedCommandEvents.some(evt => evt.type === 'RunCompleted'));
    daemon.db.setPolicy('shell_exec:*', 'ASK');

    // Test 5e: Validate every call in a response batch before any filesystem effect.
    const batchSession = daemon.db.createSession('sess_test_invalid_tool_batch', 'default-assistant', 'Invalid Tool Batch');
    await daemon.tools.get('fs_write').execute({ path: 'first_batch.txt', content: 'original first' });
    await daemon.tools.get('fs_write').execute({ path: 'second_batch.txt', content: 'original second' });
    daemon.db.setPolicy('fs_write:*', 'ALLOW');
    daemon.gateway.streamChat = async ({ onChunk, onToolCall }) => {
      onToolCall({ id: 'call_batch_valid', name: 'fs_write', arguments: { path: 'first_batch.txt', content: 'mutated first' } });
      onToolCall({ id: 'call_batch_invalid', name: 'fs_write', arguments: { path: 'second_batch.txt' } });
      onChunk('Cả hai tệp đã được cập nhật.');
      return { completed: true, finishReason: 'tool_calls' };
    };
    const batchEvents = [];
    daemon.agentLoop.on('event', evt => {
      if (evt.runId === 'run_test_invalid_tool_batch') batchEvents.push(evt.type);
    });
    await daemon.agentLoop.run({ runId: 'run_test_invalid_tool_batch', sessionId: batchSession.id, prompt: 'Update both files.' });
    assert.ok(batchEvents.includes('RunFailed'), 'Malformed call batch must fail');
    assert.ok(!batchEvents.includes('RunCompleted'));
    assert.ok(!batchEvents.includes('ToolCallStarted'), 'No member of an invalid batch may be dispatched');
    assert.equal((await daemon.tools.get('fs_read').execute({ path: 'first_batch.txt' })).content, 'original first');
    assert.equal((await daemon.tools.get('fs_read').execute({ path: 'second_batch.txt' })).content, 'original second');
    daemon.db.setPolicy('fs_write:*', 'ASK');
    console.log('    ✓ Malformed tool batches are rejected before any filesystem side effect.');

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
