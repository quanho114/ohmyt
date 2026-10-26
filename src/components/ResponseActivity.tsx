import {activityTimeline} from '../harness/activityTimeline.ts';
import {reasoningPreview} from '../vendor/activity-summary/index.ts';
import { TraceDisclosure, TraceRow } from './ui/Trace.tsx';
import {ClientContributions} from '../harness/ClientContributions.tsx';
import {SubagentActivity} from './SubagentActivity.tsx';
import { useEffect, useMemo, useState } from 'react';
import { ListTree, ChevronDown, Globe, FileText, Folder, Terminal, Search, Database, ArrowUpRight, CircleCheck, CircleAlert, LoaderCircle } from 'lucide-react';
import { WorkStatusIcon, toolWorkState } from './WorkStatusIcon.tsx';
import type { WorkState } from './WorkStatusIcon.tsx';
import type { ToolCallItem, ResponseActivityData } from '../types.ts';

const toolKinds: Record<string, { vi: string; en: string; icon: typeof FileText; kind: string }> = {
  fs_read: { vi: 'Đọc tệp', en: 'Read file', icon: FileText, kind: 'file' },
  artifact_read: { vi: 'Đọc tài liệu', en: 'Read document', icon: FileText, kind: 'file' },
  artifact_save: { vi: 'Lưu tài liệu', en: 'Save document', icon: FileText, kind: 'file' },
  fs_write: { vi: 'Ghi tệp', en: 'Write file', icon: FileText, kind: 'file' },
  fs_edit: { vi: 'Sửa tệp', en: 'Edit file', icon: FileText, kind: 'edit' },
  html_preview: { vi: 'Tạo bản xem trước HTML', en: 'Create HTML preview', icon: FileText, kind: 'file' },
  fs_list: { vi: 'Khám phá thư mục', en: 'Browse directory', icon: Folder, kind: 'directory' },
  shell_host: { vi: 'Chạy lệnh trên máy', en: 'Run on this computer', icon: Terminal, kind: 'terminal' },
  shell_exec: { vi: 'Chạy lệnh', en: 'Run command', icon: Terminal, kind: 'terminal' },
  web_search: { vi: 'Tìm kiếm trên web', en: 'Search the web', icon: Search, kind: 'search' },
  web_fetch: { vi: 'Đọc nguồn trên web', en: 'Read web source', icon: Globe, kind: 'browser' },
  source_list: { vi: 'Xem nguồn đã đọc', en: 'View read sources', icon: FileText, kind: 'file' },
  source_read: { vi: 'Tra lại nội dung nguồn', en: 'Look up source text', icon: FileText, kind: 'file' },
  memory_save: { vi: 'Lưu ghi nhớ', en: 'Save memory', icon: Database, kind: 'memory' },
  memory_search: { vi: 'Tra cứu ghi nhớ', en: 'Search memory', icon: Database, kind: 'memory' },
};

const browserLabels: Record<string, [string, string]> = {
  tabs: ['Xem các tab', 'View tabs'], read: ['Đọc trang', 'Read page'], observe: ['Quan sát trang', 'Observe page'],
  navigate: ['Mở trang web', 'Open website'], new_tab: ['Mở tab mới', 'Open new tab'], click: ['Nhấp vào phần tử', 'Click element'],
  type: ['Nhập nội dung', 'Enter text'], scroll: ['Cuộn trang', 'Scroll page'], act: ['Thao tác trên trang', 'Interact with page'],
  extract: ['Trích xuất thông tin', 'Extract information'], screenshot: ['Chụp trang', 'Capture page'],
  wait: ['Chờ trang cập nhật', 'Wait for page'], recover: ['Kết nối lại trình duyệt', 'Reconnect browser'],
};
function toolDefinition(name: string) {
  if (toolKinds[name]) return toolKinds[name];
  if (name.startsWith('browser_')) {
    const action = name.replace(/^browser_(?:use_)?/, '');
    const label = browserLabels[action];
    return {vi: label?.[0] ?? 'Thao tác trình duyệt', en: label?.[1] ?? 'Browser action', icon: Globe, kind: 'browser'};
  }
  if (name === 'runtime_info') return {vi: 'Kiểm tra môi trường', en: 'Check environment', icon: Terminal, kind: 'runtime'};
  return undefined;
}

function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

function printable(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function ActivityTool({ tool, vi, autoExpand }: { tool: ToolCallItem; vi: boolean; autoExpand: boolean }) {
  const definition = toolDefinition(tool.name);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? (autoExpand && tool.status === 'running');
  const output = tool.output && typeof tool.output === 'object' ? tool.output as Record<string, unknown> : {};
  const target = tool.input.url ?? tool.input.path ?? tool.input.command ?? tool.input.query ?? tool.input.target ?? tool.input.title ?? (tool.name==='html_preview'?tool.input.name:tool.name==='artifact_read'?output.title:tool.input.content);
  const rawResults = output.results;
  const results = Array.isArray(rawResults) ? rawResults.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
  const resultText = definition?.kind === 'terminal'
    ? printable(output.stdout ?? (typeof tool.output === 'string' ? tool.output : ''))
    : printable(output.content ?? tool.output);
  const failed = tool.status === 'error' || tool.status === 'blocked';
  const uncertain=tool.status==='unknown'||output.code==='TOOL_OUTCOME_UNKNOWN';
  const budgetLimited = output.code === 'TOOL_STEP_LIMIT';
  const statusText = tool.status === 'running' ? (vi ? 'Đang chạy' : 'Running')
    : budgetLimited ? (vi ? 'Chưa chạy · đã đạt giới hạn bước công cụ' : 'Not run · tool step limit reached')
    : uncertain ? (vi ? 'Chưa rõ kết quả' : 'Outcome unknown')
    : tool.status === 'blocked' ? (vi ? 'Bị chặn' : 'Blocked')
      : failed ? (vi ? 'Thất bại' : 'Failed') : (vi ? 'Hoàn tất' : 'Completed');
  return <li className="trace-tool" data-open={open} data-kind={definition?.kind ?? 'generic'} data-status={uncertain?'unknown':tool.status}>
    <button className="trace-tool-toggle" data-trace-toggle type="button" aria-expanded={open}
      aria-label={`${definition?.[vi ? 'vi' : 'en'] ?? tool.name}: ${printable(target)} · ${statusText}`}
      onClick={() => setManualOpen(!open)}>
      <span className="trace-tool-icon" aria-hidden="true">
        {tool.status === 'running' ? <LoaderCircle size={15} className="trace-running-icon" />
          : failed || uncertain ? <CircleAlert size={15} /> : <CircleCheck size={15} />}
      </span>
      <span className="trace-tool-label">
        <span className="trace-tool-name">{definition?.[vi ? 'vi' : 'en'] ?? tool.name}</span>
        {target != null && <span className="trace-tool-target" title={printable(target)}>{printable(target)}</span>}
      </span>
      <span className="trace-tool-status sr-only">{statusText}</span>
      {(uncertain || budgetLimited || tool.status === 'blocked') && <span className="trace-tool-state-label">{statusText}</span>}
      <ChevronDown size={12} className="trace-tool-chevron" data-open={open} />
    </button>
    {uncertain&&<p className="trace-uncertain-note" role="note">{vi?'Thao tác có thể đã được thực hiện. Kiểm tra trạng thái thực tế trước khi thử lại.':'The action may have taken effect. Check the actual state before retrying.'}</p>}
    {Boolean(output.artifact)&&output.artifact!==null&&typeof output.artifact==='object'&&'artifactId' in output.artifact&&<button className="harness-artifact-link" onClick={event=>{const button=event.currentTarget;const artifact=output.artifact as {artifactId:string;sessionId:string;title:string};window.dispatchEvent(new CustomEvent('ohmyt-artifact-open',{detail:artifact}));window.addEventListener('ohmyt-artifact-closed',()=>button.focus(),{once:true});}}>{vi?'Mở tài liệu':'Open document'} · {String((output.artifact as {title?:string}).title || '')}</button>}
    <TraceDisclosure open={open}><div className="trace-tool-detail">
      {budgetLimited && <p role="note">{vi ? 'Thao tác này chưa được chạy vì lượt trả lời đã đạt giới hạn bước công cụ. Câu trả lời dùng kết quả của các bước trước đó.' : 'This action was not run because the response reached its tool step limit. The answer uses results from earlier steps.'}</p>}
      {definition?.kind === 'edit' && typeof output.diff === 'string' ? <div>
        <p>{uncertain ? statusText : output.applied === true ? (vi ? 'Đã sửa tệp' : 'File edited') : (vi ? 'Xem trước · chưa ghi tệp' : 'Preview · file not written')}</p>
        <pre className="trace-file-diff" aria-label={vi?'Thay đổi nội dung':'Content changes'}>{output.diff.split('\n').slice(0,205).map((line,index)=><span key={index} style={{display:'block',color:line.startsWith('+')?'var(--success)':line.startsWith('-')?'var(--danger)':undefined}}>{line || ' '}</span>)}</pre>
        {output.diffTruncated===true&&<p role="note">{vi?'Diff đã rút gọn. Mở tệp để xem các dòng còn lại.':'Diff shortened. Open the file to inspect the remaining lines.'}</p>}
      </div> : definition?.kind === 'browser' || definition?.kind === 'runtime' ? <div className="trace-browser-result">
        <p>{uncertain ? statusText : failed ? (vi ? 'Thao tác chưa thành công.' : 'Action did not succeed.') : tool.status === 'running' ? statusText : typeof output.title === 'string' ? output.title : statusText}</p>
        {typeof output.url === 'string' && <span className="trace-browser-url">{output.url}</span>}
        {Array.isArray(output.elements) && <span className="trace-preview-note">{output.elements.length} {vi ? 'phần tử tương tác' : 'interactive elements'}</span>}
        <details className="trace-raw"><summary>{vi ? 'Dữ liệu kỹ thuật' : 'Technical data'}</summary><pre>{printable({input:tool.input,output:tool.output}).slice(0,12000)}</pre></details>
      </div> : definition?.kind === 'terminal' ? <div className="trace-terminal">
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
        {definition?.kind === 'file' && <div className="trace-file-title"><FileText size={12} />{printable(tool.input.path??output.title??tool.input.title)}{typeof output.lines === 'number' && <span>{output.lines} {vi ? 'dòng' : 'lines'}</span>}</div>}
        <pre>{(resultText || printable(tool.input)).slice(0, 12000)}</pre>
      </div>}
      {resultText.length > 12000 && <span className="trace-preview-note">{vi ? 'Đã rút gọn bản xem trước' : 'Preview shortened'}</span>}
      {tool.durationMs != null && <span className="trace-preview-note">{(tool.durationMs / 1000).toFixed(1)}s</span>}
    </div></TraceDisclosure>
  </li>;
}

export function ResponseActivity({ tools, reasoning = '', progress = [], hasContent, locale, autoExpandTools, animated,
  isStreaming = true, startedAt, durationMs, status, phase,runId,outcome, contentLength = 0, answerComplete = false }: {
  outcome?:ResponseActivityData['outcome']; runId?:string; tools: ToolCallItem[]; reasoning?: string; progress?: string[]; hasContent: boolean; locale: 'vi' | 'en';
  autoExpandTools: boolean; animated: boolean; isStreaming?: boolean;
  startedAt?: number; durationMs?: number; status?: ResponseActivityData['status']; phase?: ResponseActivityData['phase'];
  contentLength?: number; answerComplete?: boolean;
}) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [manualOpen, setManualOpen] = useState<{open: boolean; streaming: boolean} | null>(null);
  const toolUpdates = tools.map(tool => `${tool.id}:${tool.status}`).join('|');
  const latestProgress = progress.at(-1);
  // A display-only timestamp: do not schedule another React commit per token.
  const lastUpdateAt = useMemo(() => Date.now(), [contentLength, reasoning, toolUpdates, latestProgress, phase, isStreaming, startedAt, runId]);
  useEffect(() => {
    if (!isStreaming) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isStreaming]);
  const vi = locale === 'vi';
  const running = tools.find(tool => tool.status === 'running');
  const busy = isStreaming && !answerComplete && (Boolean(running) || (phase ? phase !== 'answer' : !hasContent));
  // Keep the default compact. Commentary/tool phase changes must not open or
  // close a long trace under the user's pointer or change their scroll position.
  const open = manualOpen?.streaming === isStreaming ? manualOpen.open : false;
  useEffect(() => { setManualOpen(null); }, [runId, isStreaming]);
  const seconds = Math.max(0, Math.floor((durationMs ?? now - (startedAt ?? mountedAt)) / 1000));
  const quietSeconds = Math.max(0, Math.floor((now - lastUpdateAt) / 1000));
  const waitingForUpdate = isStreaming && !answerComplete && phase !== 'approval' && !running && quietSeconds >= 8;
  const hasDetails = Boolean(reasoning.trim() || progress.length || tools.length);
  // Sources come from recorded tool results, never from invented demo messages.
  const sources = new Map<string, string>();
  for (const tool of tools) {
    if (tool.status !== 'completed' || !tool.output || typeof tool.output !== 'object') continue;
    const output = tool.output as Record<string, unknown>;
    const results = Array.isArray(output.results) ? output.results : [];
    const candidates = tool.name.startsWith('browser_') ? [...results, output] : results;
    for (const result of candidates) {
      if (!result || typeof result !== 'object') continue;
      const source = result as Record<string, unknown>;
      const url = sourceUrl(source.url);
      if (url) sources.set(url, typeof source.title === 'string' && source.title.trim() ? source.title : new URL(url).hostname);
    }
  }
  const thinking = isStreaming && (phase === 'reasoning' || (!phase && busy && !running));
  // Successful receipts establish that steps ran, not that the objective was verified.
  const stepsExecuted = outcome?.taskStatus === 'unknown'
    && outcome.protocolStatus === 'completed' && !outcome.stopReason
    && outcome.unresolvedCallIds?.length === 0 && tools.length > 0
    && tools.every(tool => tool.status === 'completed'
      && !(tool.output && typeof tool.output === 'object' && (tool.output as {code?:unknown}).code === 'TOOL_OUTCOME_UNKNOWN'))
    && status !== 'error' && status !== 'warnings' && status !== 'aborted';
  const neutralTrace = !isStreaming && hasContent && (outcome?.taskStatus==='partial' || (!outcome && status==='warnings')) && status!=='error' && status!=='aborted';
  const preparing = phase?.startsWith('preparing:') ? phase.split(':') : null;
  const preparingFile=preparing&&['fs_write','fs_edit','artifact_save','html_preview'].includes(preparing[1]);
  const preparingTitle=preparing?.[1]==='html_preview'?(vi?'Đang soạn bản xem trước':'Drafting preview'):preparingFile?(vi?'Đang soạn nội dung tệp':'Drafting file contents'):(vi?'Đang chuẩn bị thao tác':'Preparing action');
  const writingPath=running&&['fs_write','fs_edit'].includes(running.name)&&typeof running.input.path==='string'?running.input.path:null;
  const preparation=preparing&&<div className="response-preparation">
    <FileText size={17} aria-hidden="true"/>
    <div><span>{preparingFile?(vi?'Nội dung đang được soạn':'Draft in progress'):(toolDefinition(preparing[1])?.[vi?'vi':'en']??(vi?'Đang chuẩn bị':'Preparing'))}</span>
    <small>{Number(preparing[2]||0).toLocaleString(vi?'vi-VN':'en-US')} {vi?'ký tự':'characters'}{preparingFile&&<> · {vi?'Chưa lưu tệp':'Not saved yet'}</>}</small></div>
    <LoaderCircle size={14} className={animated?'trace-preparing-spinner':undefined} aria-hidden="true"/>
  </div>;
  const title = !isStreaming ? (stepsExecuted ? (vi ? 'Đã thực hiện các bước' : 'Steps executed') : outcome?.taskStatus==='unknown' ? (vi ? 'Kết quả chưa được xác minh' : 'Result unverified') : outcome?.taskStatus==='partial' ? (hasContent ? (vi ? 'Chi tiết thực hiện' : 'Execution details') : (vi ? 'Có bước lỗi · cần kiểm tra kết quả' : 'Some steps failed · check results')) : outcome?.taskStatus==='blocked' ? (vi ? 'Chưa hoàn thành · gặp trở ngại' : 'Not completed · blocked') : outcome?.taskStatus==='failed' ? (vi ? 'Chưa hoàn thành' : 'Not completed') : outcome?.verificationStatus==='verified' ? (vi ? 'Đã xác minh kết quả' : 'Result verified') : status === 'aborted' ? (vi ? 'Đã dừng' : 'Stopped') : status === 'error' ? (vi ? 'Tác vụ gặp lỗi' : 'Task failed') : status === 'warnings' ? (hasContent ? (vi ? 'Chi tiết thực hiện' : 'Execution details') : (vi ? 'Có bước lỗi · cần kiểm tra kết quả' : 'Some steps failed · check results')) : (vi ? `Đã xử lý trong ${seconds} giây` : `Processed in ${seconds} seconds`))
    : answerComplete ? (vi ? 'Đang hoàn tất lượt' : 'Finishing up')
    : phase === 'approval' ? (vi ? 'Chờ bạn cho phép' : 'Waiting for approval')
    : running ? (writingPath?`${vi?'Đang ghi tệp':'Writing file'} · ${writingPath}`:(toolDefinition(running.name)?.[vi ? 'vi' : 'en'] ?? running.name))
    : phase === 'summary' ? (vi ? 'Đang tóm tắt lịch sử trò chuyện' : 'Summarizing conversation history')
    : preparing ? preparingTitle
      : waitingForUpdate ? (vi ? 'Đang chờ cập nhật từ mô hình' : 'Waiting for a model update')
      : phase === 'reasoning' ? (vi ? 'Đang suy nghĩ' : 'Thinking')
      : phase === 'answer' || hasContent ? (vi ? 'Đang nhận phản hồi' : 'Receiving response')
      : (vi ? 'Đang chờ mô hình' : 'Waiting for the model');
  const iconState: WorkState = !isStreaming ? (status === 'aborted' ? 'stopped' : status === 'error' || status === 'warnings' || outcome?.taskStatus==='blocked' || outcome?.taskStatus==='failed' || (outcome?.taskStatus==='unknown' && !stepsExecuted) ? 'error' : 'completed')
    : phase === 'approval' ? 'approval' : running ? toolWorkState(running.name) : preparingFile ? 'writing' : preparing || waitingForUpdate ? 'thinking' : phase === 'reasoning' ? 'thinking'
      : phase === 'answer' || hasContent ? 'responding' : 'thinking';
  // Text can be commentary before a large tool payload. Keep a visible status
  // until the run settles, including providers that do not expose reasoning.
  if (!hasDetails && !isStreaming) return null;
  if (!hasDetails) return (
    <div className="response-live-status" data-phase={phase} data-waiting={waitingForUpdate}>
      <div className="response-live-heading">
        <WorkStatusIcon state={iconState} size={18} animated={animated} surface={false} />
        <span className="response-live-title" role="status">{title}</span>
        <span className="trace-duration" aria-hidden="true">{seconds}s</span>
      </div>
      {preparation}
    </div>
  );
  return <section className="response-trace" data-busy={busy} data-animated={animated} data-open={open}>
    <button type="button" className="trace-heading" data-trace-toggle disabled={!hasDetails} aria-expanded={hasDetails ? open : undefined}
      aria-label={vi ? `${title} · ${open ? 'Thu gọn' : 'Mở chi tiết'}` : `${title} · ${open ? 'Collapse' : 'Expand'}`}
      onClick={() => setManualOpen({open: !open, streaming: isStreaming})}>
      {neutralTrace ? <ListTree size={15} aria-hidden="true"/> : <WorkStatusIcon state={iconState} size={iconState === 'thinking' ? 24 : iconState === 'responding' ? 18 : 15} surface={false} animated={animated && isStreaming} />}
      <span className="trace-title" role="status">{title}</span>
      {isStreaming && <span className="trace-duration" aria-hidden="true">{seconds}s</span>}
      {hasDetails && <ChevronDown size={14} className="trace-chevron" />}
    </button>
    {preparation}
    {runId&&<SubagentActivity runId={runId} live={isStreaming} en={!vi}/>}
    {hasDetails && <div className="trace-collapse" data-open={open} aria-hidden={!open} inert={!open}>
      <div className="trace-collapse-inner"><div className="trace-body">
      {stepsExecuted && <p className="trace-verification-note">{vi ? 'Các bước đã chạy thành công. Kết quả toàn bộ yêu cầu chưa được xác minh độc lập.' : 'The steps ran successfully. The overall task result has not been independently verified.'}</p>}
      {progress.length > 0 && <TraceRow title={vi ? `Tiến độ · ${progress.length} cập nhật` : `Progress · ${progress.length} updates`} icon={<ListTree size={15}/>} defaultOpen={false}><div className="trace-progress-log">{progress.map((text, index) => <p key={index}>{text}</p>)}</div></TraceRow>}
      <ClientContributions slot="activity.renderer" data={{runId,tools,status}}/>
      <ol className="trace-tools trace-timeline" aria-label={vi ? 'Các bước thực hiện' : 'Activity steps'}>
        {activityTimeline(reasoning, tools).map(entry => {
          if (entry.kind === 'tool') return <ActivityTool key={entry.key} tool={entry.tool} vi={vi} autoExpand={autoExpandTools}/>;
          const active = thinking && entry.tail;
          const preview = reasoningPreview(entry.text, active);
          return <li key={entry.key} className="trace-thinking-step" data-active={active || undefined}>
            <TraceRow title={preview || (vi ? 'Phân tích yêu cầu' : 'Analyzing the request')} defaultOpen={false}
              running={active} icon={active ? <LoaderCircle size={15} className="trace-running-icon"/> : <ListTree size={15}/> }>
              <div className="trace-reasoning trace-thoughts"><div className="trace-reasoning-text">{entry.text.trim()}</div></div>
            </TraceRow>
          </li>;
        })}
      </ol>
      {sources.size > 0 && <TraceRow title={vi ? `Đã tham khảo ${sources.size} nguồn` : `Used ${sources.size} sources`} icon={<Globe size={16} />}>
        <div className="trace-sources">{Array.from(sources, ([url, title]) => <a key={url} className="trace-source" href={url} target="_blank" rel="noopener noreferrer">
          <span className="trace-source-domain">{new URL(url).hostname}</span>
          <span className="trace-source-title">{title}</span><ArrowUpRight size={12} aria-hidden="true" />
          <span className="sr-only">{vi ? 'Mở trong tab mới' : 'Opens in a new tab'}</span>
        </a>)}</div>
      </TraceRow>}
    </div></div></div>}
  </section>;
}
