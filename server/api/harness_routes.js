import { controlRun } from '../harness/controls.js';
import { executeGoalCommand } from '../harness/goal_commands.js';
import { subscribeSession } from '../harness/client_events.js';
import { sendJson, parseBody } from './http_utils.js';

export async function handleHarnessRoutes(ctx, req, res, { method, pathname, parsedUrl }) {
  const { db, agentLoop, trackStream } = ctx;
  const harness = agentLoop.harness;
  if (!harness) return false;

  if (pathname === '/api/connectors' && harness.connectors) {
    if (method === 'GET') {
      sendJson(res, 200, { connectors: harness.connectors.list() });
      return true;
    }
    if (method === 'PUT') {
      sendJson(res, 200, harness.connectors.add(await parseBody(req)));
      return true;
    }
  }

  const childRoute = pathname.match(/^\/api\/runs\/([^/]+)\/subagents(?:\/([^/]+)\/(cancel|result))?$/);
  if (childRoute) {
    const parentId = decodeURIComponent(childRoute[1]);
    if (method === 'GET' && !childRoute[2]) {
      const rows = db.db
        .prepare('SELECT c.*, r.id AS run_id, r.status FROM harness_children c LEFT JOIN runs r ON r.session_id = c.session_id WHERE c.parent_run_id = ?')
        .all(parentId);
      const children = rows.map((row) => ({
        id: row.child_id,
        sessionId: row.session_id,
        task: db.getSession(row.session_id)?.title || '',
        state: row.status || 'running',
        outcome: row.run_id ? harness.sessions.outcome(row.run_id) : null
      }));
      sendJson(res, 200, { children });
      return true;
    }
    if (childRoute[2]) {
      const childId = decodeURIComponent(childRoute[2]);
      if (method === 'POST' && childRoute[3] === 'cancel') {
        harness.subagents.cancel(childId, parentId);
        sendJson(res, 200, { success: true });
        return true;
      }
      if (method === 'GET' && childRoute[3] === 'result') {
        const child = db.db
          .prepare('SELECT * FROM harness_children WHERE child_id = ? AND parent_run_id = ?')
          .get(childId, parentId);
        if (!child) {
          sendJson(res, 404, { error: 'Child unavailable' });
          return true;
        }
        const messages = db.getMessages(child.session_id).map((m) => ({
          sender: m.sender,
          content: m.content
        }));
        sendJson(res, 200, { messages });
        return true;
      }
    }
  }

  const connectorAction = pathname.match(/^\/api\/connectors\/([^/]+)\/(test|connect|disconnect)$/);
  if (method === 'POST' && connectorAction && harness.connectors) {
    const id = decodeURIComponent(connectorAction[1]);
    const action = connectorAction[2];
    sendJson(res, 200, await harness.connectors[action](id));
    return true;
  }

  const artifactRoute = pathname.match(/^\/api\/artifacts\/([^/]+)$/);
  if (method === 'GET' && artifactRoute) {
    const artifactId = decodeURIComponent(artifactRoute[1]);
    sendJson(res, 200, harness.artifacts.get(artifactId, parsedUrl.searchParams.get('sessionId')));
    return true;
  }

  const diagnosticsRoute = pathname.match(/^\/api\/runs\/([^/]+)\/diagnostics$/);
  if (method === 'GET' && diagnosticsRoute) {
    const run = db.db.prepare('SELECT * FROM runs WHERE id = ?').get(decodeURIComponent(diagnosticsRoute[1]));
    if (!run) {
      sendJson(res, 404, { error: 'Run unavailable' });
      return true;
    }
    const redactedKeys = new Set(['facts', 'content', 'error', 'arguments', 'message']);
    const allowedTypes = new Set(['attempt/start', 'attempt/end', 'turn/end', 'context/summary']);
    const events = harness.sessions.log
      .readAll(run.session_id)
      .filter((e) => e.payload.turnId === run.id && allowedTypes.has(e.type))
      .map((e) => ({
        ...e,
        payload: Object.fromEntries(Object.entries(e.payload).filter(([key]) => !redactedKeys.has(key)))
      }));
    sendJson(res, 200, { runId: run.id, status: run.status, events });
    return true;
  }

  if (pathname === '/api/extensions' && method === 'GET') {
    sendJson(res, 200, { extensions: harness.extensions.list() });
    return true;
  }

  const extensionRoute = pathname.match(/^\/api\/extensions\/([^/]+)$/);
  if (extensionRoute) {
    const id = decodeURIComponent(extensionRoute[1]);
    if (method === 'GET') {
      const item = harness.extensions.get(id);
      sendJson(res, item ? 200 : 404, item || { error: 'Extension unavailable' });
      return true;
    }
    if (method === 'PATCH') {
      sendJson(res, 200, await harness.extensions.update(id, await parseBody(req)));
      return true;
    }
  }

  if (pathname === '/api/agent-presets') {
    if (method === 'GET') {
      sendJson(res, 200, {
        presets: harness.profiles.list(),
        selectedId: harness.profiles.selectedId(parsedUrl.searchParams.get('sessionId'))
      });
      return true;
    }
    if (method === 'PUT') {
      const body = await parseBody(req);
      const result = body.selectedId
        ? harness.profiles.select(body.selectedId, { sessionId: body.sessionId, projectId: body.projectId })
        : harness.profiles.save(body.profile, body.expectedRevision);
      sendJson(res, 200, result);
      return true;
    }
  }

  const inputList = pathname.match(/^\/api\/sessions\/([^/]+)\/user-input$/);
  if (inputList && method === 'GET') {
    const sessionId = decodeURIComponent(inputList[1]);
    if (!db.getSession(sessionId)) {
      sendJson(res, 404, { error: 'Chat unavailable' });
      return true;
    }
    sendJson(res, 200, { requests: harness.userInputs.list(sessionId) });
    return true;
  }

  const inputAnswer = pathname.match(/^\/api\/runs\/([^/]+)\/user-input\/([^/]+)$/);
  if (inputAnswer && method === 'POST') {
    try {
      const runId = decodeURIComponent(inputAnswer[1]);
      const requestId = decodeURIComponent(inputAnswer[2]);
      sendJson(res, 200, harness.userInputs.answer(runId, requestId, await parseBody(req)));
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message });
    }
    return true;
  }

  const goalCommandRoute = pathname.match(/^\/api\/sessions\/([^/]+)\/goal\/command$/);
  if (goalCommandRoute && method === 'POST') {
    const sessionId = decodeURIComponent(goalCommandRoute[1]);
    if (!db.getSession(sessionId)) {
      sendJson(res, 404, { error: 'Chat unavailable' });
      return true;
    }
    try {
      sendJson(res, 200, await executeGoalCommand(harness.goals, sessionId, await parseBody(req)));
    } catch (error) {
      const status = error.code === 'GOAL_REVISION_CONFLICT' || /Wait|Pause/.test(error.message) ? 409 : 400;
      sendJson(res, status, { error: error.message, code: error.code });
    }
    return true;
  }

  const goalRoute = pathname.match(/^\/api\/sessions\/([^/]+)\/goal$/);
  if (goalRoute) {
    const sessionId = decodeURIComponent(goalRoute[1]);
    const goals = harness.goals;
    if (!db.getSession(sessionId)) {
      sendJson(res, 404, { error: 'Chat unavailable' });
      return true;
    }
    try {
      if (method === 'GET') {
        sendJson(res, 200, { goal: goals.get(sessionId) });
        return true;
      }
      const body = await parseBody(req);
      if (method === 'POST') {
        sendJson(res, 201, { goal: goals.create(sessionId, body) });
        return true;
      }
      if (method === 'PATCH') {
        sendJson(res, 200, { goal: body.action ? goals.control(sessionId, body) : goals.edit(sessionId, body) });
        return true;
      }
    } catch (error) {
      const status = /revision conflict|Wait|Pause/.test(error.message) ? 409 : 400;
      sendJson(res, status, { error: error.message });
      return true;
    }
  }

  const inboxRoute = pathname.match(/^\/api\/sessions\/([^/]+)\/inbox(?:\/([^/]+))?$/);
  if (inboxRoute) {
    const sessionId = decodeURIComponent(inboxRoute[1]);
    const inbox = harness.inbox;
    if (!db.getSession(sessionId)) {
      sendJson(res, 404, { error: 'Chat không tồn tại' });
      return true;
    }
    if (method === 'GET') {
      const handle = harness.agents.list().find((h) => h.sessionId === sessionId && h.runId);
      const status = handle ? db.db.prepare('SELECT status FROM runs WHERE id = ?').get(handle.runId)?.status : null;
      const state =
        status === 'aborted'
          ? 'stopping'
          : ['completed', 'failed'].includes(status)
            ? 'settling'
            : handle?.state || 'idle';
      sendJson(res, 200, {
        messages: inbox.list(sessionId),
        activeRunId: handle?.runId || null,
        state,
        contextUsage: harness.sessions.log.latestContextUsage(sessionId)
      });
      return true;
    }
    if (inboxRoute[2]) {
      const id = decodeURIComponent(inboxRoute[2]);
      if (inbox.get(id)?.sessionId !== sessionId) {
        sendJson(res, 404, { error: 'Message không thuộc chat' });
        return true;
      }
      if (method === 'PATCH') {
        const body = await parseBody(req);
        if (body.kind !== undefined) {
          if (body.kind === 'steering') {
            sendJson(res, 200, agentLoop.sendInboxNow(sessionId, id));
            return true;
          }
          const handle = harness.agents.list().find((h) => h.sessionId === sessionId && h.runId);
          // When the current run has finished, send the existing queued item as a new turn.
          const kind = body.kind === 'steering' && !handle ? 'queued' : body.kind;
          const item = inbox.setPendingKind(id, kind, handle?.runId);
          if (item.kind === 'queued') agentLoop.pumpInbox(sessionId);
          sendJson(res, 200, item);
          return true;
        }
        sendJson(res, 200, inbox.editPending(id, body.content));
        return true;
      }
      if (method === 'DELETE') {
        inbox.cancelPending(id);
        sendJson(res, 200, { success: true });
        return true;
      }
    } else if (method === 'POST') {
      const body = await parseBody(req);
      const existing = inbox.findSubmission(sessionId, body.clientMessageId);
      if (!existing && body.kind === 'steering' && !harness.agents.sessionOwners.has(sessionId)) {
        sendJson(res, 409, { error: 'Tác vụ đã kết thúc. Gửi yêu cầu mới.' });
        return true;
      }
      if (!existing) harness.goals.interrupt(sessionId);
      const targetRunId =
        body.kind === 'steering'
          ? harness.agents.list().find((h) => h.sessionId === sessionId && h.runId)?.runId
          : null;
      let item;
      try {item = inbox.enqueue({ ...body, sessionId, targetRunId });}
      catch (error) {
        sendJson(res, /collision/.test(error.message) ? 409 : 400, {error: error.message, code: /collision/.test(error.message) ? 'SUBMISSION_COLLISION' : 'INVALID_SUBMISSION'});
        return true;
      }
      if (item.kind === 'queued') agentLoop.pumpInbox(sessionId);
      sendJson(res, 202, item);
      return true;
    }
  }

  const runControl = pathname.match(/^\/api\/runs\/([^/]+)\/(pause|resume)$/);
  if (method === 'POST' && runControl) {
    sendJson(res, 200, controlRun(harness, decodeURIComponent(runControl[1]), runControl[2]));
    return true;
  }

  const sessionEvents = pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
  if (method === 'GET' && sessionEvents) {
    const sessionId = decodeURIComponent(sessionEvents[1]);
    if (!db.getSession(sessionId)) {
      sendJson(res, 404, { error: 'Chat không tồn tại' });
      return true;
    }
    const lastEventId = String(req.headers['last-event-id'] || '');
    if (lastEventId && !lastEventId.startsWith(`${sessionId}:`)) {
      sendJson(res, 400, { error: 'Cursor không thuộc chat' });
      return true;
    }
    const afterSeq = Number(parsedUrl.searchParams.get('afterSeq') || lastEventId.slice(sessionId.length + 1) || 0);
    const limit = Number(parsedUrl.searchParams.get('limit') || 500);
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) {
      sendJson(res, 400, { error: 'Cursor không hợp lệ' });
      return true;
    }
    const log = harness.sessions.log;
    if (parsedUrl.searchParams.get('stream') !== '1') {
      sendJson(res, 200, {
        events: log.read(sessionId, { afterSeq, limit }),
        latestSeq: log.sequence(sessionId),
        revision: log.revision(sessionId)
      });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    trackStream(res);
    const cleanup = subscribeSession(log, sessionId, afterSeq, (event) => {
      res.write(`id: ${sessionId}:${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    req.on('close', cleanup);
    res.on('close', cleanup);
    return true;
  }

  if (method === 'GET' && pathname === '/api/harness') {
    await harness.ready;
    sendJson(res, 200, {
      userInputVersion: harness.userInputs ? 1 : null,
      plugins: harness.list(),
      config: harness.config,
      ptc: await harness.ptc.probe(),
      recoveredRuns: harness.recoveredRuns
    });
    return true;
  }

  return false;
}
