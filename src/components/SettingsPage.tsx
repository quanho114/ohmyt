import React, { useState, useEffect, useRef } from 'react';
import type { MemoryItem, SkillItem, AIProvider } from '../types.ts';
import type { Appearance, SettingsLocale } from '../appearance.ts';
import { History, Database, Wrench, Settings as SettingsIcon, Server, Trash2, Search, Square, ArrowLeft, PanelLeft, ChartNoAxesColumn, UserRound } from 'lucide-react';
import { ProviderSettings } from './ProviderSettings.tsx';
import { ProfileSettings } from './ProfileSettings.tsx';
import { SkillSettings } from './SkillSettings.tsx';
import { StatisticsSettings } from './StatisticsSettings.tsx';
import { AppearanceSettings } from './AppearanceSettings.tsx';
import { normalizeSearch, settingsText } from '../settingsLocale.ts';
import type { SettingsTextKey } from '../settingsLocale.ts';

export type SettingsTab = 'timeline' | 'memory' | 'skills' | 'settings' | 'providers' | 'stats' | 'profile';

interface SectionItem {
  id: SettingsTab;
  label: SettingsTextKey;
  icon: typeof SettingsIcon;
}

const sections: SectionItem[] = [
  { id: 'profile', label: 'Hồ sơ', icon: UserRound },
  { id: 'settings', label: 'Giao diện', icon: SettingsIcon },
  { id: 'providers', label: 'Nhà Cung Cấp AI', icon: Server },
  { id: 'memory', label: 'Bộ nhớ', icon: Database },
  { id: 'skills', label: 'Kỹ năng Agent', icon: Wrench },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'stats', label: 'Thống kê', icon: ChartNoAxesColumn }
];

const navGroups: Array<{ title: SettingsTextKey; items: SectionItem[] }> = [
  { title: 'Tài khoản', items: [sections[0]] },
  { title: 'Cá nhân', items: [sections[1], sections[6]] },
  { title: 'Mô hình & Engine', items: [sections[2], sections[3], sections[4], sections[5]] }
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

function describeEvent(event: TimelineEvent, locale: SettingsLocale) {
  const t = (key: SettingsTextKey) => settingsText(locale, key);
  const payload = event.payload;
  const tool = String(payload.toolName || t('Công cụ'));
  const input = payload.input && typeof payload.input === 'object' ? payload.input as Record<string, unknown> : {};
  const target = String(payload.target || input.path || input.command || input.query || '');
  const shortTarget = target.length > 100 ? `${target.slice(0, 100)}…` : target;

  switch (event.type) {
    case 'RunStarted': return { title: t('Đã bắt đầu'), subtitle: String(payload.prompt || '').slice(0, 100), color: 'var(--info)' };
    case 'ToolCallStarted': {
      const title: SettingsTextKey = tool === 'fs_read' ? 'Đang đọc tệp' : tool === 'fs_write' ? 'Đang ghi tệp' : tool === 'fs_list' ? 'Đang xem thư mục' : tool === 'web_search' ? 'Đang tìm kiếm trên web' : tool === 'memory_search' ? 'Đang tìm trong bộ nhớ' : tool === 'memory_save' ? 'Đang lưu thông tin' : 'Đang chạy công cụ';
      return { title: t(title), subtitle: shortTarget, color: 'var(--info)' };
    }
    case 'PermissionRequired': return { title: t('Cần phê duyệt'), subtitle: String(payload.description || shortTarget), color: 'var(--warning)' };
    case 'PermissionDenied': return { title: t('Đã từ chối quyền'), subtitle: shortTarget, color: 'var(--warning)' };
    case 'ToolCallBlocked': return { title: t('Hành động bị chặn'), subtitle: String(payload.reason || shortTarget), color: 'var(--danger)' };
    case 'ToolCallCompleted': return payload.success
      ? { title: t('Đã chạy công cụ'), subtitle: `${tool}${typeof payload.durationMs === 'number' ? ` · ${payload.durationMs} ms` : ''}`, color: 'var(--success)' }
      : { title: t('Công cụ gặp lỗi'), subtitle: tool, color: 'var(--danger)' };
    case 'MemoryUpdated': return { title: t('Đã lưu vào bộ nhớ'), subtitle: String(payload.category || ''), color: 'var(--success)' };
    case 'ModelFallback': return { title: t('Chế độ ngoại tuyến'), subtitle: String(payload.reason || t('Không tới được model đã chọn')), color: 'var(--warning)' };
    case 'RunCompleted': return { title: t('Hoàn thành'), subtitle: String(payload.summary || ''), color: 'var(--success)' };
    case 'RunAborted': return { title: t('Đã dừng tác vụ'), subtitle: String(payload.reason || ''), color: 'var(--warning)' };
    case 'RunFailed': return { title: t('Tác vụ gặp lỗi'), subtitle: String(payload.error || ''), color: 'var(--danger)' };
    default: return { title: event.type, subtitle: '', color: 'var(--text-tertiary)' };
  }
}

interface SettingsPageProps {
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
  onRefreshSkills?: () => void;
  navCollapsed?: boolean;
  onToggleNav?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
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
  onRefreshProviders,
  onRefreshSkills,
  navCollapsed: externalNavCollapsed,
  onToggleNav: externalOnToggleNav
}) => {
  const pageRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [internalNavCollapsed, setInternalNavCollapsed] = useState(false);
  const navCollapsed = externalNavCollapsed !== undefined ? externalNavCollapsed : internalNavCollapsed;
  const toggleNavCollapsed = externalOnToggleNav || (() => setInternalNavCollapsed(prev => !prev));
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [settingsSearch, setSettingsSearch] = useState('');
  const section = sections.find(item => item.id === activeTab) || sections[0];
  const t = (key: SettingsTextKey) => settingsText(locale, key);
  const query = normalizeSearch(settingsSearch);
  const matchesSearch = (item: SectionItem) => normalizeSearch(`${settingsText('vi', item.label)} ${settingsText('en', item.label)}`).includes(query);
  const closeMobileNav = () => {
    setNavOpen(false);
    requestAnimationFrame(() => pageRef.current?.focus());
  };
  useEffect(() => { pageRef.current?.focus(); }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => { setIsMobile(media.matches); setNavOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (navOpen && isMobile) navRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [navOpen, isMobile]);

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
    <div ref={pageRef} tabIndex={-1} lang={locale} className={`settings-page${navOpen ? ' nav-open' : ''}${navCollapsed ? ' nav-collapsed' : ''}`} aria-label={t('Cài đặt')}
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented || (event.target as HTMLElement).closest('select,dialog,[role="dialog"],[role="menu"],[role="listbox"]')) return;
        event.preventDefault();
        if (navOpen) closeMobileNav(); else onClose();
      }}>
      {isMobile && navOpen && <button type="button" className="settings-nav-backdrop" tabIndex={-1} aria-label={t('Đóng điều hướng')} onClick={closeMobileNav} />}
      <aside id="settings-navigation" ref={navRef} className="settings-page-sidebar" inert={(isMobile ? !navOpen : navCollapsed) || undefined}>
        <header><button type="button" className="settings-back-nav" onClick={onClose} aria-label={t('Quay lại chat')}><ArrowLeft size={17} /><span>{t('Quay lại')}</span></button></header>
        <label className="settings-page-search"><Search size={15} /><input type="search" aria-label={t('Tìm kiếm cài đặt...')} placeholder={t('Tìm kiếm cài đặt...')} value={settingsSearch} onChange={event => setSettingsSearch(event.currentTarget.value)} /></label>
        <nav aria-label={t('Cài đặt')}>
          {navGroups.map(group => {
            const items = group.items.filter(matchesSearch);
            return items.length ? <div className="settings-page-nav-group" key={group.title}><h2>{t(group.title)}</h2>{items.map(({ id, label, icon: Icon }) => <button key={id} type="button" className="settings-nav-item" aria-current={activeTab === id ? 'page' : undefined} onClick={() => { onSelectTab(id); if (isMobile) closeMobileNav(); }}><Icon size={17} /><span>{t(label)}</span></button>)}</div> : null;
          })}
          {!sections.some(matchesSearch) && <p className="settings-search-empty" role="status">{t('Không tìm thấy mục phù hợp.')}</p>}
        </nav>
        {isStreaming && isMobile && navOpen && <footer><button type="button" className="settings-nav-stop" onClick={onTakeControl} aria-label={t('Dừng tác vụ đang chạy')}><Square size={13} fill="currentColor" />{t('Dừng tác vụ')}</button></footer>}
      </aside>
      <main className="settings-page-main" inert={(isMobile && navOpen) || undefined}>
        {activeTab !== 'skills' && (
          <header className="settings-page-title">
            <h1 id="settings-section-title">{t(section.label)}</h1>
            <button
              type="button"
              className="control-button settings-back"
              aria-label={t('Quay lại chat')}
              onClick={onClose}
            >
              <ArrowLeft size={17} />
            </button>
          </header>
        )}
        <section id="settings-content" className={`settings-page-content ${activeTab === 'providers' ? 'provider-content' : ''} ${activeTab === 'skills' ? 'skill-content' : ''}`} aria-labelledby="settings-section-title" key={activeTab}>
          <div className="settings-page-inner appearance-enter">
            {activeTab === 'providers' ? (
              <ProviderSettings providers={providers} onRefresh={onRefreshProviders} locale={locale} />
            ) : activeTab === 'skills' ? (
              <SkillSettings
                skills={skills}
                onRefresh={onRefreshSkills || (() => {})}
                locale={locale}
                appearance={appearance}
                activeTheme={activeTheme}
                onClose={onClose}
                onToggleNav={() => {
                  if (isMobile) setNavOpen(current => !current);
                  else toggleNavCollapsed();
                }}
                navCollapsed={navCollapsed}
                isMobile={isMobile}
              />
            ) : activeTab === 'stats' ? (
              <StatisticsSettings locale={locale} />
            ) : activeTab === 'profile' ? (
              <ProfileSettings locale={locale} />
            ) : activeTab === 'settings' ? (
              <AppearanceSettings appearance={appearance} onChangeAppearance={onChangeAppearance} activeTheme={activeTheme} locale={locale} saveState={saveState} />
            ) : (
              <div>
        {/* 1. TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="space-y-2">
            <div
              className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <span>{t(showRawEvents ? 'Sự kiện thô' : 'Hoạt động gần đây')}</span>
              <button
                type="button"
                onClick={() => setShowRawEvents(value => !value)}
                aria-pressed={showRawEvents}
                className="control-button px-1.5 py-1 text-[10px] normal-case tracking-normal"
                style={{ color: showRawEvents ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {t(showRawEvents ? 'Gỡ lỗi: bật' : 'Gỡ lỗi')}
              </button>
            </div>

            {visibleTimelineEvents.length === 0 ? (
              <div className="p-4 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {t(timelineEvents.length === 0 ? 'Chưa có hoạt động nào.' : 'Đang chờ hoạt động của công cụ.')}
              </div>
            ) : (
              <div
                className="ml-2 space-y-3 pl-3"
                style={{ borderLeft: '1px solid var(--border)' }}
              >
                {visibleTimelineEvents.map((evt, idx) => {
                    const event = evt.event;
                    const summary = describeEvent(event, locale);
                    if (!showRawEvents && event.type === 'ToolCallCompleted' && evt.repetitions > 1) {
                      summary.subtitle = `${String(event.payload.toolName || t('Công cụ'))} · ${evt.repetitions} ${t('lần')}`;
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
                        {new Date(event.timestamp).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                      </div>
                      {showRawEvents && (
                        <details className="mt-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          <summary className="cursor-pointer">{t('Dữ liệu sự kiện')}</summary>
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
                {visibleTimelineEvents.length} {t('sự kiện')}
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
              <span>{t('Thông tin đã lưu')} ({memories.length})</span>
            </div>

            <form onSubmit={handleSearchMemory} className="flex gap-1.5">
              <input
                type="text"
                aria-label={t('Tìm kiếm bộ nhớ')}
                placeholder={t('Tìm kiếm ký ức...')}
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
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
                title={t('Tìm kiếm')}
                aria-label={t('Tìm kiếm bộ nhớ')}
              >
                <Search size={13} />
              </button>
            </form>

            <div className="space-y-1.5">
              {memories.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t(memorySearch ? 'Không tìm thấy ký ức phù hợp' : 'Chưa có thông tin nào được lưu trong bộ nhớ')}
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
                          {new Date(mem.created_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
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
                      title={t('Xóa ký ức')}
                      aria-label={t('Xóa ký ức')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

              </div>
            )}
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
      </main>
    </div>
  );
};

