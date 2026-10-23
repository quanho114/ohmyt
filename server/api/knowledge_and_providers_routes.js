import { sendJson, parseBody } from './http_utils.js';

export async function handleKnowledgeAndProvidersRoutes(ctx, req, res, { method, pathname, parsedUrl }) {
  const { db, skills, registry, gateway, vault } = ctx;

  // 8. Memories
  if (method === 'GET' && pathname === '/api/memories') {
    const query = parsedUrl.searchParams.get('q');
    const scopeId = parsedUrl.searchParams.get('scopeId');
    if (query) {
      sendJson(res, 200, db.searchMemories(query, 20, null, scopeId));
      return true;
    }
    sendJson(res, 200, db.getAllMemories(null, scopeId));
    return true;
  }

  if (method === 'POST' && pathname === '/api/memories') {
    const body = await parseBody(req);
    const id = 'mem_' + Math.random().toString(36).substring(2, 10);
    let scopeId = 'legacy:unassigned';
    if (body.projectId) {
      if (!db.getProject(body.projectId)) {
        sendJson(res, 400, { error: 'Project không tồn tại' });
        return true;
      }
      scopeId = `project:${body.projectId}`;
    }
    const mem = db.saveMemory(
      id,
      body.agentId || 'default-assistant',
      body.category || 'profile',
      body.content,
      scopeId
    );
    sendJson(res, 201, mem);
    return true;
  }

  const memoryScopeMatch = pathname.match(/^\/api\/memories\/([^/]+)\/scope$/);
  if (method === 'PATCH' && memoryScopeMatch) {
    const body = await parseBody(req);
    const id = decodeURIComponent(memoryScopeMatch[1]);
    let scopeId = 'legacy:unassigned';
    if (body.projectId !== null) {
      if (typeof body.projectId !== 'string' || !db.getProject(body.projectId)) {
        sendJson(res, 400, { error: 'Project không tồn tại' });
        return true;
      }
      scopeId = `project:${body.projectId}`;
    }
    const result = db.db.prepare('UPDATE memories SET scope_id = ? WHERE id = ?').run(scopeId, id);
    if (!result.changes) {
      sendJson(res, 404, { error: 'Bộ nhớ không tồn tại' });
      return true;
    }
    sendJson(res, 200, { success: true, scopeId });
    return true;
  }

  if (method === 'DELETE' && pathname.startsWith('/api/memories/')) {
    const id = pathname.replace('/api/memories/', '');
    db.deleteMemory(id);
    sendJson(res, 200, { success: true, id });
    return true;
  }

  // 9. Skills
  if (method === 'GET' && pathname === '/api/skills') {
    sendJson(res, 200, skills.loadAllSkills());
    return true;
  }

  if (method === 'POST' && pathname === '/api/skills') {
    try {
      const body = await parseBody(req);
      sendJson(res, 201, skills.createSkill(body));
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return true;
  }

  if (method === 'POST' && pathname === '/api/skills/import-url') {
    try {
      const body = await parseBody(req);
      if (!body.url) {
        sendJson(res, 400, { error: 'url is required' });
        return true;
      }
      sendJson(res, 201, await skills.importFromUrl(body.url));
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return true;
  }

  if (method === 'POST' && pathname === '/api/skills/import-github') {
    try {
      const body = await parseBody(req);
      const repoUrl = body.repoUrl || body.repo;
      if (!repoUrl) {
        sendJson(res, 400, { error: 'repoUrl is required' });
        return true;
      }
      sendJson(res, 201, await skills.importFromGitHub(repoUrl));
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return true;
  }

  if (method === 'POST' && pathname === '/api/skills/upload') {
    try {
      const body = await parseBody(req);
      if (!body.content) {
        sendJson(res, 400, { error: 'content is required' });
        return true;
      }
      const filename = body.filename || 'skill.zip';
      const buffer =
        typeof body.content === 'string'
          ? body.isBase64 || body.encoding === 'base64' || !body.content.startsWith('---')
            ? Buffer.from(body.content, 'base64')
            : Buffer.from(body.content, 'utf-8')
          : Buffer.from(body.content);
      sendJson(res, 201, skills.importFromZip(buffer, filename));
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return true;
  }

  if (pathname.startsWith('/api/skills/')) {
    const skillId = pathname.replace('/api/skills/', '');
    if (skillId && !skillId.includes('/')) {
      if (method === 'GET') {
        const skill = skills.getSkill(skillId);
        if (!skill) sendJson(res, 404, { error: `Skill "${skillId}" not found` });
        else sendJson(res, 200, skill);
        return true;
      }
      if (method === 'PATCH' || method === 'PUT') {
        try {
          const body = await parseBody(req);
          sendJson(res, 200, skills.updateSkill(skillId, body));
        } catch (e) {
          sendJson(res, e.statusCode || 400, { error: e.message });
        }
        return true;
      }
      if (method === 'DELETE') {
        try {
          skills.deleteSkill(skillId);
          sendJson(res, 200, { success: true, id: skillId });
        } catch (e) {
          const status = e.statusCode || (e.message.includes('built-in') || e.message.includes('mặc định') ? 403 : 400);
          sendJson(res, status, { error: e.message });
        }
        return true;
      }
    }
  }

  // 10. Policies
  if (method === 'GET' && pathname === '/api/policies') {
    sendJson(res, 200, db.getPolicies());
    return true;
  }
  if (method === 'POST' && pathname === '/api/policies') {
    const body = await parseBody(req);
    sendJson(res, 200, db.setPolicy(body.pattern, body.action));
    return true;
  }

  // 11. Providers & Models
  if (registry && gateway) {
    if (method === 'GET' && pathname === '/api/providers') {
      sendJson(res, 200, registry.listProviders());
      return true;
    }
    if (method === 'POST' && pathname === '/api/providers') {
      const body = await parseBody(req);
      if (!body.name || !body.type || !body.baseURL) {
        sendJson(res, 400, { error: 'name, type, baseURL required' });
        return true;
      }
      try {
        const created = registry.createProvider({
          id: body.id,
          name: body.name,
          type: body.type,
          baseURL: body.baseURL,
          apiKey: body.apiKey,
          config: body.config || {}
        });
        sendJson(res, 201, created);
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
      return true;
    }
    if (method === 'GET' && pathname === '/api/models') {
      sendJson(res, 200, db.getAllModels());
      return true;
    }
    const provMatch = pathname.match(/^\/api\/providers\/([^/]+)(\/.*)?$/);
    if (provMatch) {
      const provId = provMatch[1];
      const suffix = provMatch[2] || '';
      if (method === 'PATCH' && (suffix === '' || suffix === '/')) {
        const body = await parseBody(req);
        sendJson(res, 200, registry.updateProvider(provId, body));
        return true;
      }
      if (method === 'DELETE' && (suffix === '' || suffix === '/')) {
        const cur = db.getProvider(provId);
        if (cur?.api_key_ref && vault) {
          vault.remove(cur.api_key_ref);
          try {
            db.db.prepare('DELETE FROM secrets_metadata WHERE key_ref = ?').run(cur.api_key_ref);
          } catch {}
        }
        db.deleteProvider(provId);
        sendJson(res, 200, { success: true, id: provId });
        return true;
      }
      if (method === 'POST' && suffix === '/test') {
        const result = await gateway.testConnection(provId);
        if (result.connected && result.models) {
          const existing = new Set(db.getModels(provId).map((m) => m.model_id));
          for (const dm of result.models) {
            if (!existing.has(dm.modelId)) {
              db.createModel({
                provider_id: provId,
                model_id: dm.modelId,
                display_name: dm.displayName,
                capabilities_json: JSON.stringify(dm.capabilities)
              });
            }
          }
          const refreshed = await gateway.testConnection(provId);
          sendJson(res, 200, { ...refreshed, models: undefined });
          return true;
        }
        const { models, ...rest } = result;
        sendJson(res, 200, rest);
        return true;
      }
      if (method === 'GET' && (suffix === '/models' || suffix === '/models/')) {
        sendJson(res, 200, db.getModels(provId));
        return true;
      }
      if (method === 'POST' && (suffix === '/models' || suffix === '/models/')) {
        const body = await parseBody(req);
        if (!body.modelId) {
          sendJson(res, 400, { error: 'modelId required' });
          return true;
        }
        const created = registry.addModel(provId, {
          modelId: body.modelId,
          displayName: body.displayName,
          capabilities: body.capabilities || {},
          contextWindow: body.contextWindow ?? null,
          maxOutputTokens: body.maxOutputTokens ?? null
        });
        sendJson(res, 201, created);
        return true;
      }
      const modelMatch = suffix.match(/^\/models\/([^/]+)\/?$/);
      if (modelMatch) {
        const modelRowId = modelMatch[1];
        if (method === 'PATCH') {
          const body = await parseBody(req);
          const patch = {};
          if (body.display_name !== undefined) patch.display_name = body.display_name;
          if (body.displayName !== undefined) patch.display_name = body.displayName;
          if (body.capabilities !== undefined) {
            patch.capabilities_json =
              typeof body.capabilities === 'string' ? body.capabilities : JSON.stringify(body.capabilities);
          }
          if (body.context_window !== undefined) patch.context_window = body.context_window;
          if (body.max_output_tokens !== undefined) patch.max_output_tokens = body.max_output_tokens;
          if (body.enabled !== undefined) patch.enabled = body.enabled ? 1 : 0;
          try {
            sendJson(res, 200, db.updateModel(modelRowId, patch));
          } catch (e) {
            sendJson(res, 404, { error: e.message });
          }
          return true;
        }
        if (method === 'DELETE') {
          db.deleteModel(modelRowId);
          sendJson(res, 200, { success: true, id: modelRowId });
          return true;
        }
      }
    }
  }

  return false;
}
