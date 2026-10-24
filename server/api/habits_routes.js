import { sendJson, parseBody } from './http_utils.js';

export async function handleHabitsRoutes(ctx, req, res, { method, pathname }) {
  const { db, habits, agentLoop } = ctx;

  if (method === 'GET' && pathname === '/api/habits') {
    sendJson(res, 200, { habits: db.listHabits() });
    return true;
  }

  if (method === 'POST' && pathname === '/api/habits') {
    if (agentLoop.harness?.closed || agentLoop.harness?.closing || agentLoop.harness?.changingPlugins) {
      sendJson(res, 409, { error: 'Runtime đang dừng hoặc đổi plugin. Thử lại sau.' });
      return true;
    }
    const body = await parseBody(req);
    try {
      sendJson(res, 200, habits.createHabit(body));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  const match = pathname.match(/^\/api\/habits\/([^/]+?)(\/run)?$/);
  if (!match) return false;
  const habitId = decodeURIComponent(match[1]);
  const closing = agentLoop.harness?.closed || agentLoop.harness?.closing || agentLoop.harness?.changingPlugins;

  if (method === 'GET') {
    const habit = db.getHabit(habitId);
    if (!habit) { sendJson(res, 404, { error: 'Habit not found' }); return true; }
    sendJson(res, 200, habit);
    return true;
  }

  if (method === 'PATCH') {
    const body = await parseBody(req);
    try {
      sendJson(res, 200, habits.updateHabit(habitId, body));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (method === 'DELETE') {
    db.deleteHabit(habitId);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === 'POST' && match[2] === '/run') {
    if (closing) {
      sendJson(res, 409, { error: 'Runtime đang dừng hoặc đổi plugin. Thử lại sau.' });
      return true;
    }
    try {
      sendJson(res, 200, { inboxItem: habits.runNow(habitId) });
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return true;
  }

  return false;
}
