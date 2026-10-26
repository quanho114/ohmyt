import {useEffect, useRef, useState} from 'react';
import {Terminal as XTerm} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {ChevronDown, Plus, X, RotateCw} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import '../styles/interactive-terminal.css';

const runtime = (window as any).electronAPI?.runtime;
const base = runtime?.apiBase || '/api';
const owners = new Map<string,string>();        // `${sessionId}:${terminalId}` -> owner
const cwds = new Map<string,string>();
const tabsBySession = new Map<string,string[]>(); // session -> tab order (sống sót qua chuyển phiên)
async function call(id:string, action:string, method:string, owner?:string, body?:unknown, signal?:AbortSignal) {
  const response = await fetch(`${base}/sessions/${encodeURIComponent(id)}/terminal${action}`, {method, signal, headers:{'Content-Type':'application/json', ...(runtime?.token ? {Authorization:`Bearer ${runtime.token}`} : {}), ...(owner ? {'X-Terminal-Owner':owner} : {})}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  if (!response.ok) throw new Error((await response.json()).error || 'Terminal request failed');
  return response;
}
function messageOf(e:unknown) {
  const text = e instanceof Error ? e.message : String(e);
  return text === 'Terminal already open' ? 'Terminal của phiên này đang mở ở một cửa sổ khác.' : text;
}
// Nút bấm của người dùng (mở panel, nút +) chính là hành động cho phép; không hỏi xác nhận lại.
async function ensureShell(sessionId:string) {
  const result = await (await call(sessionId,'','POST',undefined,{consent:true})).json();
  owners.set(`${sessionId}:${result.terminalId}`, result.owner);
  cwds.set(`${sessionId}:${result.terminalId}`, result.cwd || '');
  return result as {owner:string;cwd?:string;terminalId:string};
}
function baseLabel(sessionId:string, tid:string) {
  const cwd = cwds.get(`${sessionId}:${tid}`) || '';
  const folder = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() || '' : '';
  return folder ? `PowerShell ${folder}` : 'PowerShell';
}
function tabLabel(sessionId:string, tid:string, index:number) {
  const name = baseLabel(sessionId, tid);
  return index > 0 ? `${name} ${index + 1}` : name;
}

export function InteractiveTerminal({sessionId, visible, onHide}:{sessionId:string;visible:boolean;onHide:()=>void}) {
  const [tabs,setTabs] = useState<string[]>(() => tabsBySession.get(sessionId) ?? []);
  const [active,setActive] = useState<string | null>(() => { const list = tabsBySession.get(sessionId); return list?.length ? list[list.length-1] : null; });
  const [exited,setExited] = useState<Record<string,boolean>>({});
  const [error,setError] = useState('');
  const [height,setHeight] = useState(260);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (tabsBySession.get(sessionId)?.length) return;
    void (async () => {
      try {
        const result = await ensureShell(sessionId);
        setTabs(t => { const next=[...t, result.terminalId]; tabsBySession.set(sessionId,next); return next; });
        setActive(result.terminalId);
      } catch(e) { setError(messageOf(e)); }
    })();
  },[sessionId]);
  async function addTab() {
    setError('');
    try {
      const result = await ensureShell(sessionId);
      setTabs(t => { const next=[...t, result.terminalId]; tabsBySession.set(sessionId,next); return next; });
      setActive(result.terminalId);
    } catch(e) { setError(messageOf(e)); }
  }
  function dropTab(tid:string, next: string[]) {
    tabsBySession.set(sessionId, next);
    setTabs(next);
    if (!next.length) onHide();
    else if (active === tid) setActive(next[next.length-1]);
  }
  async function closeTab(tid:string) {
    const owner = owners.get(`${sessionId}:${tid}`);
    try { if (owner) await call(sessionId, `/${tid}`, 'DELETE', owner); } catch {}
    owners.delete(`${sessionId}:${tid}`); cwds.delete(`${sessionId}:${tid}`);
    dropTab(tid, tabs.filter(x => x !== tid));
  }
  async function restartTab(tid:string) {
    const owner = owners.get(`${sessionId}:${tid}`);
    try { if (owner) await call(sessionId, `/${tid}`, 'DELETE', owner); } catch {}
    owners.delete(`${sessionId}:${tid}`); cwds.delete(`${sessionId}:${tid}`);
    try {
      const result = await ensureShell(sessionId);
      setExited(prev => { const next={...prev}; delete next[tid]; return next; });
      setTabs(t => { const next=t.map(x => x===tid ? result.terminalId : x); tabsBySession.set(sessionId,next); return next; });
      setActive(result.terminalId);
    } catch(e) { dropTab(tid, tabs.filter(x => x !== tid)); setError(messageOf(e)); }
  }
  return <section className="interactive-terminal" hidden={!visible} style={{height}} aria-label="Terminal PowerShell">
    <div className="terminal-resizer" role="separator" aria-label="Chiều cao terminal" aria-orientation="horizontal" tabIndex={0} onKeyDown={e => {if(e.key==='ArrowUp'||e.key==='ArrowDown') setHeight(h=>Math.max(160,Math.min(innerHeight*.7,h+(e.key==='ArrowUp'?20:-20))));}} onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e => {if(e.currentTarget.hasPointerCapture(e.pointerId)) setHeight(Math.max(160,Math.min(innerHeight*.7,innerHeight-e.clientY)));}} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)} />
    <header>
      <span className="terminal-header-title">Terminal</span>
      <div className="terminal-tabs" role="tablist" aria-label="Các terminal đang mở">
        {tabs.map((tid, index) => {
          const key = `${sessionId}:${tid}`;
          return <div key={tid} role="tab" aria-selected={tid===active} tabIndex={0} className="terminal-tab" data-active={tid===active || undefined} onClick={() => setActive(tid)} onKeyDown={e => {if(e.key==='Enter'||e.key===' ') setActive(tid);}} title={cwds.get(key) || 'PowerShell'}>
            <span className="terminal-status" data-state={exited[tid] ? 'exited' : 'running'} aria-hidden="true" />
            <span className="terminal-tab-label">{tabLabel(sessionId, tid, index)}</span>
            <button type="button" className="terminal-tab-close" onClick={e => {e.stopPropagation(); void closeTab(tid);}} aria-label={`Đóng ${tabLabel(sessionId, tid, index)}`}><X size={11}/></button>
          </div>;
        })}
        <button type="button" className="terminal-icon-btn" onClick={addTab} title="Mở terminal mới (PowerShell)" aria-label="Mở terminal mới"><Plus size={14}/></button>
      </div>
      <div className="flex-1" />
      <button type="button" className="terminal-icon-btn" onClick={onHide} title="Thu gọn (tiến trình vẫn chạy)" aria-label="Thu gọn terminal"><ChevronDown size={15}/></button>
    </header>
    {error && <p role="alert">{error}</p>}
    {tabs.length === 0 && !error && <div className="terminal-boot">Đang mở PowerShell...</div>}
    {tabs.map(tid => (
      <TerminalTab key={tid} sessionId={sessionId} tid={tid} active={tid===active}
        onExited={() => setExited(prev => ({...prev, [tid]: true}))}
        onRestart={() => restartTab(tid)} />
    ))}
  </section>;
}

function TerminalTab({sessionId, tid, active, onExited, onRestart}:{sessionId:string;tid:string;active:boolean;onExited:()=>void;onRestart:()=>void}) {
  const host = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon|null>(null);
  const termRef = useRef<XTerm|null>(null);
  const [error,setError] = useState('');
  const [exited,setExited] = useState(false);
  useEffect(() => {
    const owner = owners.get(`${sessionId}:${tid}`);
    if (!owner || !host.current) return;
    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      scrollback: 3000,
      theme: {
        background: '#0f1115',
        foreground: '#e4e7eb',
        cursor: '#528bff',
        cursorAccent: '#0f1115',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#1e222b',
        red: '#e4e7eb',
        green: '#7ee787',
        yellow: '#e3b341',
        blue: '#79c0ff',
        magenta: '#d2a8ff',
        cyan: '#56d4dd',
        white: '#e4e7eb',
        brightBlack: '#666666',
        brightRed: '#f85149',
        brightGreen: '#7ee787',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#ffffff',
      }
    });
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host.current); fitRef.current = fit; termRef.current = terminal;
    const abort = new AbortController(); let disposed = false;
    let chain = Promise.resolve();
    const input = terminal.onData(data => { chain = chain.then(async () => { await call(sessionId,`/${tid}/input`,'POST',owner,{data}); }).catch(e => {if (!disposed) setError(messageOf(e));}); });
    const observer = new ResizeObserver(() => { if (host.current?.offsetWidth) { fit.fit(); void call(sessionId,`/${tid}/resize`,'POST',owner,{cols:terminal.cols,rows:terminal.rows}).catch(e => {if (!disposed) setError(messageOf(e));}); } }); observer.observe(host.current);
    void (async () => {
      try {
        const response = await call(sessionId,`/${tid}/stream`,'GET',owner,undefined,abort.signal);
        const reader = response.body!.getReader(), decoder = new TextDecoder(); let pending = '';
        while (true) { const {value,done} = await reader.read(); if(done) break; pending += decoder.decode(value,{stream:true}); let end;
          while ((end=pending.indexOf('\n\n')) >= 0) { const frame=pending.slice(0,end); pending=pending.slice(end+2); if (!frame.startsWith('data: ')) continue; const event=JSON.parse(frame.slice(6)); if(event.data) terminal.write(event.data); if(event.exitCode !== undefined) { setExited(true); onExited(); terminal.writeln(`\r\n[Tiến trình đã kết thúc với mã ${event.exitCode}]`); } }
        }
      } catch(e) {if (!disposed) setError(messageOf(e));}
    })();
    return () => {disposed=true; abort.abort(); observer.disconnect(); input.dispose(); terminal.dispose(); fitRef.current=null; termRef.current=null;};
  },[sessionId,tid]);
  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      fitRef.current?.fit();
      const terminal = termRef.current, owner = owners.get(`${sessionId}:${tid}`);
      if (terminal && owner) void call(sessionId,`/${tid}/resize`,'POST',owner,{cols:terminal.cols,rows:terminal.rows}).catch(() => {});
    });
  },[active]);
  return <div className="terminal-tab-body" hidden={!active}>
    <div ref={host} className="terminal-screen"/>
    {exited && <div className="terminal-exited"><span>Tiến trình đã kết thúc.</span><button type="button" onClick={onRestart}><RotateCw size={12}/> Mở shell mới</button></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
