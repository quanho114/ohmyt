import http from 'node:http';
import { URL } from 'node:url';
import { isDocumentViewerAsset } from '../shared/document_viewer_policy.js';
import { DocumentContexts } from './document_context.js';
import { BrowserIntegration } from './browser_integration.js';
import { sendJson, serveStaticAsset } from './api/http_utils.js';
import { handleHarnessRoutes } from './api/harness_routes.js';
import { handleBrowserAndMediaRoutes } from './api/browser_and_media_routes.js';
import { handleSessionsAndProjectsRoutes } from './api/sessions_and_projects_routes.js';
import { handleRunsRoutes } from './api/runs_routes.js';
import { handleKnowledgeAndProvidersRoutes } from './api/knowledge_and_providers_routes.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ROUTE_HANDLERS = [
  handleHarnessRoutes,
  handleBrowserAndMediaRoutes,
  handleSessionsAndProjectsRoutes,
  handleRunsRoutes,
  handleKnowledgeAndProvidersRoutes
];

export function createApiServer({
  db,
  tools,
  permissions,
  skills,
  llm,
  agentLoop,
  registry = null,
  gateway = null,
  vault = null,
  webSearch = null,
  browserBridge = null,
  browserUse = null,
  stt = null,
  port = 3188,
  authToken = null
}) {
  const browserIntegration = browserUse
    ? new BrowserIntegration({ runtime: browserUse, tools, db, permissions, agentLoop, gateway, llm })
    : null;
  const sseClients = new Map(); // runId -> Set<res>
  const streamResponses = new Set();
  const trackStream = (res) => {
    streamResponses.add(res);
    res.once('close', () => streamResponses.delete(res));
    res.flushHeaders();
  };
  const queuedSessionRuns = new Set();
  agentLoop.documentContexts ||= new DocumentContexts();

  // Forward agent loop events to connected SSE clients
  agentLoop.on('event', ({ runId, eventId, sequence, type, payload }) => {
    if (!sseClients.has(runId)) return;
    const set = sseClients.get(runId);
    const data = `id: ${eventId}\ndata: ${JSON.stringify({ eventId, sequence, type, payload })}\n\n`;
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
  });

  const routeContext = {
    db,
    tools,
    permissions,
    skills,
    llm,
    agentLoop,
    registry,
    gateway,
    vault,
    webSearch,
    browserBridge,
    browserUse,
    browserIntegration,
    stt,
    port,
    sseClients,
    trackStream,
    queuedSessionRuns
  };

  const server = http.createServer(async (req, res) => {
    req.on('error', () => {});
    res.on('error', () => {});

    const listeningAddress = server.address();
    const listeningPort = String(
      typeof listeningAddress === 'object' && listeningAddress ? listeningAddress.port : port
    );
    let requestHost;
    try {
      requestHost = new URL(`http://${req.headers.host || ''}`);
    } catch {
      return sendJson(res, 400, { error: 'Invalid Host header' });
    }
    if (!LOCAL_HOSTS.has(requestHost.hostname) || (requestHost.port && requestHost.port !== listeningPort)) {
      return sendJson(res, 403, { error: 'Host is not allowed' });
    }

    if (authToken && req.url.startsWith('/api/')) {
      const candidate = req.headers.authorization;
      const streamToken = new URL(req.url, 'http://localhost').searchParams.get('token');
      const stream = /^\/api\/runs\/[^/]+\/stream(?:\?|$)/.test(req.url);
      if (candidate !== `Bearer ${authToken}` && !(stream && streamToken === authToken) && req.method !== 'OPTIONS') {
        return sendJson(res, 401, { error: 'Local runtime authentication required' });
      }
    }

    const origin = req.headers.origin;
    const publicPreviewAsset =
      origin === 'null' &&
      ['GET', 'HEAD'].includes(req.method) &&
      isDocumentViewerAsset(new URL(req.url, 'http://localhost').pathname);
    if (publicPreviewAsset) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin) {
      let parsedOrigin;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        return sendJson(res, 403, { error: 'Origin is not allowed' });
      }
      const originPort = parsedOrigin.port || '80';
      if (
        parsedOrigin.protocol !== 'http:' ||
        !LOCAL_HOSTS.has(parsedOrigin.hostname) ||
        ![listeningPort, '5173'].includes(originPort)
      ) {
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
    const reqMeta = { method, pathname, parsedUrl, requestHost, publicPreviewAsset };

    try {
      if (serveStaticAsset(res, reqMeta)) {
        return;
      }
      for (const handler of ROUTE_HANDLERS) {
        if (await handler(routeContext, req, res, reqMeta)) {
          return;
        }
      }
      return sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
    } catch (err) {
      console.error('API Error:', err);
      const status =
        err.statusCode ||
        (/busy|active runs|changing plugins/i.test(err.message)
          ? 409
          : /Invalid arguments|Invalid profile|Unknown profile/i.test(err.message)
            ? 400
            : 500);
      return sendJson(res, status, { error: err.message });
    }
  });

  return {
    server,
    listen: (customPort = port) =>
      new Promise((resolve, reject) => {
        server.listen(customPort, '127.0.0.1', () => resolve(server.address()));
        server.once('error', reject);
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        for (const response of streamResponses) {
          const socket = response.socket;
          response.end(() => socket?.end());
        }
      })
  };
}
