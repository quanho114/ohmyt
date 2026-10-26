import {CliError} from './args.js';

export function validateEndpoint(value) {
  let url;
  try {url = new URL(value);} catch {throw new CliError('Invalid daemon endpoint');}
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['/', '/api', '/api/'].includes(url.pathname)) throw new CliError('Daemon endpoint must be an HTTP loopback URL without credentials or query');
  return `${url.origin}/api`;
}

export async function* parseSSE(body) {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '', id = '', data = [], size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        size += line.length;
        if (size > 8 * 1024 * 1024) throw new CliError('Run event exceeds 8 MiB', 4);
        if (!line) {
          if (data.length) yield {id, data: JSON.parse(data.join('\n'))};
          data = []; size = 0;
        } else if (line.startsWith('id:')) id = line.slice(3).replace(/^ /, '');
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (buffer.length > 8 * 1024 * 1024) throw new CliError('Run event exceeds 8 MiB', 4);
      if (done) break;
    }
  } finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
}

export class Client {
  constructor(endpoint, token = '', instanceId = null) {this.base = validateEndpoint(endpoint); this.token = token; this.instanceId = instanceId;}
  headers() {return {...(this.token ? {Authorization: `Bearer ${this.token}`} : {})};}
  async request(route, {method = 'GET', body, signal} = {}) {
    const res = await fetch(this.base + route, {method, redirect: 'error', headers: {...this.headers(), 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(15000)}).catch(error => {throw new CliError(`Cannot connect to daemon: ${error.message}`, 4);});
    const json = await res.json().catch(() => {throw new CliError('Daemon returned an invalid response', 4);});
    if (!res.ok) {const error = new CliError(json.error || `HTTP ${res.status}`, res.status === 409 || res.status === 400 ? 2 : 4); error.status = res.status; throw error;}
    return json;
  }
  async handshake() {
    const info = await this.request('/runtime');
    if (info.protocolVersion !== 1 || this.instanceId && info.instanceId !== this.instanceId) throw new CliError('Daemon restarted or CLI protocol is incompatible; reconnect explicitly', 4);
    this.instanceId = info.instanceId; return info;
  }
  async *stream(runId, {cursor = '', signal} = {}) {
    const res = await fetch(`${this.base}/runs/${encodeURIComponent(runId)}/stream`, {headers: {...this.headers(), ...(cursor ? {'Last-Event-ID': cursor} : {})}, signal, redirect: 'error'});
    if (!res.ok) throw new CliError(`Cannot stream run: HTTP ${res.status}`, 4);
    yield* parseSSE(res.body);
  }
}
