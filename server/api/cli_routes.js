import {randomUUID} from 'node:crypto';
import {sendJson} from './http_utils.js';

// Runtime identity is process-local; reconnect must never silently target a restart.
export function createRuntimeIdentity() {return {instanceId: randomUUID(), protocolVersion: 1};}

export async function handleCliRoutes(ctx, _req, res, {method, pathname}) {
  if (method !== 'GET') return false;
  const {db, agentLoop, permissions} = ctx;
  if (pathname === '/api/runtime') {
    sendJson(res, 200, {...ctx.runtimeIdentity, capabilities: {submissions: true, approvals: true, userInput: true, runStream: true, nativeBrowser: Boolean(ctx.browserBridge?.nativeCommand)}});
    return true;
  }
  const pending = pathname.match(/^\/api\/runs\/([^/]+)\/(approvals|result)$/);
  if (pending) {
    const runId = decodeURIComponent(pending[1]);
    const run = db.db.prepare('SELECT * FROM runs WHERE id=?').get(runId);
    if (!run) sendJson(res, 404, {error: 'Run unavailable'});
    else if (pending[2] === 'result') sendJson(res, 200, runResult(ctx, run));
    else {
      // Child session records retain the parent run, not merely the parent chat.
      const ids = new Set(db.db.prepare(`WITH RECURSIVE descendants(id) AS (
        SELECT ? UNION SELECT r.id FROM harness_children c
        JOIN descendants d ON c.parent_run_id=d.id JOIN runs r ON r.session_id=c.session_id
      ) SELECT id FROM descendants`).all(runId).map(row => row.id));
      sendJson(res, 200, {requests: permissions.getPendingRequests().filter(request => ids.has(request.runId)), userInputs: agentLoop.harness.userInputs.list(run.session_id).filter(request => ids.has(request.runId))});
    }
    return true;
  }
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/submissions\/([^/]+)$/);
  if (!match) return false;
  const sessionId = decodeURIComponent(match[1]);
  const item = agentLoop.harness.inbox.findSubmission(sessionId, decodeURIComponent(match[2]));
  if (!item) {sendJson(res, 404, {error: 'Submission unavailable'}); return true;}
  // The queue naming scheme stays private to the backend. It is durable and also
  // resolves historical inbox rows without a destructive migration.
  const run = db.db.prepare('SELECT * FROM runs WHERE id=? AND session_id=?').get(`run_queue_${item.id}`, sessionId);
  sendJson(res, 200, {
    submissionId: item.id, clientMessageId: item.clientMessageId, sessionId,
    ...(run ? runResult(ctx, run) : {status: item.status === 'cancelled' ? 'cancelled' : 'queued', runId: null, settled: item.status === 'cancelled', outcome: null, answer: null})
  });
  return true;
}

function runResult({agentLoop}, run) {
  const active = agentLoop.activeRuns.has(run.id) || agentLoop.harness.agents.findRun(run.id);
  const terminal = ['completed', 'failed', 'aborted', 'interrupted'].includes(run.status);
  const turn = agentLoop.harness.sessions.get(run.id);
  const final = turn?.messages.findLast(message => message.role === 'assistant' && !message.tool_calls?.length);
  return {sessionId: run.session_id, runId: run.id, status: terminal ? run.status : 'running', settled: Boolean(terminal && !active), outcome: agentLoop.harness.sessions.outcome(run.id), answer: terminal ? final?.content || '' : null};
}
