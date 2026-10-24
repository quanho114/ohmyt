import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertProjectRoot, overlaps } from '../project_scope.js';
import { validApprovalMode } from '../approval_modes.js';
import { isDefaultTitle, fallbackTitle, GREETING_TITLE } from '../session_titles.js';
import { sendJson, parseBody } from './http_utils.js';

export async function handleSessionsAndProjectsRoutes(ctx, req, res, { method, pathname, parsedUrl }) {
  const { db, tools, skills, llm, agentLoop, browserBridge, browserUse, port, queuedSessionRuns } = ctx;

  // 1. Health & Status
  if (method === 'GET' && pathname === '/api/status') {
    const llmHealth = await llm.checkHealth();
    sendJson(res, 200, {
      status: 'online',
      engine: 'local-first',
      runtime: tools.describeRuntime?.(),
      db: 'sqlite-wal',
      llm: {
        provider: llm.provider,
        endpoint: llm.endpoint,
        model: llm.model,
        available: llmHealth.available
      },
      toolsCount: tools.getAllDefinitions().length,
      skillsCount: skills.loadAllSkills().length,
      timestamp: Date.now()
    });
    return true;
  }

  // Update LLM config
  if (method === 'POST' && pathname === '/api/llm/config') {
    const body = await parseBody(req);
    llm.updateConfig(body);
    const health = await llm.checkHealth();
    sendJson(res, 200, {
      success: true,
      config: {
        provider: llm.provider,
        endpoint: llm.endpoint,
        model: llm.model,
        hasApiKey: Boolean(llm.apiKey)
      },
      health
    });
    return true;
  }

  // 2. Agents
  if (method === 'GET' && pathname === '/api/agents') {
    sendJson(res, 200, db.getAgents());
    return true;
  }
  if (method === 'POST' && pathname === '/api/agents') {
    const body = await parseBody(req);
    const agent = db.upsertAgent(body);
    sendJson(res, 200, agent);
    return true;
  }

  const agentWorkspace = pathname.match(/^\/api\/agents\/([^/]+)\/workspace$/);
  if (agentWorkspace && method === 'PUT') {
    const id = decodeURIComponent(agentWorkspace[1]);
    const body = await parseBody(req);
    try {
      sendJson(res, 200, db.setAssistantWorkspace(id, { mainSessionId: body.mainSessionId ?? null, defaultProjectId: body.defaultProjectId ?? null }));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  // 3. Network, Projects & Sessions
  if (method === 'GET' && pathname === '/api/network') {
    const addresses = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const info of list || []) {
        if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
      }
    }
    sendJson(res, 200, { port, addresses });
    return true;
  }

  const sessionApproval = pathname.match(/^\/api\/sessions\/([^/]+)\/approval-mode$/);
  if (sessionApproval && method === 'PUT') {
    const id = decodeURIComponent(sessionApproval[1]);
    if (!db.getSession(id)) {
      sendJson(res, 404, { error: 'Không tìm thấy chat' });
      return true;
    }
    const { mode } = await parseBody(req);
    if (!validApprovalMode(mode)) {
      sendJson(res, 400, { error: 'Chế độ phê duyệt không hợp lệ' });
      return true;
    }
    const isRunning =
      queuedSessionRuns.has(id) || [...(agentLoop.activeRuns?.values() || [])].some((run) => run.sessionId === id);
    if (isRunning) {
      sendJson(res, 409, { error: 'Dừng tác vụ đang chạy trước khi đổi quyền' });
      return true;
    }
    db.db.prepare('UPDATE sessions SET approval_mode = ? WHERE id = ?').run(mode, id);
    sendJson(res, 200, db.getSession(id));
    return true;
  }

  const projectPermissions = pathname.match(/^\/api\/projects\/([^/]+)\/permissions$/);
  if (projectPermissions) {
    const projectId = decodeURIComponent(projectPermissions[1]);
    if (!db.getProject(projectId)) {
      sendJson(res, 404, { error: 'Project không tồn tại' });
      return true;
    }
    const scopeId = `project:${projectId}`;
    if (method === 'GET') {
      sendJson(res, 200, db.getScopedPolicies(scopeId));
      return true;
    }
    if (method === 'DELETE') {
      const body = await parseBody(req);
      if (typeof body.pattern !== 'string') {
        sendJson(res, 400, { error: 'Thiếu thao tác cần thu hồi' });
        return true;
      }
      db.db.prepare('DELETE FROM scoped_policies WHERE scope_id = ? AND pattern = ?').run(scopeId, body.pattern);
      sendJson(res, 200, { success: true });
      return true;
    }
  }

  if (method === 'GET' && pathname === '/api/projects') {
    sendJson(res, 200, db.getProjects());
    return true;
  }

  const removeProjectRoute = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (method === 'PATCH' && removeProjectRoute) {
    const id = decodeURIComponent(removeProjectRoute[1]);
    if (!db.getProject(id)) {
      sendJson(res, 404, { error: 'Project không tồn tại.' });
      return true;
    }
    const body = await parseBody(req);
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)) {
      sendJson(res, 400, { error: 'Tên dự án cần từ 1 đến 100 ký tự.' });
      return true;
    }
    if (body.pinned !== undefined && typeof body.pinned !== 'boolean') {
      sendJson(res, 400, { error: 'Trạng thái ghim không hợp lệ.' });
      return true;
    }
    if (body.section !== undefined && body.section !== null && (typeof body.section !== 'string' || !body.section.trim() || body.section.trim().length > 60)) {
      sendJson(res, 400, { error: 'Tên mục cần từ 1 đến 60 ký tự.' });
      return true;
    }
    const updated = db.updateProject(id, {
      name: body.name?.trim(),
      pinned: body.pinned,
      section: body.section === null ? null : body.section?.trim()
    });
    sendJson(res, 200, updated);
    return true;
  }

  const archiveProjectRoute = pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
  if (method === 'POST' && archiveProjectRoute) {
    const id = decodeURIComponent(archiveProjectRoute[1]);
    if (!db.getProject(id)) {
      sendJson(res, 404, { error: 'Project không tồn tại.' });
      return true;
    }
    const body = await parseBody(req);
    if (typeof body.archived !== 'boolean') {
      sendJson(res, 400, { error: 'Trạng thái lưu trữ không hợp lệ.' });
      return true;
    }
    sendJson(res, 200, { success: true, count: db.archiveProjectSessions(id, body.archived) });
    return true;
  }

  const archiveSessionRoute = pathname.match(/^\/api\/sessions\/([^/]+)\/archive$/);
  if (method === 'PATCH' && archiveSessionRoute) {
    const id = decodeURIComponent(archiveSessionRoute[1]);
    if (!db.getSession(id)) {
      sendJson(res, 404, { error: 'Cuộc trò chuyện không tồn tại.' });
      return true;
    }
    const body = await parseBody(req);
    if (typeof body.archived !== 'boolean') {
      sendJson(res, 400, { error: 'Trạng thái lưu trữ không hợp lệ.' });
      return true;
    }
    db.db.prepare('UPDATE sessions SET archived_at = ? WHERE id = ?').run(body.archived ? Date.now() : null, id);
    sendJson(res, 200, { success: true });
    return true;
  }

  if (method === 'DELETE' && removeProjectRoute) {
    const id = decodeURIComponent(removeProjectRoute[1]);
    if (!db.getProject(id)) {
      sendJson(res, 404, { error: 'Project không tồn tại.' });
      return true;
    }
    try {
      db.removeProject(id);
    } catch (error) {
      sendJson(res, 409, { error: error.message });
      return true;
    }
    if (browserBridge) {
      for (const sessionId of browserBridge.grants.keys()) {
        if (!db.getSession(sessionId)) browserBridge.revoke(sessionId);
      }
    }
    sendJson(res, 200, { success: true });
    return true;
  }

  if (method === 'POST' && pathname === '/api/projects') {
    const body = await parseBody(req);
    if (typeof body.path !== 'string' || !path.isAbsolute(body.path)) {
      sendJson(res, 400, { error: 'Nhập đường dẫn tuyệt đối tới thư mục project.' });
      return true;
    }
    let projectPath;
    try {
      projectPath = fs.realpathSync(body.path);
      if (!fs.statSync(projectPath).isDirectory()) throw new Error();
    } catch {
      sendJson(res, 400, { error: 'Thư mục project không tồn tại hoặc không truy cập được.' });
      return true;
    }
    const existingProject = db.getProjects(true).find((p) => p.path === projectPath);
    if (existingProject?.removed_at) {
      try {
        db.removeProject(existingProject.id);
      } catch (error) {
        sendJson(res, 409, { error: error.message });
        return true;
      }
    } else if (existingProject) {
      try {
        assertProjectRoot(db, existingProject);
      } catch (error) {
        sendJson(res, 409, { error: error.message });
        return true;
      }
      sendJson(res, 200, db.restoreProject(existingProject.id));
      return true;
    }
    if (db.getProjects(true).some((p) => overlaps(p.path, projectPath))) {
      sendJson(res, 409, { error: 'Thư mục project trùng hoặc lồng trong project khác.' });
      return true;
    }
    if (db.dbPath !== ':memory:' && overlaps(projectPath, path.dirname(path.resolve(db.dbPath)))) {
      sendJson(res, 403, { error: 'Không dùng thư mục dữ liệu ohmyt làm project.' });
      return true;
    }
    const project = db.addProject('proj_' + crypto.randomUUID(), path.basename(projectPath) || projectPath, projectPath);
    sendJson(res, 201, project);
    return true;
  }

  if (method === 'GET' && pathname === '/api/sessions') {
    const sessions = db.getSessions().map((session) => {
      if (session.title_manual) return session;
      const history = db.getMessages(session.id);
      if (!isDefaultTitle(session.title) && session.title !== GREETING_TITLE) return session;
      const title = fallbackTitle(history);
      return title ? db.updateAutoTitle(session.id, session.title, title) || session : session;
    });
    sendJson(res, 200, sessions);
    return true;
  }

  if (method === 'POST' && pathname === '/api/sessions') {
    const body = await parseBody(req);
    const id = body.id || 'sess_' + Math.random().toString(36).substring(2, 10);
    const agentId = body.agentId || 'default-assistant';
    const title = body.title || 'Đoạn chat mới';
    if (body.projectId != null && (typeof body.projectId !== 'string' || !db.getProject(body.projectId))) {
      sendJson(res, 400, { error: 'Project không tồn tại.' });
      return true;
    }
    const session = db.createSession(id, agentId, title, body.projectId ?? null);
    sendJson(res, 201, session);
    return true;
  }

  const sessionMatch = method === 'PATCH' && pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const body = await parseBody(req);
    if (typeof body?.title !== 'string') {
      sendJson(res, 400, { error: 'Tên đoạn chat phải là chuỗi' });
      return true;
    }
    const title = body.title.trim();
    if (!title || title.length > 200) {
      sendJson(res, 400, { error: 'Tên đoạn chat phải có từ 1 đến 200 ký tự' });
      return true;
    }
    let sessionId;
    try {
      sessionId = decodeURIComponent(sessionMatch[1]);
    } catch {
      sendJson(res, 400, { error: 'Session ID không hợp lệ' });
      return true;
    }
    const session = db.updateSession(sessionId, title);
    if (!session) {
      sendJson(res, 404, { error: 'Không tìm thấy đoạn chat' });
      return true;
    }
    sendJson(res, 200, session);
    return true;
  }

  if (method === 'DELETE' && /^\/api\/sessions\/[^/]+$/.test(pathname)) {
    const id = pathname.replace('/api/sessions/', '');
    agentLoop.deletingSessions ||= new Set();
    agentLoop.deletingSessions.add(id);
    try {
      agentLoop.harness?.goals.interrupt(id, 'chat_deleted');
      const handles = agentLoop.harness
        ? [...agentLoop.harness.agents.handles.values()].filter((h) => h.sessionId === id)
        : [];
      for (const handle of handles) handle.abort('Chat deleted');
      for (const [runId, active] of agentLoop.activeRuns) {
        if (active.sessionId === id) agentLoop.abortRun(runId, 'Chat deleted');
      }
      await Promise.allSettled(handles.map((h) => h.task));
      await agentLoop.harness?.goals.drain(id);
      if (browserUse?.files && db.getSession(id) && !db.getSession(id).project_id) {
        for (const file of browserUse.files.list(id)) {
          await browserUse.files.remove(id, file.fileId);
        }
      }
      db.deleteSession(id);
      browserBridge?.revoke(id);
      sendJson(res, 200, { success: true, id });
      return true;
    } finally {
      agentLoop.deletingSessions.delete(id);
    }
  }

  // 4. Messages
  if (method === 'GET' && /^\/api\/sessions\/[^/]+\/messages$/.test(pathname)) {
    const sessionId = pathname.split('/')[3];
    const messages = db.getMessages(sessionId);
    const internal = new Set(
      agentLoop.harness
        ? db.db
            .prepare(
              "SELECT DISTINCT t.user_message_id FROM harness_turns t JOIN harness_events e ON e.session_id = t.session_id AND e.type = 'goal/change' AND json_extract(e.payload, '$.operation') = 'reserve' AND json_extract(e.payload, '$.goal.currentRound.runId') = t.run_id WHERE t.session_id = ?"
            )
            .all(sessionId)
            .map((row) => row.user_message_id)
        : []
    );
    const filtered = messages.filter((message) => {
      if (internal.has(message.id)) return false;
      try {
        return JSON.parse(message.metadata || '{}').internalSource !== 'goal_round';
      } catch {
        return true;
      }
    });
    sendJson(res, 200, filtered);
    return true;
  }

  if (method === 'POST' && /^\/api\/sessions\/[^/]+\/messages\/truncate$/.test(pathname)) {
    const sessionId = decodeURIComponent(pathname.split('/')[3]);
    const body = await parseBody(req);
    const isBusy =
      agentLoop.harness?.agents.sessionOwners.has(sessionId) ||
      [...agentLoop.activeRuns.values()].some((run) => run.sessionId === sessionId);
    if (isBusy) {
      sendJson(res, 409, { error: 'Dừng tác vụ trước khi sửa lịch sử.' });
      return true;
    }
    const afterId = typeof body?.afterId === 'string' ? body.afterId : null;
    const deleted = db.truncateMessagesAfter(sessionId, afterId);
    sendJson(res, 200, { success: true, deleted });
    return true;
  }

  if (method === 'POST' && pathname === '/api/sessions/forward') {
    const body = await parseBody(req);
    const targetSessionId = typeof body?.targetSessionId === 'string' ? body.targetSessionId : '';
    const items = Array.isArray(body?.messages) ? body.messages : [];
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
    if (!targetSessionId) {
      sendJson(res, 400, { error: 'Thiếu targetSessionId' });
      return true;
    }
    const target = db.getSession(targetSessionId);
    if (!target) {
      sendJson(res, 404, { error: 'Không tìm thấy phiên đích' });
      return true;
    }
    const source = typeof body.sourceSessionId === 'string' ? db.getSession(body.sourceSessionId) : null;
    if ((target.project_id || source?.project_id) && (!source || target.project_id !== source.project_id)) {
      sendJson(res, 403, { error: 'Không chuyển tiếp giữa các project. Chọn một chat trong cùng project.' });
      return true;
    }
    const clean = items
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .slice(0, 50)
      .map((m) => ({
        sender: m.sender === 'agent' ? 'agent' : 'user',
        content: String(m.content).slice(0, 8000)
      }));
    if (!clean.length && !note) {
      sendJson(res, 400, { error: 'Không có nội dung để chuyển tiếp' });
      return true;
    }
    let inserted = 0;
    for (const m of clean) {
      const nid = 'msg_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
      db.addMessage(nid, targetSessionId, m.sender, m.content);
      inserted++;
    }
    sendJson(res, 201, { success: true, inserted });
    return true;
  }

  if (method === 'POST' && pathname === '/api/sessions/branch') {
    const body = await parseBody(req);
    const sourceSessionId = typeof body?.sourceSessionId === 'string' ? body.sourceSessionId : '';
    const anchorId = typeof body?.anchorId === 'string' ? body.anchorId : null;
    const includeContext = body?.includeContext !== false;
    const title =
      typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Chủ đề phụ';
    if (!sourceSessionId) {
      sendJson(res, 400, { error: 'Thiếu sourceSessionId' });
      return true;
    }
    const source = db.getSession(sourceSessionId);
    if (!source) {
      sendJson(res, 404, { error: 'Không tìm thấy chủ đề gốc' });
      return true;
    }
    const id = 'sess_' + Math.random().toString(36).substring(2, 10);
    db.createSession(id, source.agent_id || 'default-assistant', title, source.project_id ?? null);
    const override = db.getSessionModelOverride(sourceSessionId);
    if (override) db.setSessionModelOverride(id, override);
    const result = db.branchSession(id, sourceSessionId, anchorId, includeContext);
    if (!result) {
      sendJson(res, 404, { error: 'Không tìm thấy tin nhắn anchor' });
      return true;
    }
    sendJson(res, 201, { session: db.getSession(id), copied: result.copied });
    return true;
  }

  const messageMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages\/([^/]+)$/);
  if (messageMatch && method === 'DELETE') {
    const sessionId = decodeURIComponent(messageMatch[1]);
    const messageId = decodeURIComponent(messageMatch[2]);
    if (db.getMessages(sessionId).every((message) => message.id !== messageId)) {
      sendJson(res, 404, { error: 'Tin nhắn không thuộc chat.' });
      return true;
    }
    const isBusy =
      agentLoop.harness?.agents.sessionOwners.has(sessionId) ||
      [...agentLoop.activeRuns.values()].some((run) => run.sessionId === sessionId);
    if (isBusy) {
      sendJson(res, 409, { error: 'Dừng tác vụ trước khi sửa lịch sử.' });
      return true;
    }
    const removed = db.deleteMessage(messageId);
    if (!removed) {
      sendJson(res, 404, { error: 'Không tìm thấy tin nhắn' });
      return true;
    }
    sendJson(res, 200, { success: true, id: messageId });
    return true;
  }

  if (method === 'GET' && pathname === '/api/statistics') {
    const month = parsedUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const offset = Number(parsedUrl.searchParams.get('offset') || 0);
    if (!/^(19[7-9]\d|20\d{2})-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(offset) || Math.abs(offset) > 840) {
      sendJson(res, 400, { error: 'Tháng hoặc múi giờ không hợp lệ' });
      return true;
    }
    sendJson(res, 200, db.getStatistics(month, offset));
    return true;
  }

  // Session model override
  const sessModelMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/model$/);
  if (sessModelMatch) {
    const sessId = sessModelMatch[1];
    if (method === 'GET') {
      sendJson(res, 200, { override: db.getSessionModelOverride(sessId) });
      return true;
    }
    if (method === 'PATCH') {
      const body = await parseBody(req);
      const override = body.override || null;
      if (override && (!override.providerId || !override.modelId)) {
        sendJson(res, 400, { error: 'providerId and modelId required' });
        return true;
      }
      const saved = db.setSessionModelOverride(sessId, override);
      sendJson(res, 200, { override: saved });
      return true;
    }
  }

  return false;
}
