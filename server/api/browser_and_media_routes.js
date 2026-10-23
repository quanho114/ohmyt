import { BrowserSubagent } from '../browser_integration.js';
import { MAX_BROWSER_FILE } from '../browser_files.js';
import { chromeExtensionArchive } from '../chrome_extension_package.js';
import { kindForLanguage, normalizeLanguage } from '../stt.js';
import { sendJson, parseBody, parseBinary } from './http_utils.js';

export async function handleBrowserAndMediaRoutes(ctx, req, res, { method, pathname, parsedUrl }) {
  const { db, agentLoop, browserIntegration, browserUse, webSearch, browserBridge, stt, trackStream } = ctx;

  if (browserIntegration && method === 'POST' && ['/api/browser-use/mcp', '/api/browser-use/workflow'].includes(pathname)) {
    const sessionId = parsedUrl.searchParams.get('sessionId');
    const runId = parsedUrl.searchParams.get('runId');
    const body = await parseBody(req);
    if (pathname.endsWith('/mcp')) {
      const result = await browserIntegration.rpc(body, { sessionId, runId });
      if (result) sendJson(res, 200, result);
      else {
        res.writeHead(204);
        res.end();
      }
      return true;
    }
    try {
      const context = browserIntegration.context(runId, sessionId);
      const subagent = new BrowserSubagent(browserIntegration, {
        maxSteps: body.maxSteps ?? 5,
        planner: (options) => browserIntegration.planStep({ ...options, runId, sessionId })
      });
      const result = await subagent.run({
        steps: body.steps,
        task: body.task,
        runId,
        sessionId,
        signal: context.signal
      });
      sendJson(res, 200, result);
    } catch {
      sendJson(res, 409, { error: 'Browser workflow denied, stopped or failed; check parent run.' });
    }
    return true;
  }

  if (pathname.startsWith('/api/browser-use/runs') && browserUse) {
    const sessionId = parsedUrl.searchParams.get('sessionId');
    if (!sessionId || !db.getSession(sessionId) || db.getSession(sessionId).project_id) {
      sendJson(res, 403, { error: 'Unknown browser chat' });
      return true;
    }
    if (pathname === '/api/browser-use/runs' && method === 'GET') {
      sendJson(res, 200, { runs: browserUse.status(sessionId) });
      return true;
    }
    const match = pathname.match(/^\/api\/browser-use\/runs\/([^/]+)\/(control|events)$/);
    if (match) {
      try {
        if (match[2] === 'control' && method === 'POST') {
          const body = await parseBody(req);
          sendJson(res, 200, { runs: await browserUse.control(decodeURIComponent(match[1]), sessionId, body.action) });
          return true;
        }
        if (match[2] === 'events' && method === 'GET') {
          const runId = decodeURIComponent(match[1]);
          const events = browserUse.trace.read(runId, sessionId, Number(parsedUrl.searchParams.get('after') || 0));
          if (parsedUrl.searchParams.get('stream') !== '1') {
            sendJson(res, 200, { events });
            return true;
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive'
          });
          trackStream(res);
          const send = (event) => res.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          for (const event of events) send(event);
          if (events.at(-1)?.type === 'closed') {
            res.end();
            return true;
          }
          const listener = (event) => {
            if (event.runId === runId && event.sessionId === sessionId) {
              send(event);
              if (event.type === 'closed') res.end();
            }
          };
          const timer = setInterval(() => res.write(': heartbeat\n\n'), 15000);
          browserUse.trace.on('event', listener);
          res.once('close', () => {
            clearInterval(timer);
            browserUse.trace.removeListener('event', listener);
          });
          return true;
        }
      } catch (error) {
        sendJson(res, 409, { error: error.message });
        return true;
      }
    }
  }

  if (pathname.startsWith('/api/browser-use/files') && browserUse?.files) {
    const sessionId = parsedUrl.searchParams.get('sessionId');
    try {
      if (pathname === '/api/browser-use/files') {
        if (method === 'GET') {
          sendJson(res, 200, { files: browserUse.files.list(sessionId) });
          return true;
        }
        if (method === 'POST') {
          const name = decodeURIComponent(req.headers['x-file-name'] || 'file');
          const bytes = await parseBinary(req, MAX_BROWSER_FILE);
          const added = await browserUse.files.add(
            sessionId,
            name,
            bytes,
            req.headers['x-file-type'] || 'application/octet-stream'
          );
          sendJson(res, 201, added);
          return true;
        }
      }
      const match = pathname.match(/^\/api\/browser-use\/files\/([0-9a-f-]{36})(\/content)?$/);
      if (match && method === 'GET' && match[2]) {
        const { metadata, bytes } = await browserUse.files.read(sessionId, match[1]);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': bytes.length,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        });
        res.end(bytes);
        return true;
      }
      if (match && method === 'DELETE' && !match[2]) {
        await browserUse.files.remove(sessionId, match[1]);
        sendJson(res, 200, { success: true });
        return true;
      }
      sendJson(res, 404, { error: 'File endpoint not found' });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
  }

  if (pathname === '/api/browser-use/config' && browserUse) {
    if (method === 'GET') {
      sendJson(res, 200, await browserUse.publicConfig());
      return true;
    }
    if (method === 'PUT') {
      if (agentLoop.activeRuns.size) {
        sendJson(res, 409, { error: 'Đợi tác vụ AI kết thúc trước khi đổi cấu hình Browser Use.' });
        return true;
      }
      try {
        const patch = await parseBody(req);
        if (agentLoop.activeRuns.size) {
          throw new Error('Đợi tác vụ AI kết thúc trước khi đổi cấu hình Browser Use.');
        }
        sendJson(res, 200, await browserUse.saveSettings(patch));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return true;
    }
  }

  if (pathname === '/api/web-search/config' && webSearch) {
    if (method === 'GET') {
      sendJson(res, 200, webSearch.publicConfig());
      return true;
    }
    if (method === 'PUT') {
      try {
        sendJson(res, 200, webSearch.save(await parseBody(req)));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return true;
    }
  }

  if (pathname === '/api/web-search/test' && method === 'POST' && webSearch) {
    const body = await parseBody(req);
    try {
      sendJson(res, 200, { connected: true, ...(await webSearch.search('web search', { provider: body.provider })) });
    } catch (error) {
      sendJson(res, 200, { connected: false, message: error.message });
    }
    return true;
  }

  if (pathname.startsWith('/api/chrome/')) {
    if (method === 'GET' && pathname === '/api/chrome/extension') {
      const bytes = chromeExtensionArchive();
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="ohmyt-chrome.zip"',
        'Content-Length': bytes.length,
        'Cache-Control': 'no-store'
      });
      res.end(bytes);
      return true;
    }
    if (!browserBridge) {
      sendJson(res, 503, { error: 'Khởi động lại ohmyt để dùng kết nối Chrome.' });
      return true;
    }
    if (method === 'GET' && pathname === '/api/chrome/status') {
      sendJson(res, 200, browserBridge.status(parsedUrl.searchParams.get('sessionId')));
      return true;
    }
    if (method === 'POST' && pathname === '/api/chrome/pairing') {
      sendJson(res, 200, await browserBridge.pairing());
      return true;
    }
    if (method === 'POST' && pathname === '/api/chrome/disconnect') {
      browserBridge.disconnect();
      sendJson(res, 200, { success: true });
      return true;
    }
    if (method === 'GET' && pathname === '/api/chrome/tabs') {
      sendJson(res, 200, await browserBridge.command('tabs'));
      return true;
    }
    if (method === 'POST' && pathname === '/api/chrome/share') {
      const body = await parseBody(req);
      if (typeof body.sessionId !== 'string' || !db.getSession(body.sessionId)) {
        sendJson(res, 404, { error: 'Cuộc trò chuyện không tồn tại.' });
        return true;
      }
      if (!Array.isArray(body.tabIds) || body.tabIds.length > 30 || body.tabIds.some((id) => !Number.isInteger(id) || id < 0)) {
        sendJson(res, 400, { error: 'Danh sách tab không hợp lệ.' });
        return true;
      }
      if (!body.tabIds.length) {
        browserBridge.revoke(body.sessionId);
        sendJson(res, 200, browserBridge.status(body.sessionId));
        return true;
      }
      sendJson(res, 200, await browserBridge.share(body.sessionId, [...new Set(body.tabIds)]));
      return true;
    }
  }

  if (pathname.startsWith('/api/stt/')) {
    if (!stt) {
      sendJson(res, 503, { error: 'Khởi động lại ohmyt để dùng nhập giọng nói.' });
      return true;
    }
    if (method === 'GET' && pathname === '/api/stt/status') {
      sendJson(res, 200, stt.status());
      return true;
    }
    if (method === 'POST' && pathname === '/api/stt/ensure') {
      const body = await parseBody(req).catch(() => ({}));
      const kind = kindForLanguage(normalizeLanguage(body && body.language));
      stt.ensure(kind).catch(() => {});
      sendJson(res, 200, stt.status());
      return true;
    }
    if (method === 'POST' && pathname === '/api/stt/transcribe') {
      const language = normalizeLanguage(parsedUrl.searchParams.get('language'));
      let wav;
      try {
        wav = await parseBinary(req);
      } catch {
        sendJson(res, 400, { error: 'File âm thanh quá lớn (tối đa ~8MB).' });
        return true;
      }
      try {
        sendJson(res, 200, await stt.transcribe(language, wav));
      } catch (error) {
        if (error && error.code === 'STT_DOWNLOADING') {
          sendJson(res, 503, {
            error: error.message,
            downloading: true,
            kind: error.kind,
            progress: error.progress ?? null
          });
          return true;
        }
        if (error && error.code === 'STT_BAD_AUDIO') {
          sendJson(res, 400, { error: error.message });
          return true;
        }
        throw error;
      }
      return true;
    }
    sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
    return true;
  }

  return false;
}
