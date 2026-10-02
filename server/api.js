import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

export function createApiServer({ db, tools, permissions, skills, llm, agentLoop, registry = null, gateway = null, vault = null, port = 3188 }) {
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
      'Content-Length': Buffer.byteLength(jsonStr),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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

  const server = http.createServer(async (req, res) => {
    req.on('error', () => {});
    res.on('error', () => {});

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
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
      if (method === 'GET' && pathname === '/api/sessions') {
        return sendJson(res, 200, db.getSessions());
      }
      if (method === 'POST' && pathname === '/api/sessions') {
        const body = await parseBody(req);
        const id = body.id || 'sess_' + Math.random().toString(36).substring(2, 10);
        const agentId = body.agentId || 'default-assistant';
        const title = body.title || 'Đoạn chat mới';
        const session = db.createSession(id, agentId, title);
        return sendJson(res, 201, session);
      }
      if (method === 'DELETE' && pathname.startsWith('/api/sessions/')) {
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
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
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
        server.listen(customPort, () => {
          resolve(server.address());
        });
        server.on('error', reject);
      });
    },
    close: () => {
      return new Promise(resolve => server.close(resolve));
    }
  };
}
