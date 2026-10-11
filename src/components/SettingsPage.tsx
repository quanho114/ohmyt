import {ClientContributions} from '../harness/ClientContributions.tsx';
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.ts';
import type { Project, MemoryItem, SkillItem, AIProvider } from '../types.ts';
import type { Appearance, SettingsLocale } from '../appearance.ts';
import { Database, Wrench, Settings as SettingsIcon, Server, Trash2, Search, Square, ArrowLeft, PanelLeft, ChartNoAxesColumn, UserRound } from 'lucide-react';
import { ProviderSettings } from './ProviderSettings.tsx';
import { ProfileSettings } from './ProfileSettings.tsx';
import { SkillSettings } from './SkillSettings.tsx';
import { StatisticsSettings } from './StatisticsSettings.tsx';
import { AppearanceSettings } from './AppearanceSettings.tsx';
import { normalizeSearch, settingsText } from '../settingsLocale.ts';
import type { SettingsTextKey } from '../settingsLocale.ts';

export type SettingsTab = 'memory' | 'skills' | 'settings' | 'providers' | 'stats' | 'profile';

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
  { id: 'stats', label: 'Thống kê', icon: ChartNoAxesColumn },
];

const navGroups: Array<{ title: SettingsTextKey; items: SectionItem[] }> = [
  { title: 'Tài khoản', items: sections.filter(section => section.id === 'profile') },
  { title: 'Cá nhân', items: sections.filter(section => ['settings', 'stats'].includes(section.id)) },
  { title: 'Mô hình & Engine', items: sections.filter(section => ['providers', 'memory', 'skills'].includes(section.id)) }
];

interface SettingsPageProps {
  memories: MemoryItem[];
  skills: SkillItem[];
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

  const [scopeProjects, setScopeProjects] = useState<Project[]>([]);
  const [permissionsProject, setPermissionsProject] = useState('');
  const [projectGrants, setProjectGrants] = useState<Array<{pattern:string;action:string}>>([]);
  const [scopeError, setScopeError] = useState('');
  const [scopeBusy, setScopeBusy] = useState(false);
  useEffect(() => { api.getProjects().then(setScopeProjects).catch(() => {}); }, []);
  useEffect(() => {
    let current = true;
    setProjectGrants([]);
    if (permissionsProject) api.getProjectPermissions(permissionsProject).then(grants => {if(current) setProjectGrants(grants);}).catch(error=>{if(current) setScopeError(error.message);});
    return () => {current=false;};
  }, [permissionsProject]);
  const scopeName = (scope: string) => scopeProjects.find(p=>`project:${p.id}`===scope)?.name || scope;
  const assignMemory = async (id: string, projectId: string | null) => {
    setScopeBusy(true); setScopeError('');
    try {await api.assignMemoryProject(id,projectId); onRefreshMemories(memorySearch.trim() || undefined);}
    catch(error) {setScopeError(error instanceof Error ? error.message : String(error));}
    finally {setScopeBusy(false);}
  };
  const revokeGrant = async (pattern: string) => {
    setScopeBusy(true);setScopeError('');
    try {await api.revokeProjectPermission(permissionsProject,pattern);setProjectGrants(current=>current.filter(grant=>grant.pattern!==pattern));}
    catch(error) {setScopeError(error instanceof Error ? error.message : String(error));}
    finally {setScopeBusy(false);}
  };
  const [memoryScope, setMemoryScope] = useState('all');
  const visibleMemories = memories.filter(mem => memoryScope === 'all' || (mem.scope_id || 'legacy:unassigned') === memoryScope);
  const memoryScopes = [...new Set(memories.map(mem => mem.scope_id || 'legacy:unassigned'))];
  const [memorySearch, setMemorySearch] = useState('');


  const handleSearchMemory = (e: React.FormEvent) => {
    e.preventDefault();
    onRefreshMemories(memorySearch.trim() || undefined);
  };

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
        <section id="settings-content" className={`settings-page-content ${activeTab === 'settings' ? 'appearance-content' : ''} ${activeTab === 'providers' ? 'provider-content' : ''} ${activeTab === 'skills' ? 'skill-content' : ''}`} aria-labelledby="settings-section-title" key={activeTab}>
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
        {/* 2. MEMORY TAB */}
        {activeTab === 'memory' && (
          <div className="space-y-3">
            <div
              className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <span>{t('Thông tin đã lưu')} ({memories.length})</span>
            </div>

            {scopeError && <p role="alert" className="text-xs text-red-500">{scopeError}</p>}
            <div className="space-y-2 text-xs">
              <label>Quyền đã lưu của project <select aria-label="Project quản lý quyền" value={permissionsProject} onChange={event=>setPermissionsProject(event.target.value)} className="rounded px-2 py-1" style={{background:'var(--surface)'}}><option value="">Chọn project</option>{scopeProjects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              {permissionsProject && <p>Agent chỉ thao tác trong project. Mạng, shell host và kỹ năng/plugin ngoài phạm vi đang tắt.</p>}
              {permissionsProject && projectGrants.length===0 && <p>Chưa có quyền luôn cho phép.</p>}
              {projectGrants.map(grant=><div key={grant.pattern} className="flex items-center justify-between gap-2"><span className="break-all">{grant.pattern}</span><button type="button" disabled={scopeBusy} onClick={()=>void revokeGrant(grant.pattern)}>Thu hồi</button></div>)}
            </div>
            <label className="text-xs">Phạm vi bộ nhớ
              <select aria-label="Phạm vi bộ nhớ" value={memoryScope} onChange={event => setMemoryScope(event.target.value)} className="ml-2 rounded px-2 py-1" style={{background:'var(--surface)'}}>
                <option value="all">Tất cả — chế độ quản lý</option>
                {memoryScopes.map(scope => <option key={scope} value={scope}>{scope === 'legacy:unassigned' ? 'Dữ liệu cũ chưa phân loại' : scopeName(scope)}</option>)}
              </select>
            </label>
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
              {visibleMemories.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t(memorySearch ? 'Không tìm thấy ký ức phù hợp' : 'Chưa có thông tin nào được lưu trong bộ nhớ')}
                </div>
              ) : (
                visibleMemories.map((mem) => (
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
                          {mem.category} · {mem.scope_id === 'legacy:unassigned' ? 'Chưa phân loại — agent không hồi tưởng' : scopeName(mem.scope_id || 'Chưa phân loại')}
                        </span>
                        <select aria-label="Gán bộ nhớ vào project" disabled={scopeBusy} value={mem.scope_id?.startsWith('project:') ? mem.scope_id.slice(8) : ''} onChange={event=>void assignMemory(mem.id,event.target.value || null)} className="rounded text-xs px-2 py-1" style={{background:'var(--surface)'}}>
                          <option value="">Không chia sẻ cho project</option>{scopeProjects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}
                        </select>
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

