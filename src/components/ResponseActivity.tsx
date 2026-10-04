import { useEffect, useState } from 'react';
import { ChevronDown, FileText, Folder, Terminal, Search, Database, ArrowUpRight } from 'lucide-react';
import { WorkStatusIcon, toolWorkState } from './WorkStatusIcon.tsx';
import type { WorkState } from './WorkStatusIcon.tsx';
import type { ToolCallItem, ResponseActivityData } from '../types.ts';

const toolKinds: Record<string, { vi: string; en: string; icon: typeof FileText; kind: string }> = {
  fs_read: { vi: 'Đọc tệp', en: 'Read file', icon: FileText, kind: 'file' },
  fs_write: { vi: 'Ghi tệp', en: 'Write file', icon: FileText, kind: 'file' },
  fs_list: { vi: 'Khám phá thư mục', en: 'Browse directory', icon: Folder, kind: 'directory' },
  shell_host: { vi: 'Chạy lệnh trên máy', en: 'Run on this computer', icon: Terminal, kind: 'terminal' },
  shell_exec: { vi: 'Chạy lệnh', en: 'Run command', icon: Terminal, kind: 'terminal' },
  web_search: { vi: 'Tìm kiếm trên web', en: 'Search the web', icon: Search, kind: 'search' },
  memory_save: { vi: 'Lưu ghi nhớ', en: 'Save memory', icon: Database, kind: 'memory' },
  memory_search: { vi: 'Tra cứu ghi nhớ', en: 'Search memory', icon: Database, kind: 'memory' },
};

function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

function printable(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function ActivityTool({ tool, vi, autoExpand }: { tool: ToolCallItem; vi: boolean; autoExpand: boolean }) {
  const definition = toolKinds[tool.name];
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? (autoExpand && tool.status === 'running');
  const output = tool.output && typeof tool.output === 'object' ? tool.output as Record<string, unknown> : {};
  const target = tool.input.path ?? tool.input.command ?? tool.input.query ?? tool.input.target ?? tool.input.content;
  const rawResults = output.results;
  const results = Array.isArray(rawResults) ? rawResults.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
  const resultText = definition?.kind === 'terminal'
    ? printable(output.stdout ?? (typeof tool.output === 'string' ? tool.output : ''))
    : printable(output.content ?? tool.output);
  const failed = tool.status === 'error' || tool.status === 'blocked';
  const statusText = tool.status === 'running' ? (vi ? 'Đang chạy' : 'Running')
    : tool.status === 'blocked' ? (vi ? 'Bị chặn' : 'Blocked')
      : failed ? (vi ? 'Thất bại' : 'Failed') : (vi ? 'Hoàn tất' : 'Completed');
  return <li className="trace-tool" data-kind={definition?.kind ?? 'generic'} data-status={tool.status}>
    <button className="trace-tool-toggle" type="button" aria-expanded={open}
      aria-label={`${definition?.[vi ? 'vi' : 'en'] ?? tool.name}: ${printable(target)} · ${statusText}`}
      onClick={() => setManualOpen(!open)}>
      <WorkStatusIcon state={toolWorkState(tool.name)} size={24} animated={tool.status === 'running'} className="trace-tool-icon" />
      <span className="trace-tool-name">{definition?.[vi ? 'vi' : 'en'] ?? tool.name}</span>
      {target != null && <span className="trace-tool-target" title={printable(target)}>{printable(target)}</span>}
      <span className="trace-tool-status" title={statusText}>
        <WorkStatusIcon state={tool.status === 'running' ? toolWorkState(tool.name) : failed ? (tool.status === 'blocked' ? 'approval' : 'error') : 'completed'} size={14} animated={false} />
        <span className="sr-only">{statusText}</span>
      </span>
      <ChevronDown size={12} className="trace-tool-chevron" data-open={open} />
    </button>
    {open && <div className="trace-tool-detail">
      {definition?.kind === 'terminal' ? <div className="trace-terminal">
        <div className="trace-terminal-title"><Terminal size={12} /><span>Terminal</span>{typeof output.exitCode === 'number' && <span className="trace-exit">exit {output.exitCode}</span>}</div>
        <pre><span className="trace-prompt">$ </span>{printable(tool.input.command ?? tool.input.target)}</pre>
        {resultText && <pre>{resultText.slice(0, 12000)}</pre>}
        {Boolean(output.stderr ?? output.error) && <pre className="trace-stderr">{printable(output.stderr ?? output.error).slice(0, 12000)}</pre>}
      </div> : definition?.kind === 'search' && results.length > 0 ? <div className="trace-sources">
        {results.slice(0, 6).map((result, index) => {
          const url = sourceUrl(result.url);
          return <a key={index} className="trace-source" href={url} target="_blank" rel="noopener noreferrer">
            <span className="trace-source-domain">{url ? new URL(url).hostname : (vi ? 'Nguồn' : 'Source')}</span>
            <span className="trace-source-title">{printable(result.title || result.url)}</span>
            {url && <ArrowUpRight size={12} />}
          </a>;
        })}
      </div> : definition?.kind === 'directory' && Array.isArray(output.entries) ? <div className="trace-directory">
        {output.entries.slice(0, 40).map((entry, index) => {
          const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
          return <div key={index}>{item.isDirectory ? <Folder size={13} /> : <FileText size={13} />}<span>{printable(item.name)}</span></div>;
        })}
        {output.entries.length > 40 && <span className="trace-preview-note">+{output.entries.length - 40}</span>}
      </div> : definition?.kind === 'memory' && (Array.isArray(output.memories) || output.savedMemory) ? <div className="trace-memories">
        {(Array.isArray(output.memories) ? output.memories : [output.savedMemory]).map((memory, index) => {
          const item = memory && typeof memory === 'object' ? memory as Record<string, unknown> : {};
          return <div key={index}><span className="trace-section-label">{printable(item.category)}</span><p>{printable(item.content)}</p></div>;
        })}
        {Array.isArray(output.memories) && output.memories.length === 0 && <p>{vi ? 'Không tìm thấy ghi nhớ phù hợp.' : 'No matching memories.'}</p>}
      </div> : <div className="trace-file">
        {definition?.kind === 'file' && <div className="trace-file-title"><FileText size={12} />{printable(tool.input.path)}{typeof output.lines === 'number' && <span>{output.lines} {vi ? 'dòng' : 'lines'}</span>}</div>}
        <pre>{(resultText || printable(tool.input)).slice(0, 12000)}</pre>
      </div>}
      {resultText.length > 12000 && <span className="trace-preview-note">{vi ? 'Đã rút gọn bản xem trước' : 'Preview shortened'}</span>}
      {tool.durationMs != null && <span className="trace-preview-note">{(tool.durationMs / 1000).toFixed(1)}s</span>}
    </div>}
  </li>;
}

export function ResponseActivity({ tools, reasoning = '', hasContent, locale, autoExpandTools, animated,
  isStreaming = true, startedAt, durationMs, status, phase }: {
  tools: ToolCallItem[]; reasoning?: string; hasContent: boolean; locale: 'vi' | 'en';
  autoExpandTools: boolean; animated: boolean; isStreaming?: boolean;
  startedAt?: number; durationMs?: number; status?: ResponseActivityData['status']; phase?: ResponseActivityData['phase'];
}) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isStreaming) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isStreaming]);
  const vi = locale === 'vi';
  const running = tools.find(tool => tool.status === 'running');
  const busy = isStreaming && (phase ? phase !== 'answer' : (!hasContent || Boolean(running)));
  const open = manualOpen ?? (busy || (isStreaming && autoExpandTools));
  const seconds = Math.max(0, Math.floor((durationMs ?? now - (startedAt ?? mountedAt)) / 1000));
  const hasDetails = Boolean(reasoning.trim() || tools.length);
  const title = !isStreaming ? (status === 'aborted' ? (vi ? 'Đã dừng' : 'Stopped') : status === 'error' ? (vi ? 'Tác vụ gặp lỗi' : 'Task failed') : status === 'warnings' ? (vi ? 'Hoàn tất · có bước lỗi' : 'Finished · some steps failed') : (vi ? 'Quá trình xử lý' : 'Activity'))
    : phase === 'approval' ? (vi ? 'Chờ bạn cho phép' : 'Waiting for approval')
    : phase === 'reasoning' ? 'Thinking'
    : running ? (toolKinds[running.name]?.[vi ? 'vi' : 'en'] ?? running.name)
      : hasContent ? (vi ? 'Đang trả lời' : 'Responding')
        : reasoning ? 'Thinking' : 'Thinking';
  const iconState: WorkState = !isStreaming ? (status === 'aborted' ? 'stopped' : status === 'error' ? 'error' : 'completed')
    : phase === 'approval' ? 'approval' : phase === 'reasoning' ? 'thinking'
      : running ? toolWorkState(running.name) : phase === 'answer' || hasContent ? 'responding' : 'thinking';
  // Once text starts, a simple request needs no extra status above the answer.
  if (!hasDetails && (!isStreaming || !busy)) return null;
  if (!hasDetails && busy && phase !== 'approval') return (
    <div className="thinking-indicator" data-animated={animated} role="status" aria-label="Thinking">
      <WorkStatusIcon state="thinking" animated={animated} surface={false} />
      <span className="thinking-label">Thinking<span className="thinking-ellipsis" aria-hidden="true">…</span></span>
      {seconds >= 8 && <span className="thinking-elapsed" aria-hidden="true">{seconds}s</span>}
    </div>
  );
  return <section className="response-trace" data-busy={busy} data-animated={animated} data-open={open}>
    <button type="button" className="trace-heading" disabled={!hasDetails} aria-expanded={hasDetails ? open : undefined}
      aria-label={vi ? `${title} · ${open ? 'Thu gọn' : 'Mở chi tiết'}` : `${title} · ${open ? 'Collapse' : 'Expand'}`}
      onClick={() => setManualOpen(!open)}>
      <WorkStatusIcon state={iconState} animated={animated && isStreaming} />
      <span className="trace-title" role="status">{title}</span>
      {seconds >= 2 && <span className="trace-duration">{seconds}s</span>}
      {hasDetails && <ChevronDown size={14} className="trace-chevron" />}
    </button>
    {open && hasDetails && <div className="trace-body">
      {reasoning.trim() && <div className="trace-reasoning">
        <span className="trace-section-label">{vi ? 'Suy luận' : 'Reasoning'}</span>
        <div className="trace-reasoning-text">{reasoning}</div>
      </div>}
      {tools.length > 0 && <div className="trace-tools-section">
        <div className="trace-section-label">{vi ? 'Hoạt động' : 'Activity'}<span>{tools.length}</span></div>
        <ol className="trace-tools">{tools.map(tool => <ActivityTool key={tool.id} tool={tool} vi={vi} autoExpand={autoExpandTools} />)}</ol>
      </div>}
      {busy && !running && tools.length > 0 && <div className="trace-continuing">{vi ? 'Đang tổng hợp kết quả' : 'Putting results together'}<span className="trace-live-dot" /></div>}
    </div>}
  </section>;
}
