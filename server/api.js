import {controlRun} from './harness/controls.js';
import {subscribeSession} from './harness/client_events.js';
import { BrowserIntegration, BrowserSubagent } from './browser_integration.js';
import { MAX_BROWSER_FILE } from './browser_files.js';
import {validateImages} from './image_attachments.js';
import {assertProjectRoot, rootIdentity, overlaps} from './project_scope.js';
import {validApprovalMode} from './approval_modes.js';
import crypto from 'node:crypto';
import { isDefaultTitle, fallbackTitle, hasTopic, GREETING_TITLE } from './session_titles.js';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { chromeExtensionArchive } from './chrome_extension_package.js';
import { kindForLanguage, normalizeLanguage } from './stt.js';

export function createApiServer({ db, tools, permissions, skills, llm, agentLoop, registry = null, gateway = null, vault = null, webSearch = null, browserBridge = null, browserUse = null, stt = null, port = 3188, authToken = null }) {
  const browserIntegration=browserUse?new BrowserIntegration({runtime:browserUse,tools,db,permissions,agentLoop,gateway,llm}):null;
  const sseClients = new Map(); // runId -> Set<res>
  const queuedSessionRuns = new Set();

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
      let body = ''; let bytes = 0; let tooLarge = false;
      req.on('data', chunk => {bytes += chunk.length;if(bytes > 24 * 1024 * 1024){tooLarge=true;return;}body += chunk;});
      req.on('end', () => {
        if(tooLarge){reject(new Error('Payload quá lớn'));return;}
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  };
  const parseBinary = (req, maxBytes = 8 * 1024 * 1024) => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let tooLarge = false;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          tooLarge = true;
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (tooLarge) reject(new Error('Payload quá lớn'));
        else resolve(Buffer.concat(chunks));
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
      if(pathname==='/api/connectors'&&agentLoop.harness?.connectors){if(method==='GET')return sendJson(res,200,{connectors:agentLoop.harness.connectors.list()});if(method==='PUT')return sendJson(res,200,agentLoop.harness.connectors.add(await parseBody(req)));}
      const childRoute=pathname.match(/^\/api\/runs\/([^/]+)\/subagents(?:\/([^/]+)\/(cancel|result))?$/);
      if(childRoute&&agentLoop.harness){const parentId=decodeURIComponent(childRoute[1]);
        if(method==='GET'&&!childRoute[2]){const rows=db.db.prepare('SELECT c.*,r.status FROM harness_children c LEFT JOIN runs r ON r.session_id=c.session_id WHERE c.parent_run_id=?').all(parentId);return sendJson(res,200,{children:rows.map(row=>({id:row.child_id,sessionId:row.session_id,task:db.getSession(row.session_id)?.title || '',state:row.status || 'running'}))});}
        if(childRoute[2]){const childId=decodeURIComponent(childRoute[2]);if(method==='POST'&&childRoute[3]==='cancel'){agentLoop.harness.subagents.cancel(childId,parentId);return sendJson(res,200,{success:true});}if(method==='GET'&&childRoute[3]==='result'){const child=db.db.prepare('SELECT * FROM harness_children WHERE child_id=? AND parent_run_id=?').get(childId,parentId);if(!child)return sendJson(res,404,{error:'Child unavailable'});return sendJson(res,200,{messages:db.getMessages(child.session_id).map(m=>({sender:m.sender,content:m.content}))});}}
      }

      const connectorAction=pathname.match(/^\/api\/connectors\/([^/]+)\/(test|connect|disconnect)$/);
      if(method==='POST'&&connectorAction&&agentLoop.harness?.connectors)return sendJson(res,200,await agentLoop.harness.connectors[connectorAction[2]](decodeURIComponent(connectorAction[1])));

      const artifactRoute=pathname.match(/^\/api\/artifacts\/([^/]+)$/);
      if(method==='GET'&&artifactRoute&&agentLoop.harness)return sendJson(res,200,agentLoop.harness.artifacts.get(decodeURIComponent(artifactRoute[1]),parsedUrl.searchParams.get('sessionId')));
      const diagnosticsRoute=pathname.match(/^\/api\/runs\/([^/]+)\/diagnostics$/);
      if(method==='GET'&&diagnosticsRoute&&agentLoop.harness){const run=db.db.prepare('SELECT * FROM runs WHERE id=?').get(decodeURIComponent(diagnosticsRoute[1]));if(!run)return sendJson(res,404,{error:'Run unavailable'});const events=agentLoop.harness.sessions.log.readAll(run.session_id).filter(e=>e.payload.turnId===run.id&&['attempt/start','attempt/end','turn/end','context/summary'].includes(e.type)).map(e=>({...e,payload:Object.fromEntries(Object.entries(e.payload).filter(([key])=>!['facts','content','error','arguments','message'].includes(key)))}));return sendJson(res,200,{runId:run.id,status:run.status,events});}

      if(agentLoop.harness&&pathname==='/api/extensions'&&method==='GET')return sendJson(res,200,{extensions:agentLoop.harness.extensions.list()});
      const extensionRoute=pathname.match(/^\/api\/extensions\/([^/]+)$/);
      if(extensionRoute&&agentLoop.harness){
        const id=decodeURIComponent(extensionRoute[1]);
        if(method==='GET'){const item=agentLoop.harness.extensions.get(id);return sendJson(res,item?200:404,item || {error:'Extension unavailable'});}
        if(method==='PATCH')return sendJson(res,200,await agentLoop.harness.extensions.update(id,await parseBody(req)));
      }
      if(pathname==='/api/agent-presets'&&agentLoop.harness){
        if(method==='GET')return sendJson(res,200,{presets:agentLoop.harness.profiles.list(),selectedId:agentLoop.harness.profiles.selectedId(parsedUrl.searchParams.get('sessionId'))});
        if(method==='PUT'){const body=await parseBody(req);return sendJson(res,200,body.selectedId?agentLoop.harness.profiles.select(body.selectedId,{sessionId:body.sessionId,projectId:body.projectId}):agentLoop.harness.profiles.save(body.profile,body.expectedRevision));}
      }

      const inboxRoute=pathname.match(/^\/api\/sessions\/([^/]+)\/inbox(?:\/([^/]+))?$/);
      if(inboxRoute&&agentLoop.harness){
        const sessionId=decodeURIComponent(inboxRoute[1]),inbox=agentLoop.harness.inbox;
        if(!db.getSession(sessionId))return sendJson(res,404,{error:'Chat không tồn tại'});
        if(method==='GET'){const handle=agentLoop.harness.agents.list().find(h=>h.sessionId===sessionId&&h.runId);return sendJson(res,200,{messages:inbox.list(sessionId),activeRunId:handle?.runId || null,state:handle?.state || 'idle'});}
        if(inboxRoute[2]){
          const id=decodeURIComponent(inboxRoute[2]);if(inbox.get(id)?.sessionId!==sessionId)return sendJson(res,404,{error:'Message không thuộc chat'});
          if(method==='PATCH'){
            const body=await parseBody(req);
            if(body.kind!==undefined){
              if(body.kind==='steering')return sendJson(res,200,agentLoop.sendInboxNow(sessionId,id));
              const handle=agentLoop.harness.agents.list().find(h=>h.sessionId===sessionId&&h.runId);
              // When the current run has finished, send the existing queued item as a new turn.
              const kind=body.kind==='steering'&&!handle?'queued':body.kind;
              const item=inbox.setPendingKind(id,kind,handle?.runId);
              if(item.kind==='queued')agentLoop.pumpInbox(sessionId);
              return sendJson(res,200,item);
            }
            return sendJson(res,200,inbox.editPending(id,body.content));
          }
          if(method==='DELETE'){inbox.cancelPending(id);return sendJson(res,200,{success:true});}
        }else if(method==='POST'){
          const body=await parseBody(req);if(body.kind==='steering'&&!agentLoop.harness.agents.sessionOwners.has(sessionId))return sendJson(res,409,{error:'Tác vụ đã kết thúc. Gửi yêu cầu mới.'});
          const item=inbox.enqueue({...body,sessionId,targetRunId:body.kind==='steering'?agentLoop.harness.agents.list().find(h=>h.sessionId===sessionId&&h.runId)?.runId:null});if(item.kind==='queued')agentLoop.pumpInbox(sessionId);return sendJson(res,202,item);
        }
      }
      const runControl=pathname.match(/^\/api\/runs\/([^/]+)\/(pause|resume)$/);
      if(method==='POST'&&runControl&&agentLoop.harness)return sendJson(res,200,controlRun(agentLoop.harness,decodeURIComponent(runControl[1]),runControl[2]));

      const sessionEvents=pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
      if(method==='GET'&&sessionEvents&&agentLoop.harness){
        const sessionId=decodeURIComponent(sessionEvents[1]);if(!db.getSession(sessionId))return sendJson(res,404,{error:'Chat không tồn tại'});
        const lastEventId=String(req.headers['last-event-id'] || '');if(lastEventId&&!lastEventId.startsWith(`${sessionId}:`))return sendJson(res,400,{error:'Cursor không thuộc chat'});
        const afterSeq=Number(parsedUrl.searchParams.get('afterSeq') || lastEventId.slice(sessionId.length+1) || 0),limit=Number(parsedUrl.searchParams.get('limit') || 500);
        if(!Number.isSafeInteger(afterSeq)||afterSeq<0||!Number.isSafeInteger(limit)||limit<1||limit>10000)return sendJson(res,400,{error:'Cursor không hợp lệ'});
        const log=agentLoop.harness.sessions.log;
        if(parsedUrl.searchParams.get('stream')!=='1')return sendJson(res,200,{events:log.read(sessionId,{afterSeq,limit}),latestSeq:log.sequence(sessionId),revision:log.revision(sessionId)});
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
        const cleanup=subscribeSession(log,sessionId,afterSeq,event=>res.write(`id: ${sessionId}:${event.seq}\ndata: ${JSON.stringify(event)}\n\n`));
        req.on('close',cleanup);res.on('close',cleanup);return;
      }

      if (method === 'GET' && pathname === '/api/harness' && agentLoop.harness) {
        await agentLoop.harness.ready;
        return sendJson(res, 200, {plugins:agentLoop.harness.list(),config:agentLoop.harness.config,ptc:await agentLoop.harness.ptc.probe(),recoveredRuns:agentLoop.harness.recoveredRuns});
      }
      if(browserIntegration && method==='POST' && ['/api/browser-use/mcp','/api/browser-use/workflow'].includes(pathname)){
        const sessionId=parsedUrl.searchParams.get('sessionId'),runId=parsedUrl.searchParams.get('runId');
        const body=await parseBody(req);
        if(pathname.endsWith('/mcp')){const result=await browserIntegration.rpc(body,{sessionId,runId});return result?sendJson(res,200,result):(res.writeHead(204),res.end());}
        try{const context=browserIntegration.context(runId,sessionId);const result=await new BrowserSubagent(browserIntegration,{maxSteps:body.maxSteps??5,planner:options=>browserIntegration.planStep({...options,runId,sessionId})}).run({steps:body.steps,task:body.task,runId,sessionId,signal:context.signal});return sendJson(res,200,result);}
        catch{return sendJson(res,409,{error:'Browser workflow denied, stopped or failed; check parent run.'});}
      }
      if (pathname.startsWith('/api/browser-use/runs') && browserUse) {
        const sessionId=parsedUrl.searchParams.get('sessionId');
        if(!sessionId||!db.getSession(sessionId)||db.getSession(sessionId).project_id)return sendJson(res,403,{error:'Unknown browser chat'});
        if(pathname==='/api/browser-use/runs'&&method==='GET')return sendJson(res,200,{runs:browserUse.status(sessionId)});
        const match=pathname.match(/^\/api\/browser-use\/runs\/([^/]+)\/(control|events)$/);
        if(match){try{
          if(match[2]==='control'&&method==='POST'){const body=await parseBody(req);return sendJson(res,200,{runs:await browserUse.control(decodeURIComponent(match[1]),sessionId,body.action)});}
          if(match[2]==='events'&&method==='GET'){
            const runId=decodeURIComponent(match[1]),events=browserUse.trace.read(runId,sessionId,Number(parsedUrl.searchParams.get('after')||0));
            if(parsedUrl.searchParams.get('stream')!=='1')return sendJson(res,200,{events});
            res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});
            const send=event=>res.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            for(const event of events)send(event);
            if(events.at(-1)?.type==='closed')return res.end();
            const listener=event=>{if(event.runId===runId&&event.sessionId===sessionId){send(event);if(event.type==='closed')res.end();}};
            const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);
            browserUse.trace.on('event',listener);res.once('close',()=>{clearInterval(timer);browserUse.trace.removeListener('event',listener);});return;
          }
        }catch(error){return sendJson(res,409,{error:error.message});}}
      }
      if (pathname.startsWith('/api/browser-use/files') && browserUse?.files) {
        const sessionId = parsedUrl.searchParams.get('sessionId');
        try {
          if (pathname === '/api/browser-use/files') {
            if (method === 'GET') return sendJson(res, 200, { files: browserUse.files.list(sessionId) });
            if (method === 'POST') {
              const name = decodeURIComponent(req.headers['x-file-name'] || 'file');
              const bytes = await parseBinary(req, MAX_BROWSER_FILE);
              return sendJson(res, 201, await browserUse.files.add(sessionId, name, bytes, req.headers['x-file-type'] || 'application/octet-stream'));
            }
          }
          const match = pathname.match(/^\/api\/browser-use\/files\/([0-9a-f-]{36})(\/content)?$/);
          if (match && method === 'GET' && match[2]) {
            const { metadata, bytes } = await browserUse.files.read(sessionId, match[1]);
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
            return res.end(bytes);
          }
          if (match && method === 'DELETE' && !match[2]) {
            await browserUse.files.remove(sessionId, match[1]);return sendJson(res, 200, { success: true });
          }
          return sendJson(res, 404, { error: 'File endpoint not found' });
        } catch (error) { return sendJson(res, 400, { error: error.message }); }
      }
      if (pathname === '/api/browser-use/config' && browserUse) {
        if (method === 'GET') return sendJson(res, 200, await browserUse.publicConfig());
        if (method === 'PUT') {
          if (agentLoop.activeRuns.size) return sendJson(res, 409, { error: 'Đợi tác vụ AI kết thúc trước khi đổi cấu hình Browser Use.' });
          try { return sendJson(res, 200, await (async () => { const patch = await parseBody(req); if (agentLoop.activeRuns.size) throw new Error('Đợi tác vụ AI kết thúc trước khi đổi cấu hình Browser Use.'); return browserUse.saveSettings(patch); })()); }
          catch (error) { return sendJson(res, 400, { error: error.message }); }
        }
      }
      if (pathname === '/api/web-search/config' && webSearch) {
        if (method === 'GET') return sendJson(res, 200, webSearch.publicConfig());
        if (method === 'PUT') {
          try { return sendJson(res, 200, webSearch.save(await parseBody(req))); }
          catch (error) { return sendJson(res, 400, { error: error.message }); }
        }
      }
      if (pathname === '/api/web-search/test' && method === 'POST' && webSearch) {
        const body = await parseBody(req);
        try { return sendJson(res, 200, { connected: true, ...await webSearch.search('web search', { provider: body.provider }) }); }
        catch (error) { return sendJson(res, 200, { connected: false, message: error.message }); }
      }
    if (pathname.startsWith('/api/chrome/')) {
      if (method === 'GET' && pathname === '/api/chrome/extension') {
        const bytes = chromeExtensionArchive();
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="ohmyt-chrome.zip"', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
        return res.end(bytes);
      }
      if (!browserBridge) return sendJson(res, 503, { error: 'Khởi động lại ohmyt để dùng kết nối Chrome.' });
      if (method === 'GET' && pathname === '/api/chrome/status') return sendJson(res, 200, browserBridge.status(parsedUrl.searchParams.get('sessionId')));
      if (method === 'POST' && pathname === '/api/chrome/pairing') return sendJson(res, 200, await browserBridge.pairing());
      if (method === 'POST' && pathname === '/api/chrome/disconnect') { browserBridge.disconnect(); return sendJson(res, 200, { success: true }); }
      if (method === 'GET' && pathname === '/api/chrome/tabs') return sendJson(res, 200, await browserBridge.command('tabs'));
      if (method === 'POST' && pathname === '/api/chrome/share') {
        const body = await parseBody(req);
        if (typeof body.sessionId !== 'string' || !db.getSession(body.sessionId)) return sendJson(res, 404, { error: 'Cuộc trò chuyện không tồn tại.' });
        if (!Array.isArray(body.tabIds) || body.tabIds.length > 30 || body.tabIds.some(id => !Number.isInteger(id) || id < 0)) return sendJson(res, 400, { error: 'Danh sách tab không hợp lệ.' });
        if (!body.tabIds.length) { browserBridge.revoke(body.sessionId); return sendJson(res, 200, browserBridge.status(body.sessionId)); }
        return sendJson(res, 200, await browserBridge.share(body.sessionId, [...new Set(body.tabIds)]));
      }
    }
    if (pathname.startsWith('/api/stt/')) {
      if (!stt) return sendJson(res, 503, { error: 'Khởi động lại ohmyt để dùng nhập giọng nói.' });
      if (method === 'GET' && pathname === '/api/stt/status') return sendJson(res, 200, stt.status());
      if (method === 'POST' && pathname === '/api/stt/ensure') {
        const body = await parseBody(req).catch(() => ({}));
        const kind = kindForLanguage(normalizeLanguage(body && body.language));
        stt.ensure(kind).catch(() => {});
        return sendJson(res, 200, stt.status());
      }
      if (method === 'POST' && pathname === '/api/stt/transcribe') {
        const language = normalizeLanguage(parsedUrl.searchParams.get('language'));
        let wav;
        try {
          wav = await parseBinary(req);
        } catch {
          return sendJson(res, 400, { error: 'File âm thanh quá lớn (tối đa ~8MB).' });
        }
        try {
          return sendJson(res, 200, await stt.transcribe(language, wav));
        } catch (error) {
          if (error && error.code === 'STT_DOWNLOADING') {
            return sendJson(res, 503, { error: error.message, downloading: true, kind: error.kind, progress: error.progress ?? null });
          }
          if (error && error.code === 'STT_BAD_AUDIO') return sendJson(res, 400, { error: error.message });
          throw error;
        }
      }
      return sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
    }

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
      const projectPermissions = pathname.match(/^\/api\/projects\/([^/]+)\/permissions$/);
      const sessionApproval = pathname.match(/^\/api\/sessions\/([^/]+)\/approval-mode$/);
      if (sessionApproval && method === 'PUT') {
        const id = decodeURIComponent(sessionApproval[1]);
        if (!db.getSession(id)) return sendJson(res, 404, { error: 'Không tìm thấy chat' });
        const { mode } = await parseBody(req);
        if (!validApprovalMode(mode)) return sendJson(res, 400, { error: 'Chế độ phê duyệt không hợp lệ' });
        if (queuedSessionRuns.has(id) || [...(agentLoop.activeRuns?.values() || [])].some(run => run.sessionId === id)) return sendJson(res, 409, { error: 'Dừng tác vụ đang chạy trước khi đổi quyền' });
        db.db.prepare('UPDATE sessions SET approval_mode = ? WHERE id = ?').run(mode, id);
        return sendJson(res, 200, db.getSession(id));
      }
      if (projectPermissions) {
        const projectId = decodeURIComponent(projectPermissions[1]);
        if (!db.getProject(projectId)) return sendJson(res,404,{error:'Project không tồn tại'});
        const scopeId = `project:${projectId}`;
        if (method === 'GET') return sendJson(res,200,db.getScopedPolicies(scopeId));
        if (method === 'DELETE') {
          const body = await parseBody(req);
          if (typeof body.pattern !== 'string') return sendJson(res,400,{error:'Thiếu thao tác cần thu hồi'});
          db.db.prepare('DELETE FROM scoped_policies WHERE scope_id = ? AND pattern = ?').run(scopeId,body.pattern);
          return sendJson(res,200,{success:true});
        }
      }
      if (method === 'GET' && pathname === '/api/projects') return sendJson(res, 200, db.getProjects());
      const removeProjectRoute = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'PATCH' && removeProjectRoute) {
        const id = decodeURIComponent(removeProjectRoute[1]);
        if (!db.getProject(id)) return sendJson(res, 404, { error: 'Project không tồn tại.' });
        const body = await parseBody(req);
        if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)) return sendJson(res, 400, { error: 'Tên dự án cần từ 1 đến 100 ký tự.' });
        if (body.pinned !== undefined && typeof body.pinned !== 'boolean') return sendJson(res, 400, { error: 'Trạng thái ghim không hợp lệ.' });
        if (body.section !== undefined && body.section !== null && (typeof body.section !== 'string' || !body.section.trim() || body.section.trim().length > 60)) return sendJson(res, 400, { error: 'Tên mục cần từ 1 đến 60 ký tự.' });
        return sendJson(res, 200, db.updateProject(id, { name: body.name?.trim(), pinned: body.pinned, section: body.section === null ? null : body.section?.trim() }));
      }
      const archiveProjectRoute = pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
      if (method === 'POST' && archiveProjectRoute) {
        const id = decodeURIComponent(archiveProjectRoute[1]);
        if (!db.getProject(id)) return sendJson(res, 404, { error: 'Project không tồn tại.' });
        const body = await parseBody(req);
        if (typeof body.archived !== 'boolean') return sendJson(res, 400, { error: 'Trạng thái lưu trữ không hợp lệ.' });
        return sendJson(res, 200, { success: true, count: db.archiveProjectSessions(id, body.archived) });
      }
      const archiveSessionRoute = pathname.match(/^\/api\/sessions\/([^/]+)\/archive$/);
      if (method === 'PATCH' && archiveSessionRoute) {
        const id = decodeURIComponent(archiveSessionRoute[1]);
        if (!db.getSession(id)) return sendJson(res, 404, { error: 'Cuộc trò chuyện không tồn tại.' });
        const body = await parseBody(req);
        if (typeof body.archived !== 'boolean') return sendJson(res, 400, { error: 'Trạng thái lưu trữ không hợp lệ.' });
        db.db.prepare('UPDATE sessions SET archived_at = ? WHERE id = ?').run(body.archived ? Date.now() : null, id);
        return sendJson(res, 200, { success: true });
      }
      if (method === 'DELETE' && removeProjectRoute) {
        const id = decodeURIComponent(removeProjectRoute[1]);
        if (!db.getProject(id)) return sendJson(res, 404, { error: 'Project không tồn tại.' });
        try { db.removeProject(id); }
        catch (error) { return sendJson(res, 409, { error: error.message }); }
        if (browserBridge) for (const sessionId of browserBridge.grants.keys()) if (!db.getSession(sessionId)) browserBridge.revoke(sessionId);
        return sendJson(res, 200, { success: true });
      }
      if (method === 'POST' && pathname === '/api/projects') {
        const body = await parseBody(req);
        if (typeof body.path !== 'string' || !path.isAbsolute(body.path)) return sendJson(res, 400, { error: 'Nhập đường dẫn tuyệt đối tới thư mục project.' });
        let projectPath;
        try {
          projectPath = fs.realpathSync(body.path);
          if (!fs.statSync(projectPath).isDirectory()) throw new Error();
        } catch { return sendJson(res, 400, { error: 'Thư mục project không tồn tại hoặc không truy cập được.' }); }
        const existingProject = db.getProjects(true).find(p=>p.path===projectPath);
        if (existingProject?.removed_at) {
          try { db.removeProject(existingProject.id); }
          catch (error) { return sendJson(res, 409, { error: error.message }); }
        } else if (existingProject) {
          try { assertProjectRoot(db,existingProject); } catch(error) {return sendJson(res,409,{error:error.message});}
          return sendJson(res,200,db.restoreProject(existingProject.id));
        }
        if (db.getProjects(true).some(p=>overlaps(p.path,projectPath))) return sendJson(res,409,{error:'Thư mục project trùng hoặc lồng trong project khác.'});
        if (db.dbPath !== ':memory:' && overlaps(projectPath,path.dirname(path.resolve(db.dbPath)))) return sendJson(res,403,{error:'Không dùng thư mục dữ liệu ohmyt làm project.'});
        const project = db.addProject('proj_' + crypto.randomUUID(), path.basename(projectPath) || projectPath, projectPath);
        return sendJson(res, 201, project);
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
        if (body.projectId != null && (typeof body.projectId !== 'string' || !db.getProject(body.projectId))) return sendJson(res, 400, { error: 'Project không tồn tại.' });
        const session = db.createSession(id, agentId, title, body.projectId ?? null);
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
        agentLoop.deletingSessions ||= new Set();agentLoop.deletingSessions.add(id);
        try{const handles=agentLoop.harness?[...agentLoop.harness.agents.handles.values()].filter(h=>h.sessionId===id):[];for(const handle of handles)handle.abort('Chat deleted');for (const [runId, active] of agentLoop.activeRuns) if (active.sessionId === id) agentLoop.abortRun(runId, 'Chat deleted');await Promise.allSettled(handles.map(h=>h.task));
        if (browserUse?.files && db.getSession(id) && !db.getSession(id).project_id) { for (const file of browserUse.files.list(id)) await browserUse.files.remove(id, file.fileId); }
        db.deleteSession(id);
        browserBridge?.revoke(id);
        return sendJson(res, 200, { success: true, id });
        }finally{agentLoop.deletingSessions.delete(id);}
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
        if(agentLoop.harness?.agents.sessionOwners.has(sessionId)||[...agentLoop.activeRuns.values()].some(run=>run.sessionId===sessionId))return sendJson(res,409,{error:'Dừng tác vụ trước khi sửa lịch sử.'});
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
        const source = typeof body.sourceSessionId === 'string' ? db.getSession(body.sourceSessionId) : null;
        if ((target.project_id || source?.project_id) && (!source || target.project_id !== source.project_id)) return sendJson(res,403,{error:'Không chuyển tiếp giữa các project. Chọn một chat trong cùng project.'});
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
        db.createSession(id, source.agent_id || 'default-assistant', title, source.project_id ?? null);
        const override = db.getSessionModelOverride(sourceSessionId);
        if (override) db.setSessionModelOverride(id,override);
        const result = db.branchSession(id, sourceSessionId, anchorId, includeContext);
        if (!result) return sendJson(res, 404, { error: 'Không tìm thấy tin nhắn anchor' });
        return sendJson(res, 201, { session: db.getSession(id), copied: result.copied });
      }
      const messageMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages\/([^/]+)$/);
      if (messageMatch && method === 'DELETE') {
        const messageId = decodeURIComponent(messageMatch[2]),sessionId=decodeURIComponent(messageMatch[1]);
        if(db.getMessages(sessionId).every(message=>message.id!==messageId))return sendJson(res,404,{error:'Tin nhắn không thuộc chat.'});
        if(agentLoop.harness?.agents.sessionOwners.has(sessionId)||[...agentLoop.activeRuns.values()].some(run=>run.sessionId===sessionId))return sendJson(res,409,{error:'Dừng tác vụ trước khi sửa lịch sử.'});
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
        if (agentLoop.harness?.closed || agentLoop.harness?.closing || agentLoop.harness?.changingPlugins) return sendJson(res,409,{error:'Runtime đang dừng hoặc đổi plugin. Thử lại sau.'});
        const body = await parseBody(req);
        if (body.runId !== undefined && (typeof body.runId !== 'string' || !body.runId)) return sendJson(res,400,{error:'Run ID không hợp lệ'});
        const runId = body.runId || 'run_' + Math.random().toString(36).substring(2, 10);
        if (db.db.prepare('SELECT id FROM runs WHERE id = ?').get(runId)) return sendJson(res,409,{error:'Run ID đã tồn tại'});
        const { sessionId, prompt, responseLanguage = 'auto' } = body;
        if (!['auto', 'vi', 'en'].includes(responseLanguage)) {
          return sendJson(res, 400, { error: 'responseLanguage must be auto, vi or en' });
        }

        let images;
        try { images = validateImages(body.images); } catch(error) { return sendJson(res,400,{error:error.message}); }
        if (!sessionId || (!prompt && !images.length)) {
          return sendJson(res, 400, { error: 'sessionId và prompt là bắt buộc' });
        }
        if (typeof sessionId !== 'string' || typeof prompt !== 'string' || !db.getSession(sessionId)) return sendJson(res, 400, { error: 'Chat hoặc yêu cầu không hợp lệ' });
        if (queuedSessionRuns.has(sessionId) || [...(agentLoop.activeRuns?.values() || [])].some(run => run.sessionId === sessionId)) return sendJson(res, 409, { error: 'Chat này đang chạy' });
        queuedSessionRuns.add(sessionId);

        // Trigger agent loop asynchronously
        // Reserve run admission immediately so plugin changes cannot race a queued run.
        agentLoop.run({ runId, sessionId, prompt, responseLanguage, images }).catch(err => {
          console.error(`Lỗi trong agent loop (run ${runId}):`, err);
        }).finally(() => queuedSessionRuns.delete(sessionId));

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

        if (!['ALLOW_ONCE','ALLOW_ALWAYS','DENY'].includes(decision)) return sendJson(res,400,{error:'Quyết định không hợp lệ'});
        const approval = permissions.getPendingRequests(runId).find(request=>request.requestId===requestId);
        if (!approval) return sendJson(res,403,{error:'Quyền không thuộc run này hoặc đã hết hạn.'});
        permissions.resolveApproval(requestId, decision);
        return sendJson(res, 200, { success: true, requestId, decision });
      }

      // 7. Abort / Take Control
      if (method === 'POST' && pathname.match(/^\/api\/runs\/[^/]+\/abort$/)) {
        const runId = pathname.split('/')[3];
        const body = await parseBody(req);
        const handle=agentLoop.harness?.agents.findRun(runId);handle?.abort(body.reason || 'Kích hoạt Take Control');
        const aborted = Boolean(handle) || agentLoop.abortRun(runId, body.reason || 'Kích hoạt Take Control');
        return sendJson(res, 200, { success: true, runId, aborted });
      }

      // 8. Memories (White-box memory view & management)
      if (method === 'GET' && pathname === '/api/memories') {
        const query = parsedUrl.searchParams.get('q');
        if (query) {
          const results = db.searchMemories(query, 20, null, parsedUrl.searchParams.get('scopeId'));
          return sendJson(res, 200, results);
        }
        const all = db.getAllMemories(null,parsedUrl.searchParams.get('scopeId'));
        return sendJson(res, 200, all);
      }
      if (method === 'POST' && pathname === '/api/memories') {
        const body = await parseBody(req);
        const id = 'mem_' + Math.random().toString(36).substring(2, 10);
        let scopeId = 'legacy:unassigned';
        if (body.projectId) {
          if (!db.getProject(body.projectId)) return sendJson(res,400,{error:'Project không tồn tại'});
          scopeId = `project:${body.projectId}`;
        }
        const mem = db.saveMemory(id, body.agentId || 'default-assistant', body.category || 'profile', body.content, scopeId);
        return sendJson(res, 201, mem);
      }
      const memoryScopeMatch = pathname.match(/^\/api\/memories\/([^/]+)\/scope$/);
      if (method === 'PATCH' && memoryScopeMatch) {
        const body = await parseBody(req);
        const id = decodeURIComponent(memoryScopeMatch[1]);
        let scopeId = 'legacy:unassigned';
        if (body.projectId !== null) {
          if (typeof body.projectId !== 'string' || !db.getProject(body.projectId)) return sendJson(res,400,{error:'Project không tồn tại'});
          scopeId = `project:${body.projectId}`;
        }
        const result = db.db.prepare('UPDATE memories SET scope_id = ? WHERE id = ?').run(scopeId,id);
        if (!result.changes) return sendJson(res,404,{error:'Bộ nhớ không tồn tại'});
        return sendJson(res,200,{success:true,scopeId});
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
      return sendJson(res, err.statusCode || (/busy|active runs|changing plugins/i.test(err.message)?409:/Invalid arguments|Invalid profile|Unknown profile/i.test(err.message)?400:500), { error: err.message });
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
