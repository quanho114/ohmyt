import { isDefaultTitle, fallbackTitle, hasTopic, GREETING_TITLE } from './session_titles.js';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';

export function createApiServer({ db, tools, permissions, skills, llm, agentLoop, registry = null, gateway = null, vault = null, port = 3188, authToken = null }) {
  const sseClients = new Map(); // runId -> Set<res>

  // Forward agent loop events to connected SSE clients
  agentLoop.on('event', ({ runId, eventId, sequence, type, payload }) => {
    if (sseClients.has(runId)) {
      const set = sseClients.get(runId);
      const data = `data: ${JSON.stringify({ eventId, sequence, type, payload })}\n\n`;
      for (const res of Array.from(set)) {
        try {
          if (res.writable && !res.writableEnded) {
            res.write(data);
          } else {
            set.delete(res);
          }
        } catch {
          set.delete(res);
        }
      }
    }
  });

  const sendJson = (res, statusCode, data) => {
    const jsonStr = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonStr)
    });
    res.end(jsonStr);
  };

  const parseBody = (req) => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  };
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const server = http.createServer(async (req, res) => {
    req.on('error', () => {});
    res.on('error', () => {});

    const listeningAddress = server.address();
    const listeningPort = String(typeof listeningAddress === 'object' && listeningAddress ? listeningAddress.port : port);
    let requestHost;
    try {
      requestHost = new URL(`http://${req.headers.host || ''}`);
    } catch {
      return sendJson(res, 400, { error: 'Invalid Host header' });
    }
    if (!localHosts.has(requestHost.hostname) || (requestHost.port && requestHost.port !== listeningPort)) {
      return sendJson(res, 403, { error: 'Host is not allowed' });
    }

    if (authToken && req.url.startsWith('/api/')) {
      const candidate = req.headers.authorization;
      const streamToken = new URL(req.url, 'http://localhost').searchParams.get('token');
      const stream = /^\/api\/runs\/[^/]+\/stream(?:\?|$)/.test(req.url);
      if (candidate !== `Bearer ${authToken}` && !(stream && streamToken === authToken) && req.method !== 'OPTIONS') return sendJson(res, 401, { error: 'Local runtime authentication required' });
    }

    const origin = req.headers.origin;
    if (origin) {
      let parsedOrigin;
      try { parsedOrigin = new URL(origin); }
      catch { return sendJson(res, 403, { error: 'Origin is not allowed' }); }
      const originPort = parsedOrigin.port || '80';
      if (parsedOrigin.protocol !== 'http:' || !localHosts.has(parsedOrigin.hostname) || ![listeningPort, '5173'].includes(originPort)) {
        return sendJson(res, 403, { error: 'Origin is not allowed' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    try {
      // Static Files from dist/ (SPA Support)
      if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api')) {
        const distDir = path.resolve(process.cwd(), 'dist');
        if (fs.existsSync(distDir)) {
          let filePath = path.join(distDir, pathname === '/' ? 'index.html' : pathname.slice(1));
          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(distDir, 'index.html');
          }

          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'text/plain';
            if (ext === '.html') contentType = 'text/html; charset=utf-8';
            else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
            else if (ext === '.css') contentType = 'text/css; charset=utf-8';
            else if (ext === '.svg') contentType = 'image/svg+xml';
            else if (ext === '.png') contentType = 'image/png';
            else if (ext === '.json') contentType = 'application/json';

            const content = fs.readFileSync(filePath);
            res.writeHead(200, {
              'Content-Type': contentType,
              'Content-Length': content.length,
              'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
            });
            if (method === 'HEAD') {
              res.end();
            } else {
              res.end(content);
            }
            return;
          }
        }
      }
      // 1. Health & Status
      if (method === 'GET' && pathname === '/api/status') {
        const llmHealth = await llm.checkHealth();
        return sendJson(res, 200, {
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
      }

      // Update LLM config
      if (method === 'POST' && pathname === '/api/llm/config') {
        const body = await parseBody(req);
        llm.updateConfig(body);
        const health = await llm.checkHealth();
        return sendJson(res, 200, {
          success: true,
          config: {
            provider: llm.provider,
            endpoint: llm.endpoint,
            model: llm.model,
            hasApiKey: Boolean(llm.apiKey)
          },
          health
        });
      }

      // 2. Agents
      if (method === 'GET' && pathname === '/api/agents') {
        return sendJson(res, 200, db.getAgents());
      }
      if (method === 'POST' && pathname === '/api/agents') {
        const body = await parseBody(req);
        const agent = db.upsertAgent(body);
        return sendJson(res, 200, agent);
      }

      // 3. Sessions
      if (method === 'GET' && pathname === '/api/network') {
        const addresses = [];
        for (const list of Object.values(os.networkInterfaces())) {
          for (const info of list || []) {
            if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
          }
        }
        return sendJson(res, 200, { port, addresses });
      }
      if (method === 'GET' && pathname === '/api/sessions') {
        const sessions = db.getSessions().map(session => {
          if (session.title_manual) return session;
          const history = db.getMessages(session.id);
          if (!isDefaultTitle(session.title) && session.title !== GREETING_TITLE) return session;
          const title = fallbackTitle(history);
          return title ? db.updateAutoTitle(session.id, session.title, title) || session : session;
        });
        return sendJson(res, 200, sessions);
      }
      if (method === 'POST' && pathname === '/api/sessions') {
        const body = await parseBody(req);
        const id = body.id || 'sess_' + Math.random().toString(36).substring(2, 10);
        const agentId = body.agentId || 'default-assistant';
        const title = body.title || 'Đoạn chat mới';
        const session = db.createSession(id, agentId, title);
        return sendJson(res, 201, session);
      }
      const sessionMatch = method === 'PATCH' && pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const body = await parseBody(req);
        if (typeof body?.title !== 'string') {
          return sendJson(res, 400, { error: 'Tên đoạn chat phải là chuỗi' });
        }
        const title = body.title.trim();
        if (!title || title.length > 200) {
          return sendJson(res, 400, { error: 'Tên đoạn chat phải có từ 1 đến 200 ký tự' });
        }
        let sessionId;
        try { sessionId = decodeURIComponent(sessionMatch[1]); }
        catch { return sendJson(res, 400, { error: 'Session ID không hợp lệ' }); }
        const session = db.updateSession(sessionId, title);
        if (!session) {
          return sendJson(res, 404, { error: 'Không tìm thấy đoạn chat' });
        }
        return sendJson(res, 200, session);
      }
      if (method === 'DELETE' && /^\/api\/sessions\/[^/]+$/.test(pathname)) {
        const id = pathname.replace('/api/sessions/', '');
        db.deleteSession(id);
        return sendJson(res, 200, { success: true, id });
      }

      // 4. Messages
      if (method === 'GET' && pathname.match(/^\/api\/sessions\/[^/]+\/messages$/)) {
        const sessionId = pathname.split('/')[3];
        const messages = db.getMessages(sessionId);
        return sendJson(res, 200, messages);
      }
      if (method === 'POST' && pathname.match(/^\/api\/sessions\/[^/]+\/messages\/truncate$/)) {
        const sessionId = decodeURIComponent(pathname.split('/')[3]);
        const body = await parseBody(req);
        const afterId = typeof body?.afterId === 'string' ? body.afterId : null;
        const deleted = db.truncateMessagesAfter(sessionId, afterId);
        return sendJson(res, 200, { success: true, deleted });
      }
      // Chuyển tiếp tin nhắn sang phiên khác (kiểu LobeHub forward): chèn lịch sử + ghi chú
      if (method === 'POST' && pathname === '/api/sessions/forward') {
        const body = await parseBody(req);
        const targetSessionId = typeof body?.targetSessionId === 'string' ? body.targetSessionId : '';
        const items = Array.isArray(body?.messages) ? body.messages : [];
        const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
        if (!targetSessionId) return sendJson(res, 400, { error: 'Thiếu targetSessionId' });
        const target = db.getSession(targetSessionId);
        if (!target) return sendJson(res, 404, { error: 'Không tìm thấy phiên đích' });
        const clean = items
          .filter(m => m && typeof m.content === 'string' && m.content.trim())
          .slice(0, 50)
          .map(m => ({
            sender: m.sender === 'agent' ? 'agent' : 'user',
            content: String(m.content).slice(0, 8000)
          }));
        if (!clean.length && !note) return sendJson(res, 400, { error: 'Không có nội dung để chuyển tiếp' });
        let inserted = 0;
        for (const m of clean) {
          const nid = 'msg_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
          db.addMessage(nid, targetSessionId, m.sender, m.content);
          inserted++;
        }
        return sendJson(res, 201, { success: true, inserted });
      }
      // Tạo chủ đề phụ: tạo session mới + clone lịch sử đến anchor (kiểu LobeHub branch)
      if (method === 'POST' && pathname === '/api/sessions/branch') {
        const body = await parseBody(req);
        const sourceSessionId = typeof body?.sourceSessionId === 'string' ? body.sourceSessionId : '';
        const anchorId = typeof body?.anchorId === 'string' ? body.anchorId : null;
        const includeContext = body?.includeContext !== false;
        const title = typeof body?.title === 'string' && body.title.trim()
          ? body.title.trim().slice(0, 200)
          : 'Chủ đề phụ';
        if (!sourceSessionId) return sendJson(res, 400, { error: 'Thiếu sourceSessionId' });
        const source = db.getSession(sourceSessionId);
        if (!source) return sendJson(res, 404, { error: 'Không tìm thấy chủ đề gốc' });
        const id = 'sess_' + Math.random().toString(36).substring(2, 10);
        db.createSession(id, source.agent_id || 'default-assistant', title);
        const result = db.branchSession(id, sourceSessionId, anchorId, includeContext);
        if (!result) return sendJson(res, 404, { error: 'Không tìm thấy tin nhắn anchor' });
        return sendJson(res, 201, { session: db.getSession(id), copied: result.copied });
      }
      const messageMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages\/([^/]+)$/);
      if (messageMatch && method === 'DELETE') {
        const messageId = decodeURIComponent(messageMatch[2]);
        const removed = db.deleteMessage(messageId);
        if (!removed) return sendJson(res, 404, { error: 'Không tìm thấy tin nhắn' });
        return sendJson(res, 200, { success: true, id: messageId });
      }

      if (method === 'GET' && pathname === '/api/statistics') {
        const month = parsedUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7);
        const offset = Number(parsedUrl.searchParams.get('offset') || 0);
        if (!/^(19[7-9]\d|20\d{2})-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(offset) || Math.abs(offset) > 840) {
          return sendJson(res, 400, { error: 'Tháng hoặc múi giờ không hợp lệ' });
        }
        return sendJson(res, 200, db.getStatistics(month, offset));
      }

      // 5. Runs & SSE Stream
      if (method === 'POST' && pathname === '/api/runs') {
        const body = await parseBody(req);
        const runId = body.runId || 'run_' + Math.random().toString(36).substring(2, 10);
        const { sessionId, prompt, responseLanguage = 'auto' } = body;
        if (!['auto', 'vi', 'en'].includes(responseLanguage)) {
          return sendJson(res, 400, { error: 'responseLanguage must be auto, vi or en' });
        }

        if (!sessionId || !prompt) {
          return sendJson(res, 400, { error: 'sessionId và prompt là bắt buộc' });
        }

        // Trigger agent loop asynchronously
        setImmediate(() => {
          agentLoop.run({ runId, sessionId, prompt, responseLanguage }).catch(err => {
            console.error(`Lỗi trong agent loop (run ${runId}):`, err);
          });
        });

        return sendJson(res, 202, { runId, sessionId, status: 'started' });
      }

      // SSE Stream for Run events
      if (method === 'GET' && pathname.match(/^\/api\/runs\/[^/]+\/stream$/)) {
        const runId = pathname.split('/')[3];
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Send existing historical events first
        const pastEvents = db.getRunEvents(runId);
        for (const evt of pastEvents) {
          try {
            res.write(`data: ${JSON.stringify({ eventId: `e_${runId}_${evt.sequence ?? evt.id}`, sequence: evt.sequence ?? evt.id, type: evt.event_type, payload: JSON.parse(evt.payload) })}\n\n`);
          } catch (_) {}
        }

        if (!sseClients.has(runId)) {
          sseClients.set(runId, new Set());
        }
        sseClients.get(runId).add(res);

        const cleanup = () => {
          if (sseClients.has(runId)) {
            sseClients.get(runId).delete(res);
          }
        };
        req.on('close', cleanup);
        res.on('close', cleanup);
        res.on('error', cleanup);
        return;
      }

      // 6. Permission Responses
      if (method === 'POST' && pathname.match(/^\/api\/runs\/[^/]+\/permission$/)) {
        const runId = pathname.split('/')[3];
        const body = await parseBody(req);
        const { requestId, decision } = body; // 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY'

        if (!requestId || !decision) {
          return sendJson(res, 400, { error: 'requestId và decision là bắt buộc' });
        }

        permissions.resolveApproval(requestId, decision);
        return sendJson(res, 200, { success: true, requestId, decision });
      }

      // 7. Abort / Take Control
      if (method === 'POST' && pathname.match(/^\/api\/runs\/[^/]+\/abort$/)) {
        const runId = pathname.split('/')[3];
        const body = await parseBody(req);
        const aborted = agentLoop.abortRun(runId, body.reason || 'Kích hoạt Take Control');
        return sendJson(res, 200, { success: true, runId, aborted });
      }

      // 8. Memories (White-box memory view & management)
      if (method === 'GET' && pathname === '/api/memories') {
        const query = parsedUrl.searchParams.get('q');
        if (query) {
          const results = db.searchMemories(query, 20);
          return sendJson(res, 200, results);
        }
        const all = db.getAllMemories();
        return sendJson(res, 200, all);
      }
      if (method === 'POST' && pathname === '/api/memories') {
        const body = await parseBody(req);
        const id = 'mem_' + Math.random().toString(36).substring(2, 10);
        const mem = db.saveMemory(id, body.agentId || 'default-assistant', body.category || 'profile', body.content);
        return sendJson(res, 201, mem);
      }
      if (method === 'DELETE' && pathname.startsWith('/api/memories/')) {
        const id = pathname.replace('/api/memories/', '');
        db.deleteMemory(id);
        return sendJson(res, 200, { success: true, id });
      }

      // 9. Skills
      if (method === 'GET' && pathname === '/api/skills') {
        return sendJson(res, 200, skills.loadAllSkills());
      }
      if (method === 'POST' && pathname === '/api/skills') {
        try {
          const body = await parseBody(req);
          const created = skills.createSkill(body);
          return sendJson(res, 201, created);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }
      if (method === 'POST' && pathname === '/api/skills/import-url') {
        try {
          const body = await parseBody(req);
          if (!body.url) return sendJson(res, 400, { error: 'url is required' });
          const imported = await skills.importFromUrl(body.url);
          return sendJson(res, 201, imported);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }
      if (method === 'POST' && pathname === '/api/skills/import-github') {
        try {
          const body = await parseBody(req);
          const repoUrl = body.repoUrl || body.repo;
          if (!repoUrl) return sendJson(res, 400, { error: 'repoUrl is required' });
          const imported = await skills.importFromGitHub(repoUrl);
          return sendJson(res, 201, imported);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }
      if (method === 'POST' && pathname === '/api/skills/upload') {
        try {
          const body = await parseBody(req);
          if (!body.content) return sendJson(res, 400, { error: 'content is required' });
          const filename = body.filename || 'skill.zip';
          const buffer = typeof body.content === 'string'
            ? (body.isBase64 || body.encoding === 'base64' || !body.content.startsWith('---')
                ? Buffer.from(body.content, 'base64')
                : Buffer.from(body.content, 'utf-8'))
            : Buffer.from(body.content);
          const uploaded = skills.importFromZip(buffer, filename);
          return sendJson(res, 201, uploaded);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }
      if (pathname.startsWith('/api/skills/')) {
        const skillId = pathname.replace('/api/skills/', '');
        if (skillId && !skillId.includes('/')) {
          if (method === 'GET') {
            const skill = skills.getSkill(skillId);
            if (!skill) return sendJson(res, 404, { error: `Skill "${skillId}" not found` });
            return sendJson(res, 200, skill);
          }
          if (method === 'PATCH' || method === 'PUT') {
            try {
              const body = await parseBody(req);
              const updated = skills.updateSkill(skillId, body);
              return sendJson(res, 200, updated);
            } catch (e) {
              const status = e.statusCode || 400;
              return sendJson(res, status, { error: e.message });
            }
          }
          if (method === 'DELETE') {
            try {
              skills.deleteSkill(skillId);
              return sendJson(res, 200, { success: true, id: skillId });
            } catch (e) {
              const status = e.statusCode || (e.message.includes('built-in') || e.message.includes('mặc định') ? 403 : 400);
              return sendJson(res, status, { error: e.message });
            }
          }
        }
      }

      // 10. Policies
      if (method === 'GET' && pathname === '/api/policies') {
        return sendJson(res, 200, db.getPolicies());
      }
      if (method === 'POST' && pathname === '/api/policies') {
        const body = await parseBody(req);
        const policies = db.setPolicy(body.pattern, body.action);
        return sendJson(res, 200, policies);
      }

      // 11. Providers & Models (P0)
      if (registry && gateway) {
        if (method === 'GET' && pathname === '/api/providers') {
          return sendJson(res, 200, registry.listProviders());
        }
        if (method === 'POST' && pathname === '/api/providers') {
          const body = await parseBody(req);
          if (!body.name || !body.type || !body.baseURL) return sendJson(res, 400, { error: 'name, type, baseURL required' });
          try {
            const created = registry.createProvider({ id: body.id, name: body.name, type: body.type, baseURL: body.baseURL, apiKey: body.apiKey, config: body.config || {} });
            return sendJson(res, 201, created);
          } catch (e) {
            return sendJson(res, 400, { error: e.message });
          }
        }
        if (method === 'GET' && pathname === '/api/models') {
          return sendJson(res, 200, db.getAllModels());
        }
        const provMatch = pathname.match(/^\/api\/providers\/([^/]+)(\/.*)?$/);
        if (provMatch) {
          const provId = provMatch[1];
          const suffix = provMatch[2] || '';
          if (method === 'PATCH' && (suffix === '' || suffix === '/')) {
            const body = await parseBody(req);
            const updated = registry.updateProvider(provId, body);
            return sendJson(res, 200, updated);
          }
          if (method === 'DELETE' && (suffix === '' || suffix === '/')) {
            const cur = db.getProvider(provId);
            if (cur?.api_key_ref && vault) {
              vault.remove(cur.api_key_ref);
              try { db.db.prepare(`DELETE FROM secrets_metadata WHERE key_ref=?`).run(cur.api_key_ref); } catch {}
            }
            db.deleteProvider(provId);
            return sendJson(res, 200, { success: true, id: provId });
          }
          if (method === 'POST' && suffix === '/test') {
            const result = await gateway.testConnection(provId);
            if (result.connected && result.models) {
              const existing = new Set(db.getModels(provId).map(m => m.model_id));
              for (const dm of result.models) {
                if (!existing.has(dm.modelId)) {
                  db.createModel({ provider_id: provId, model_id: dm.modelId, display_name: dm.displayName, capabilities_json: JSON.stringify(dm.capabilities) });
                }
              }
              const refreshed = await gateway.testConnection(provId);
              return sendJson(res, 200, { ...refreshed, models: undefined });
            }
            const { models, ...rest } = result;
            return sendJson(res, 200, rest);
          }
          if (method === 'GET' && (suffix === '/models' || suffix === '/models/')) {
            return sendJson(res, 200, db.getModels(provId));
          }
          if (method === 'POST' && (suffix === '/models' || suffix === '/models/')) {
            const body = await parseBody(req);
            if (!body.modelId) return sendJson(res, 400, { error: 'modelId required' });
            const created = registry.addModel(provId, { modelId: body.modelId, displayName: body.displayName, capabilities: body.capabilities || {}, contextWindow: body.contextWindow ?? null, maxOutputTokens: body.maxOutputTokens ?? null });
            return sendJson(res, 201, created);
          }
          const modelMatch = suffix.match(/^\/models\/([^/]+)\/?$/);
          if (modelMatch) {
            const modelRowId = modelMatch[1];
            if (method === 'PATCH') {
              const body = await parseBody(req);
              const patch = {};
              if (body.display_name !== undefined) patch.display_name = body.display_name;
              if (body.displayName !== undefined) patch.display_name = body.displayName;
              if (body.capabilities !== undefined) patch.capabilities_json = typeof body.capabilities === 'string' ? body.capabilities : JSON.stringify(body.capabilities);
              if (body.context_window !== undefined) patch.context_window = body.context_window;
              if (body.max_output_tokens !== undefined) patch.max_output_tokens = body.max_output_tokens;
              if (body.enabled !== undefined) patch.enabled = body.enabled ? 1 : 0;
              try {
                const updated = db.updateModel(modelRowId, patch);
                return sendJson(res, 200, updated);
              } catch (e) {
                return sendJson(res, 404, { error: e.message });
              }
            }
            if (method === 'DELETE') {
              db.deleteModel(modelRowId);
              return sendJson(res, 200, { success: true, id: modelRowId });
            }
          }
        }
      }

      // 12. Session model override
      const sessModelMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/model$/);
      if (sessModelMatch) {
        const sessId = sessModelMatch[1];
        if (method === 'GET') {
          return sendJson(res, 200, { override: db.getSessionModelOverride(sessId) });
        }
        if (method === 'PATCH') {
          const body = await parseBody(req);
          const override = body.override || null;
          if (override && (!override.providerId || !override.modelId)) return sendJson(res, 400, { error: 'providerId and modelId required' });
          const saved = db.setSessionModelOverride(sessId, override);
          return sendJson(res, 200, { override: saved });
        }
      }

      // 404
      return sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  });

  return {
    server,
    listen: (customPort = port) => {
      return new Promise((resolve, reject) => {
        server.listen(customPort, '127.0.0.1', () => resolve(server.address()));
        server.once('error', reject);
      });
    },
    close: () => {
      return new Promise(resolve => server.close(resolve));
    }
  };
}
