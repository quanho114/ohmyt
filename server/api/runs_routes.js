import { DocumentContexts } from '../document_context.js';
import { validTaskWorkflow } from '../../shared/task_workflow.js';
import { validateImages } from '../image_attachments.js';
import { sendJson, parseBody } from './http_utils.js';

export async function handleRunsRoutes(ctx, req, res, { method, pathname }) {
  const { db, permissions, agentLoop, sseClients, trackStream, queuedSessionRuns } = ctx;

  if (method === 'POST' && pathname === '/api/document-context') {
    const body = await parseBody(req);
    if (typeof body.sessionId !== 'string' || !db.getSession(body.sessionId)) {
      sendJson(res, 400, { error: 'Invalid chat' });
      return true;
    }
    try {
      if (body.clear === true) agentLoop.documentContexts.clear(body.sessionId);
      else agentLoop.documentContexts.update(body.sessionId, body);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === 'POST' && pathname === '/api/runs') {
    if (agentLoop.harness?.closed || agentLoop.harness?.closing || agentLoop.harness?.changingPlugins) {
      sendJson(res, 409, { error: 'Runtime đang dừng hoặc đổi plugin. Thử lại sau.' });
      return true;
    }
    const body = await parseBody(req);
    if (body.runId !== undefined && (typeof body.runId !== 'string' || !body.runId)) {
      sendJson(res, 400, { error: 'Run ID không hợp lệ' });
      return true;
    }
    const runId = body.runId || 'run_' + Math.random().toString(36).substring(2, 10);
    if (db.db.prepare('SELECT id FROM runs WHERE id = ?').get(runId)) {
      sendJson(res, 409, { error: 'Run ID đã tồn tại' });
      return true;
    }
    const { sessionId, prompt, responseLanguage = 'auto' } = body;
    if (body.workflowId !== undefined && !validTaskWorkflow(body.workflowId)) {
      sendJson(res, 400, { error: 'Tác vụ gợi ý không hợp lệ' });
      return true;
    }
    if (!['auto', 'vi', 'en'].includes(responseLanguage)) {
      sendJson(res, 400, { error: 'responseLanguage must be auto, vi or en' });
      return true;
    }

    let images;
    try {
      images = validateImages(body.images);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
    if (!sessionId || (!prompt && !images.length)) {
      sendJson(res, 400, { error: 'sessionId và prompt là bắt buộc' });
      return true;
    }
    if (typeof sessionId !== 'string' || typeof prompt !== 'string' || !db.getSession(sessionId)) {
      sendJson(res, 400, { error: 'Chat hoặc yêu cầu không hợp lệ' });
      return true;
    }
    const isRunning =
      queuedSessionRuns.has(sessionId) ||
      [...(agentLoop.activeRuns?.values() || [])].some((run) => run.sessionId === sessionId);
    if (isRunning) {
      sendJson(res, 409, { error: 'Chat này đang chạy' });
      return true;
    }
    // Validate the complete tab context before admitting a run. This also
    // restores context after a backend restart without relying on an earlier POST.
    if (body.documentSnapshots !== undefined) {
      try {
        if (!Array.isArray(body.documentSnapshots) || body.documentSnapshots.length > 10) {
          throw Error('Invalid document snapshots');
        }
        const documents = new DocumentContexts();
        for (const snapshot of body.documentSnapshots) documents.update(sessionId, snapshot);
        agentLoop.documentContexts.sessions.delete(sessionId);
        if (documents.sessions.has(sessionId)) {
          agentLoop.documentContexts.sessions.set(sessionId, documents.sessions.get(sessionId));
        }
      } catch (error) {
        sendJson(res, 400, { error: error.message });
        return true;
      }
    }
    if (body.workflowId !== undefined) {
      db.db.prepare('UPDATE sessions SET workflow_id = ? WHERE id = ?').run(body.workflowId, sessionId);
    }
    queuedSessionRuns.add(sessionId);

    // Reserve run admission immediately so plugin changes cannot race a queued run.
    agentLoop
      .run({ runId, sessionId, prompt, responseLanguage, images })
      .catch((err) => {
        console.error(`Lỗi trong agent loop (run ${runId}):`, err);
      })
      .finally(() => queuedSessionRuns.delete(sessionId));

    sendJson(res, 202, { runId, sessionId, status: 'started' });
    return true;
  }

  // SSE Stream for Run events
  if (method === 'GET' && /^\/api\/runs\/[^/]+\/stream$/.test(pathname)) {
    const runId = pathname.split('/')[3];
    const cursor = String(req.headers['last-event-id'] || '');
    const prefix = `e_${runId}_`;
    const sequenceText = cursor.slice(prefix.length);
    const afterSequence = cursor ? Number(sequenceText) : 0;
    if (cursor && (!cursor.startsWith(prefix) || !/^\d+$/.test(sequenceText) || !Number.isSafeInteger(afterSequence))) {
      sendJson(res, 400, { error: 'Invalid run stream cursor' });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    trackStream(res);

    const pastEvents = db.getRunEvents(runId);
    for (const evt of pastEvents) {
      const sequence = evt.sequence ?? evt.id;
      if (sequence <= afterSequence) continue;
      try {
        const eventId = `e_${runId}_${sequence}`;
        res.write(
          `id: ${eventId}\ndata: ${JSON.stringify({ eventId, sequence, type: evt.event_type, payload: JSON.parse(evt.payload) })}\n\n`
        );
      } catch {}
    }

    if (!sseClients.has(runId)) {
      sseClients.set(runId, new Set());
    }
    sseClients.get(runId).add(res);

    const cleanup = () => {
      if (sseClients.has(runId)) {
        const clients = sseClients.get(runId);
        clients.delete(res);
        if (!clients.size) sseClients.delete(runId);
      }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    return true;
  }

  // Permission Responses
  if (method === 'POST' && /^\/api\/runs\/[^/]+\/permission$/.test(pathname)) {
    const runId = pathname.split('/')[3];
    const body = await parseBody(req);
    const { requestId, decision } = body;

    if (!requestId || !decision) {
      sendJson(res, 400, { error: 'requestId và decision là bắt buộc' });
      return true;
    }
    if (!['ALLOW_ONCE', 'ALLOW_ALWAYS', 'DENY'].includes(decision)) {
      sendJson(res, 400, { error: 'Quyết định không hợp lệ' });
      return true;
    }
    const approval = permissions.getPendingRequests(runId).find((request) => request.requestId === requestId);
    if (!approval) {
      sendJson(res, 403, { error: 'Quyền không thuộc run này hoặc đã hết hạn.' });
      return true;
    }
    permissions.resolveApproval(requestId, decision);
    sendJson(res, 200, { success: true, requestId, decision });
    return true;
  }

  // Abort / Take Control
  if (method === 'POST' && /^\/api\/runs\/[^/]+\/abort$/.test(pathname)) {
    const runId = pathname.split('/')[3];
    const body = await parseBody(req);
    const handle = agentLoop.harness?.agents.findRun(runId);
    handle?.abort(body.reason || 'Kích hoạt Take Control');
    const aborted = Boolean(handle) || agentLoop.abortRun(runId, body.reason || 'Kích hoạt Take Control');
    sendJson(res, 200, { success: true, runId, aborted });
    return true;
  }

  return false;
}
