import {useEffect, useRef, useState} from 'react';
import {Terminal as XTerm} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {Terminal as TerminalIcon, PanelRightClose, Maximize2, Minimize2, Plus, X, RotateCw} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import '../styles/interactive-terminal.css';

const runtime = (window as any).electronAPI?.runtime;
const base = runtime?.apiBase || '/api';
const owners = new Map<string,string>();        // `${sessionId}:${terminalId}` -> owner
const shells = new Map<string,string>();
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
  shells.set(`${sessionId}:${result.terminalId}`, result.shell || 'Shell');
  return result as {owner:string;cwd?:string;terminalId:string};
}
function baseLabel(sessionId:string, tid:string) {
  const cwd = cwds.get(`${sessionId}:${tid}`) || '';
  const folder = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() || '' : '';
  const shell = shells.get(`${sessionId}:${tid}`) || 'Shell';
  return folder ? `${shell} · ${folder}` : shell;
}
function tabLabel(sessionId:string, tid:string, index:number) {
  const name = baseLabel(sessionId, tid);
  return index > 0 ? `${name} ${index + 1}` : name;
}

export function InteractiveTerminal({sessionId, visible, theme, onHide}:{sessionId:string;visible:boolean;theme:'light'|'dark';onHide:()=>void}) {
  const [tabs,setTabs] = useState<string[]>(() => tabsBySession.get(sessionId) ?? []);
  const [active,setActive] = useState<string | null>(() => { const list = tabsBySession.get(sessionId); return list?.length ? list[list.length-1] : null; });
  const [exited,setExited] = useState<Record<string,boolean>>({});
  const [error,setError] = useState('');
  // Match the default split to the workspace, excluding the sidebar.
  const [width,setWidth] = useState<number | null>(null);
  const [expanded,setExpanded] = useState(false);
  const [compact,setCompact] = useState(() => innerWidth < 1000);
  useEffect(() => { const update = () => setCompact(innerWidth < 1000); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);
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
  return <section className="interactive-terminal" data-expanded={expanded || undefined} hidden={!visible} style={{width: compact ? undefined : expanded ? '100%' : width === null ? '53%' : `min(${width}px, 65%)`}} aria-label="Terminal">
    <div className="terminal-resizer" role="separator" aria-label="Chiều rộng terminal" aria-orientation="vertical" aria-valuenow={width ?? undefined} tabIndex={0}
      onKeyDown={e => {if(e.key==='ArrowLeft'||e.key==='ArrowRight') {e.preventDefault(); const currentWidth=e.currentTarget.parentElement!.getBoundingClientRect().width; setWidth(w=>Math.max(320,Math.min(innerWidth*.65,(w ?? currentWidth)+(e.key==='ArrowLeft'?24:-24))));}}}
      onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e => {if(e.currentTarget.hasPointerCapture(e.pointerId)) {const right=e.currentTarget.parentElement!.getBoundingClientRect().right; setExpanded(false); setWidth(Math.max(320,Math.min(innerWidth*.65,right-e.clientX)));}}}
      onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)} />
    <header>
      <div className="terminal-tabs" role="tablist" aria-label="Các terminal đang mở">
        {tabs.map((tid, index) => {
          const key = `${sessionId}:${tid}`;
          return <div key={tid} role="tab" aria-selected={tid===active} tabIndex={0} className="terminal-tab" data-active={tid===active || undefined} onClick={() => setActive(tid)} onKeyDown={e => {if(e.key==='Enter'||e.key===' ') setActive(tid);}} title={cwds.get(key) || 'Shell'}>
            <span title={exited[tid] ? 'Đã kết thúc' : 'Terminal'}><TerminalIcon size={13}/></span>
            <span className="terminal-tab-label">{tabLabel(sessionId, tid, index)}</span>
            <button type="button" className="terminal-tab-close" onClick={e => {e.stopPropagation(); void closeTab(tid);}} aria-label={`Đóng ${tabLabel(sessionId, tid, index)}`}><X size={11}/></button>
          </div>;
        })}
        <button type="button" className="terminal-icon-btn" onClick={addTab} title="Mở terminal mới" aria-label="Mở terminal mới"><Plus size={14}/></button>
      </div>
      <span className="terminal-header-spacer" />
      <button type="button" className="terminal-icon-btn" onClick={() => setExpanded(v => !v)} title={expanded ? 'Thu nhỏ' : 'Phóng to terminal'} aria-label={expanded ? 'Thu nhỏ terminal' : 'Phóng to terminal'}>{expanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
      <button type="button" className="terminal-icon-btn" onClick={onHide} title="Ẩn terminal, giữ tiến trình chạy" aria-label="Ẩn terminal"><PanelRightClose size={15}/></button>
    </header>
    {error && <p role="alert">{error}</p>}
    {tabs.length === 0 && !error && <div className="terminal-boot">Đang mở terminal...</div>}
    {tabs.map(tid => (
      <TerminalTab key={tid} sessionId={sessionId} tid={tid} active={visible && tid===active} theme={theme}
        onExited={() => setExited(prev => ({...prev, [tid]: true}))}
        onRestart={() => restartTab(tid)} />
    ))}
  </section>;
}

function terminalTheme(theme:'light'|'dark') {
  const dark = theme === 'dark';
  return {scrollbarSliderBackground: dark ? '#ffffff26' : '#0000001a', scrollbarSliderHoverBackground: dark ? '#ffffff40' : '#00000030', scrollbarSliderActiveBackground: dark ? '#ffffff59' : '#00000045', overviewRulerBorder: 'transparent', background: dark ? '#141418' : '#ffffff', foreground: dark ? '#e4e7eb' : '#24292f', cursor: dark ? '#79c0ff' : '#0969da', cursorAccent: dark ? '#141418' : '#ffffff', selectionBackground: dark ? '#264f78' : '#cce5ff', black: '#24292f', red: '#cf222e', green: dark ? '#7ee787' : '#116329', yellow: dark ? '#e3b341' : '#8a6500', blue: dark ? '#79c0ff' : '#0550ae', magenta: '#a475f9', cyan: dark ? '#56d4dd' : '#087e8b', white: '#e4e7eb', brightBlack: '#6e7781'};
}

function TerminalTab({sessionId, tid, active, theme, onExited, onRestart}:{sessionId:string;tid:string;active:boolean;theme:'light'|'dark';onExited:()=>void;onRestart:()=>void}) {
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
      overviewRuler: {width: 8},
      theme: terminalTheme(theme)

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
      if (!host.current?.offsetWidth) return;
      fitRef.current?.fit();
      termRef.current?.focus();
      const terminal = termRef.current, owner = owners.get(`${sessionId}:${tid}`);
      if (terminal && owner) void call(sessionId,`/${tid}/resize`,'POST',owner,{cols:terminal.cols,rows:terminal.rows}).catch(() => {});
    });
  },[active]);
  useEffect(() => { if (termRef.current) termRef.current.options.theme = terminalTheme(theme); }, [theme]);
  return <div className="terminal-tab-body" hidden={!active}>
    <div ref={host} className="terminal-screen"/>
    {exited && <div className="terminal-exited"><span>Tiến trình đã kết thúc.</span><button type="button" onClick={onRestart}><RotateCw size={12}/> Mở shell mới</button></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
