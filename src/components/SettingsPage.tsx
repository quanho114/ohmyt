import React, { useState, useEffect, useRef } from 'react';
import type { MemoryItem, SkillItem, SystemStatus, AIProvider } from '../types.ts';
import type { Appearance, SettingsLocale } from '../appearance.ts';
import { History, Database, Wrench, Settings as SettingsIcon, Server, Trash2, Search, Square, ArrowLeft, PanelLeft, ChartNoAxesColumn } from 'lucide-react';
import { ProviderSettings } from './ProviderSettings.tsx';
import { StatisticsSettings } from './StatisticsSettings.tsx';
import { AppearanceSettings } from './AppearanceSettings.tsx';
import { normalizeSearch, settingsText } from '../settingsLocale.ts';

export type SettingsTab = 'timeline' | 'memory' | 'skills' | 'settings' | 'providers' | 'stats';

interface SectionItem {
  id: SettingsTab;
  label: string;
  icon: typeof SettingsIcon;
  description: string;
}

const sections: SectionItem[] = [
  { id: 'settings', label: 'Giao diện', icon: SettingsIcon, description: 'Chọn giao diện phù hợp với cách bạn làm việc.' },
  { id: 'providers', label: 'Nhà Cung Cấp AI', icon: Server, description: 'Kết nối nhà cung cấp và quản lý các mô hình AI của bạn.' },
  { id: 'memory', label: 'Bộ nhớ', icon: Database, description: 'Xem, tìm kiếm và quản lý thông tin trợ lý đã lưu.' },
  { id: 'skills', label: 'Kỹ năng Agent', icon: Wrench, description: 'Các kỹ năng trợ lý có thể sử dụng trong công việc.' },
  { id: 'timeline', label: 'Timeline', icon: History, description: 'Theo dõi hoạt động trong phiên làm việc hiện tại.' },
  { id: 'stats', label: 'Thống kê', icon: ChartNoAxesColumn, description: 'Tổng quan hoạt động và thống kê sử dụng của bạn.' }
];

const navGroups: Array<{ title: string; items: SectionItem[] }> = [
  { title: 'Cá nhân', items: [sections[0], sections[5]] },
  { title: 'Mô hình & Engine', items: [sections[1], sections[2], sections[3], sections[4]] }
];

type TimelineEvent = { type: string; payload: Record<string, unknown>; timestamp: number };

function simplifyTimelineEvents(events: TimelineEvent[]) {
  const starts = new Map(events.filter(event => event.type === 'ToolCallStarted').map(event => [String(event.payload.toolId || ''), event]));
  const completedIds = new Set(events.filter(event => event.type === 'ToolCallCompleted').map(event => String(event.payload.toolId || '')));
  const grouped = new Map<string, number>();
  const result: Array<{ event: TimelineEvent; repetitions: number }> = [];

  // ponytail: group identical calls per run; use per-call cards if retries need comparison.
  for (const event of events) {
    if (event.type === 'TextDelta') continue;
    const toolId = String(event.payload.toolId || '');
    if (event.type === 'ToolCallStarted' && completedIds.has(toolId)) continue;

    if (event.type === 'ToolCallCompleted') {
      const start = starts.get(toolId);
      const input = start?.payload.input && typeof start.payload.input === 'object' ? start.payload.input as Record<string, unknown> : {};
      const target = String(input.path || input.command || input.query || '');
      const key = `${event.payload.runId || ''}:${event.payload.toolName || ''}:${target}`;
      const existingIndex = grouped.get(key);
      if (existingIndex !== undefined) result[existingIndex].repetitions += 1;
      else {
        grouped.set(key, result.length);
        result.push({ event, repetitions: 1 });
      }
      continue;
    }

    result.push({ event, repetitions: 1 });
  }

  return result;
}

function describeEvent(event: TimelineEvent) {
  const payload = event.payload;
  const tool = String(payload.toolName || 'công cụ');
  const input = payload.input && typeof payload.input === 'object' ? payload.input as Record<string, unknown> : {};
  const target = String(payload.target || input.path || input.command || input.query || '');
  const shortTarget = target.length > 100 ? `${target.slice(0, 100)}…` : target;

  switch (event.type) {
    case 'RunStarted': return { title: 'Đã bắt đầu', subtitle: String(payload.prompt || '').slice(0, 100), color: 'var(--info)' };
    case 'ToolCallStarted': {
      const title = tool === 'fs_read' ? 'Đang đọc tệp' : tool === 'fs_write' ? 'Đang ghi tệp' : tool === 'fs_list' ? 'Đang xem thư mục' : tool === 'web_search' ? 'Đang tìm kiếm trên web' : tool === 'memory_search' ? 'Đang tìm trong bộ nhớ' : tool === 'memory_save' ? 'Đang lưu thông tin' : 'Đang chạy công cụ';
      return { title, subtitle: shortTarget, color: 'var(--info)' };
    }
    case 'PermissionRequired': return { title: 'Cần phê duyệt', subtitle: String(payload.description || shortTarget), color: 'var(--warning)' };
    case 'PermissionDenied': return { title: 'Đã từ chối quyền', subtitle: shortTarget, color: 'var(--warning)' };
    case 'ToolCallBlocked': return { title: 'Hành động bị chặn', subtitle: String(payload.reason || shortTarget), color: 'var(--danger)' };
    case 'ToolCallCompleted': return payload.success
      ? { title: 'Đã chạy công cụ', subtitle: `${tool}${typeof payload.durationMs === 'number' ? ` · ${payload.durationMs} ms` : ''}`, color: 'var(--success)' }
      : { title: 'Công cụ gặp lỗi', subtitle: tool, color: 'var(--danger)' };
    case 'MemoryUpdated': return { title: 'Đã lưu vào bộ nhớ', subtitle: String(payload.category || ''), color: 'var(--success)' };
    case 'ModelFallback': return { title: 'Offline mode', subtitle: String(payload.reason || 'Không tới được model đã chọn'), color: 'var(--warning)' };    case 'RunCompleted': return { title: 'Hoàn thành', subtitle: String(payload.summary || ''), color: 'var(--success)' };
    case 'RunAborted': return { title: 'Đã dừng tác vụ', subtitle: String(payload.reason || ''), color: 'var(--warning)' };
    case 'RunFailed': return { title: 'Tác vụ gặp lỗi', subtitle: String(payload.error || ''), color: 'var(--danger)' };
    default: return { title: event.type, subtitle: '', color: 'var(--text-tertiary)' };
  }
}

interface SettingsDialogProps {
  status: SystemStatus | null;
  memories: MemoryItem[];
  skills: SkillItem[];
  timelineEvents: Array<{ type: string; payload: Record<string, unknown>; timestamp: number }>;
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  isStreaming: boolean;
  appearance: Appearance;
  onChangeAppearance: (patch: Partial<Appearance>) => void;
  activeTheme: 'light' | 'dark';
  locale: SettingsLocale;
  saveState: 'saved' | 'failed';
  onTakeControl: () => void;
  onDeleteMemory: (id: string) => void;
  onRefreshMemories: (query?: string) => void;
  onClose: () => void;
  providers: AIProvider[];
  onRefreshProviders: () => void;
}

export const SettingsPage: React.FC<SettingsDialogProps> = ({
  status,
  memories,
  skills,
  timelineEvents,
  activeTab,
  onSelectTab,
  isStreaming,
  appearance,
  onChangeAppearance,
  activeTheme,
  locale,
  saveState,
  onTakeControl,
  onDeleteMemory,
  onRefreshMemories,
  onClose,
  providers,
  onRefreshProviders
}) => {
  const pageRef = useRef<HTMLDivElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState('');
  const section = sections.find(item => item.id === activeTab) || sections[0];
  const t = (key: string) => settingsText(locale, key);
  useEffect(() => { pageRef.current?.focus(); }, []);

  const [memorySearch, setMemorySearch] = useState('');
  const [showRawEvents, setShowRawEvents] = useState(false);


  const handleSearchMemory = (e: React.FormEvent) => {
    e.preventDefault();
    onRefreshMemories(memorySearch.trim() || undefined);
  };

  const visibleTimelineEvents = showRawEvents
    ? timelineEvents.map(event => ({ event, repetitions: 1 }))
    : simplifyTimelineEvents(timelineEvents);

  return (
    <div ref={pageRef} tabIndex={-1} className={`settings-page ${navOpen ? 'nav-open' : ''}`} aria-label={t('Cài đặt')}
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented || (event.target as HTMLElement).closest('select,[role="dialog"]')) return;
        event.preventDefault();
        if (navOpen) setNavOpen(false); else onClose();
      }}>
      <aside className="settings-page-sidebar">
        <header><button type="button" className="control-button" onClick={onClose} aria-label={t('Quay lại chat')}><ArrowLeft size={17} /></button><span>{t('Cài đặt')}</span><button type="button" className="control-button nav-collapse" onClick={() => setNavOpen(false)} aria-label={t('Thu gọn điều hướng')}><PanelLeft size={16} /></button></header>
        <label className="settings-page-search"><Search size={15} /><input type="search" aria-label={t('Tìm kiếm cài đặt...')} placeholder={t('Tìm kiếm cài đặt...')} value={settingsSearch} onChange={event => setSettingsSearch(event.currentTarget.value)} /></label>
        <nav aria-label={t('Cài đặt')}>
          {navGroups.map(group => {
            const items = group.items.filter(item => normalizeSearch(`${item.label} ${settingsText('en', item.label)}`).includes(normalizeSearch(settingsSearch)));
            return items.length ? <div className="settings-page-nav-group" key={group.title}><h2>{t(group.title)}</h2>{items.map(({ id, label, icon: Icon }) => <button key={id} type="button" className="settings-nav-item" aria-current={activeTab === id ? 'page' : undefined} aria-pressed={activeTab === id} onClick={() => { onSelectTab(id); setNavOpen(false); }}><Icon size={17} /><span>{t(label)}</span></button>)}</div> : null;
          })}
          {!sections.some(item => normalizeSearch(`${item.label} ${settingsText('en', item.label)}`).includes(normalizeSearch(settingsSearch))) && <p className="settings-search-empty">{t('Không tìm thấy mục phù hợp.')}</p>}
        </nav>
        <footer><span className="settings-engine-state"><i />{status?.db || 'SQLite'} · {status?.toolsCount ?? 0} tools</span><span>ohmyt · local-first</span></footer>
      </aside>
      <div className="settings-page-main">
        <header className="settings-page-title"><button type="button" className="control-button mobile-nav-button" aria-label={t('Mở điều hướng')} aria-expanded={navOpen} onClick={() => setNavOpen(current => !current)}><PanelLeft size={18} /></button><h1 id="settings-section-title">{t(section.label)}</h1><button type="button" className="control-button settings-back" aria-label={t('Quay lại chat')} onClick={onClose}><ArrowLeft size={17} /></button></header>
        <section id="settings-content" className={`settings-page-content ${activeTab === 'providers' ? 'provider-content' : ''}`} aria-labelledby="settings-section-title" key={activeTab}>
          <div className="settings-page-inner appearance-enter">
            {activeTab === 'providers' ? <ProviderSettings providers={providers} onRefresh={onRefreshProviders} locale={locale} /> : activeTab === 'stats' ? <StatisticsSettings /> : activeTab === 'settings' ? <AppearanceSettings appearance={appearance} onChangeAppearance={onChangeAppearance} activeTheme={activeTheme} locale={locale} saveState={saveState} /> : <div>
        {/* 1. TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="space-y-2">
            <div
              className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <span>{showRawEvents ? 'Sự kiện thô' : 'Hoạt động gần đây'}</span>
              <button
                type="button"
                onClick={() => setShowRawEvents(value => !value)}
                aria-pressed={showRawEvents}
                className="control-button px-1.5 py-1 text-[10px] normal-case tracking-normal"
                style={{ color: showRawEvents ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {showRawEvents ? 'Gỡ lỗi: bật' : 'Gỡ lỗi'}
              </button>
            </div>

            {visibleTimelineEvents.length === 0 ? (
              <div className="p-4 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {timelineEvents.length === 0 ? 'Chưa có hoạt động nào.' : 'Đang chờ hoạt động của công cụ.'}
              </div>
            ) : (
              <div
                className="ml-2 space-y-3 pl-3"
                style={{ borderLeft: '1px solid var(--border)' }}
              >
                {visibleTimelineEvents.map((evt, idx) => {
                    const event = evt.event;
                    const summary = describeEvent(event);
                    if (!showRawEvents && event.type === 'ToolCallCompleted' && evt.repetitions > 1) {
                      summary.subtitle = `${String(event.payload.toolName || 'Công cụ')} · ${evt.repetitions} lần`;
                    }
                  return (
                    <div key={`${event.timestamp}-${event.type}-${idx}`} className="relative text-xs">
                      <div
                        aria-hidden="true"
                        className="absolute -left-[17px] top-1 h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: summary.color,
                          border: '1px solid var(--sidebar)'
                        }}
                      />
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {showRawEvents ? event.type : summary.title}
                      </div>
                      {summary.subtitle && (
                        <div className="mt-0.5 break-words text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {summary.subtitle}
                        </div>
                      )}
                      <div className="mt-0.5 text-[10px] font-mono-code" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                      {showRawEvents && (
                        <details className="mt-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          <summary className="cursor-pointer">Payload</summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md p-2 font-mono-code" style={{ backgroundColor: 'var(--code-background)', color: 'var(--text-primary)' }}>
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {visibleTimelineEvents.length > 0 && (
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {visibleTimelineEvents.length} sự kiện
              </div>
            )}
          </div>
        )}

        {/* 2. MEMORY TAB */}
        {activeTab === 'memory' && (
          <div className="space-y-3">
            <div
              className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <span>Thông tin đã lưu ({memories.length})</span>
            </div>

            <form onSubmit={handleSearchMemory} className="flex gap-1.5">
              <input
                type="text"
                aria-label="Tìm kiếm bộ nhớ"
                placeholder="Tìm kiếm ký ức..."
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                className="flex-1 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                style={{
                  backgroundColor: 'var(--input-background)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--control-background)',
                  color: 'var(--text-primary)'
                }}
                title="Tìm kiếm"
                aria-label="Tìm kiếm bộ nhớ"
              >
                <Search size={13} />
              </button>
            </form>

            <div className="space-y-1.5">
              {memories.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {memorySearch ? 'Không tìm thấy ký ức phù hợp' : 'Chưa có thông tin nào được lưu trong bộ nhớ'}
                </div>
              ) : (
                memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="group p-2.5 rounded-lg flex items-start justify-between gap-2"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      boxShadow: 'var(--shadow-subtle)'
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="text-[10px] uppercase font-mono-code px-1.5 py-0.2 rounded"
                          style={{
                            backgroundColor: 'var(--control-background)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {mem.category}
                        </span>
                        <span className="text-[10px] font-mono-code" style={{ color: 'var(--text-tertiary)' }}>
                          {new Date(mem.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed select-text" style={{ color: 'var(--text-primary)' }}>
                        {mem.content}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteMemory(mem.id)}
                      className="delete-action opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded transition-opacity cursor-pointer"
                      style={{ color: 'var(--text-tertiary)' }}
                      title="Xóa ký ức"
                      aria-label="Xóa ký ức"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. SKILLS TAB */}
        {activeTab === 'skills' && (
          <div className="space-y-3">
            <div
              className="text-[11px] font-medium uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Kỹ năng Agent ({skills.length})
            </div>

            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="p-3 rounded-lg space-y-1.5"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-subtle)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {skill.name}
                    </span>
                    <span
                      className="text-[10px] font-mono-code px-1.5 py-0.2 rounded"
                      style={{
                        backgroundColor: 'var(--control-background)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      v{skill.version}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {skill.description}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {skill.requiredTools.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono-code px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: 'var(--control-background)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

              </div>}
          </div>
          </section>

      {isStreaming && (
        <div className="p-3" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--sidebar)' }}>
          <button
            type="button"
            onClick={onTakeControl}
            aria-label={t('Dừng tác vụ đang chạy')}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--danger)', color: 'var(--danger-contrast)' }}
          >
            <Square size={13} fill="currentColor" />
            <span>{t('Dừng tác vụ')}</span>
          </button>
        </div>
      )}
      </div>
    </div>
  );
};

