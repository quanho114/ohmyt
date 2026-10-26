import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import {existsSync} from 'node:fs';
import { spawn } from 'node-pty';
import { createRunScope } from './project_scope.js';
import { sendJson } from './api/http_utils.js';

const fail = (statusCode, message) => { throw Object.assign(new Error(message), {statusCode}); };
const MAX_SHELLS_PER_SESSION = 6;
// Deliberately not a tool: this service accepts only direct authenticated user traffic.
export class InteractiveTerminals {
  constructor({db, workspaceRoot, spawnPty = spawn, orphanGraceMs = 15000}) { Object.assign(this, {db, workspaceRoot, spawnPty, orphanGraceMs}); this.entries = new Map(); }
  session(id) { const session = this.db.getSession(id); if (!session) fail(404, 'Session not found'); return session; }
  open(sessionId, consent) {
    const session = this.session(sessionId);
    if (consent !== true) fail(403, 'Explicit host terminal consent required');
    const perSession = this.entries.get(sessionId);
    if (perSession) {
      // Shells nobody streams anymore (e.g. the renderer reloaded) are unreachable; reap them
      // past a grace window so a freshly opened shell can still attach its first stream.
      for (const [terminalId, e] of perSession) {
        if (e.streams.size === 0 && Date.now() - e.created >= this.orphanGraceMs) { try { if (!e.exited) e.child.kill(); } catch {} perSession.delete(terminalId); }
      }
      if (perSession.size >= MAX_SHELLS_PER_SESSION) fail(429, 'Terminal limit reached');
    }
    const cwd = createRunScope(this.db, session, 'user-terminal').canonicalRoot || this.workspaceRoot;
    const shell = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : (existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh');
    const env = {...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor'};
    if (process.platform !== 'win32') env.PS1 = shell === '/bin/bash'
      ? String.raw`\[\e[32m\]\u@\h\[\e[0m\]:\[\e[34m\]\w\[\e[0m\]\$ `
      : '${PWD} $ ';
    delete env.OHMYT_LOCAL_RUNTIME_CONFIG;
    delete env.ELECTRON_RUN_AS_NODE;
    const child = this.spawnPty(shell, process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : shell === '/bin/bash' ? ['--noprofile', '--norc', '-i'] : ['-i'], {cwd, env, cols: 100, rows: 24, name: 'xterm-256color'});
    const terminalId = randomUUID();
    const entry = {child, owner: randomBytes(32).toString('hex'), created: Date.now(), output: '', sequence: 0, exited: false, streams: new Set(), budget: 65536, updated: Date.now()};
    if (!perSession) this.entries.set(sessionId, new Map());
    this.entries.get(sessionId).set(terminalId, entry);
    child.onData(data => {
      entry.output = (entry.output + data).slice(-131072); entry.sequence++;
      const frame = `data: ${JSON.stringify({data, sequence: entry.sequence})}\n\n`;
      for (const res of entry.streams) { if (res.writableLength > 262144) res.destroy(); else res.write(frame); }
    });
    child.onExit(({exitCode}) => { entry.exited = true; for (const res of entry.streams) res.end(`data: ${JSON.stringify({exitCode})}\n\n`); entry.streams.clear(); });
    return {owner: entry.owner, cwd, terminalId, shell: path.basename(shell).replace(/\.exe$/i, '')};
  }
  owned(sessionId, terminalId, owner) {
    this.session(sessionId);
    const e = this.entries.get(sessionId)?.get(terminalId);
    if (!e || !owner || e.owner !== owner) fail(403, 'Terminal ownership required');
    return e;
  }
  close(sessionId, terminalId, owner) {
    const e = this.owned(sessionId, terminalId, owner);
    const perSession = this.entries.get(sessionId);
    perSession?.delete(terminalId);
    if (perSession?.size === 0) this.entries.delete(sessionId);
    for (const res of e.streams) { try { res.end(); } catch {} } e.streams.clear();
    if (!e.exited) e.child.kill();
  }
  dispose() {
    for (const [,perSession] of this.entries) {
      for (const [,e] of perSession) {
        for (const res of e.streams) { try { res.end(); } catch {} }
        e.streams.clear();
        try { if (!e.exited) e.child.kill(); } catch {}
      }
    }
    this.entries.clear();
  }
}

async function body(req) {
  let text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 20000) fail(413, 'Terminal request too large'); }
  try { return JSON.parse(text || '{}'); } catch { fail(400, 'Invalid JSON'); }
}
export async function handleTerminalRoutes({terminals}, req, res, {pathname, method}) {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/terminal(?:\/([^/]+))?(?:\/(stream|input|resize))?$/);
  if (!match) return false;
  const id = decodeURIComponent(match[1]), terminalId = match[2] ? decodeURIComponent(match[2]) : '', action = match[3];
  if (method === 'POST' && !terminalId && !action) {
    const b = await body(req); if (Object.keys(b).some(k => k !== 'consent')) fail(400, 'Only consent is accepted');
    sendJson(res, 200, terminals.open(id, b.consent)); return true;
  }
  if (!terminalId || ['stream','input','resize'].includes(terminalId)) fail(404, 'Terminal route not found');
  const e = terminals.owned(id, terminalId, req.headers['x-terminal-owner']);
  if (method === 'GET' && action === 'stream') {
    if (e.streams.size >= 2) fail(429, 'Too many terminal streams');
    res.writeHead(200, {'Content-Type':'text/event-stream', 'Cache-Control':'no-store', 'X-Accel-Buffering':'no'});
    res.write(`data: ${JSON.stringify({data:e.output, sequence:e.sequence, ...(e.exited ? {exitCode:0} : {})})}\n\n`);
    if (e.exited) res.end(); else { e.streams.add(res); req.on('close', () => e.streams.delete(res)); }
  } else if (method === 'DELETE' && !action) { terminals.close(id, terminalId, e.owner); sendJson(res, 200, {ok:true}); }
  else if (method === 'POST' && action === 'input') {
    const b = await body(req);
    if (typeof b.data !== 'string' || Buffer.byteLength(b.data) > 8192 || Object.keys(b).some(k => k !== 'data')) fail(400, 'Invalid terminal input');
    const now = Date.now(); e.budget = Math.min(65536, e.budget + (now-e.updated)*16); e.updated = now;
    if (Buffer.byteLength(b.data) > e.budget) fail(429, 'Terminal input rate exceeded');
    e.budget -= Buffer.byteLength(b.data); if (e.exited) fail(409, 'Terminal exited'); e.child.write(b.data); sendJson(res,200,{ok:true});
  } else if (method === 'POST' && action === 'resize') {
    const b = await body(req); if (!Number.isInteger(b.cols) || !Number.isInteger(b.rows) || b.cols < 2 || b.cols > 500 || b.rows < 1 || b.rows > 200 || Object.keys(b).some(k => !['cols','rows'].includes(k))) fail(400,'Invalid terminal dimensions');
    if (!e.exited) e.child.resize(b.cols,b.rows); sendJson(res,200,{ok:true});
  } else fail(405,'Unsupported terminal operation');
  return true;
}
