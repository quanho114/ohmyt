import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { Project, Session, SystemStatus } from '../types.ts';
import { Trash2, Search, Settings as SettingsIcon, House, Archive, Pin, FolderPlus, Folder, ChevronDown, ChevronRight, PanelLeft, Check, X } from 'lucide-react';
import { Avatar } from './Avatar.tsx';
import { SessionActions } from './SessionActions.tsx';
import { ProjectActions } from './ProjectActions.tsx';
import { ArchivedChats } from './ArchivedChats.tsx';

interface SidebarProps {
  sessions: Session[];
  onCreateProjectChat: (projectId: string) => Promise<void>;
  onRefreshSessions: () => Promise<void>;
  sessionActivity?: Record<string, 'running' | 'waiting'>;
  unseenCompletedSessions?: Record<string, true>;
  activeSessionId: string | null;
  isHome: boolean;
  status: SystemStatus | null;
  agentStatus: 'idle' | 'running' | 'waiting_approval' | 'error';
  onGoHome: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => Promise<void>;
  onOpenSettings: () => void;
  onCollapse?: () => void;
  hidden?: boolean;
}

const PAGE_SIZE = 8;

function ProjectFolderIcon({ open }: { open: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
    <path d="M3 19V6.5A1.5 1.5 0 0 1 4.5 5h4.1a2 2 0 0 1 1.4.6L12 7.5h6.5A1.5 1.5 0 0 1 20 9v10" fill="currentColor" fillOpacity=".08" />
    {open ? <>
      <path d="M6 10h11" opacity=".4" />
      <path d="M3 19.5 5.7 12a1.5 1.5 0 0 1 1.4-1h13.3a1 1 0 0 1 .95 1.32l-2.2 6.6A1.6 1.6 0 0 1 17.6 20H4a1 1 0 0 1-1-.5Z" fill="var(--sidebar-bg, var(--surface))" />
      <path d="M3 19.5 5.7 12a1.5 1.5 0 0 1 1.4-1h13.3a1 1 0 0 1 .95 1.32l-2.2 6.6A1.6 1.6 0 0 1 17.6 20H4a1 1 0 0 1-1-.5Z" fill="currentColor" fillOpacity=".12" />
    </> : <path d="M3 10h17v8.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 18.5Z" fill="currentColor" fillOpacity=".12" />}
  </svg>;
}

type SortMode = 'new' | 'old' | 'az';
const SORT_LABEL: Record<SortMode, string> = { new: 'Mới nhất', old: 'Cũ nhất', az: 'A–Z' };
const SORT_CYCLE: SortMode[] = ['new', 'old', 'az'];

interface FolderItem {
  id: string;
  name: string;
}

// Folder ảo: frontend-only (localStorage), không cần migration DB.
// Muốn đồng bộ đa máy thì nâng lên bảng folders + API sau.
function loadLocal<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function groupOf(ts: number): string {
  const day = new Date(ts).toDateString();
  if (day === new Date().toDateString()) return 'Hôm nay';
  if (Date.now() - ts < 7 * 24 * 3600 * 1000) return '7 ngày qua';
  return 'Cũ hơn';
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  onCreateProjectChat,
  onRefreshSessions,
  sessionActivity = {},
  unseenCompletedSessions = {},
  activeSessionId,
  isHome,
  onGoHome,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onOpenSettings,
  onCollapse,
  hidden = false
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [projectError, setProjectError] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const updateProject = async (id: string, values: { name?: string; pinned?: boolean; section?: string | null }) => {
    const updated = await api.updateProject(id, values);
    setProjects(current => current.map(project => project.id === id ? updated : project));
    await onRefreshSessions();
  };
  const archiveProject = async (id: string) => {
    await api.archiveProjectChats(id, true);
    await onRefreshSessions();
    if (sessions.some(session => session.project_id === id && session.id === activeSessionId)) onGoHome();
  };
  const loadProjects = async () => {
    try { setProjects(await api.getProjects()); setProjectError(''); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProjectError(message.includes('Endpoint not found')
        ? 'Dịch vụ ohmyt cần khởi động lại để dùng Projects. Sau đó bấm Thử lại.'
        : message);
    }
  };
  useEffect(() => { void loadProjects(); }, []);
  const addProject = async (directory: string) => {
    setProjectBusy(true); setProjectError('');
    try {
      const project = await api.addProject(directory.trim());
      setProjects(current => [project, ...current.filter(p => p.id !== project.id)]);
      setProjectFormOpen(false); setProjectPath('');
      await onCreateProjectChat(project.id);
    } catch (error) { setProjectError(error instanceof Error ? error.message : String(error)); }
    finally { setProjectBusy(false); }
  };
  const chooseProject = async () => {
    setProjectError('');
    if (window.electronAPI?.selectProjectDirectory) {
      try { const directory = await window.electronAPI.selectProjectDirectory(); if (directory) await addProject(directory); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setProjectFormOpen(true);
        setProjectError(message.includes('No handler registered')
          ? 'Đóng và mở lại ohmyt để dùng hộp chọn thư mục. Bạn cũng có thể nhập đường dẫn bên dưới để thêm project ngay.'
          : 'Chưa mở được hộp chọn thư mục. Bạn có thể nhập đường dẫn bên dưới.');
      }
    } else setProjectFormOpen(true);
  };
  const newProjectChat = async (id: string) => {
    setProjectBusy(true); setProjectError('');
    try { await onCreateProjectChat(id); }
    catch (error) { setProjectError(error instanceof Error ? error.message : String(error)); }
    finally { setProjectBusy(false); }
  };
  const removeProject = async (id: string) => {
    setProjectBusy(true); setProjectError('');
    try {
      await api.removeProject(id);
      setProjects(current => current.filter(project => project.id !== id));
      await onRefreshSessions();
      if (sessions.some(session => session.project_id === id && session.id === activeSessionId)) onGoHome();
    } catch (error) { setProjectError(error instanceof Error ? error.message : String(error)); throw error; }
    finally { setProjectBusy(false); }
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameLock = useRef(false);
  useEffect(() => { if (editingId) { renameInputRef.current?.focus(); renameInputRef.current?.select(); } }, [editingId]);
  const beginRename = (session: Session) => {
    if (renameLock.current) return;
    setDraftTitle(session.title); setRenameError(''); setEditingId(session.id);
  };
  const saveRename = async (event: React.FormEvent, session: Session) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (renameLock.current || !title) return;
    if (title === session.title) { setEditingId(null); return; }
    renameLock.current = true; setRenameSaving(true); setRenameError('');
    try { await onRenameSession(session.id, title); setEditingId(null); }
    catch { setRenameError('Chưa lưu được tên. Bạn thử lại nhé.'); }
    finally { renameLock.current = false; setRenameSaving(false); }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => loadLocal<SortMode>('ohmyt_sidebar_sort', 'new'));
  const [folders, setFolders] = useState<FolderItem[]>(() => loadLocal<FolderItem[]>('ohmyt_folders', []));
  const [folderOf, setFolderOf] = useState<Record<string, string>>(() => loadLocal<Record<string, string>>('ohmyt_session_folders', {}));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (creatingFolder) folderInputRef.current?.focus();
  }, [creatingFolder]);

  const q = searchQuery.trim().toLowerCase();
  const sorted = sessions.filter(session => !session.archived_at).sort((a, b) => {
    if (sortMode === 'az') return a.title.localeCompare(b.title, 'vi');
    const ta = a.updated_at || a.created_at;
    const tb = b.updated_at || b.created_at;
    return sortMode === 'old' ? ta - tb : tb - ta;
  });
  const filtered = q
    ? sorted.filter(s => s.title.toLowerCase().includes(q))
    : sorted;
  const sectionNames = [...new Set(projects.map(project => project.section).filter((section): section is string => Boolean(section)))].sort((a, b) => a.localeCompare(b, 'vi'));
  const projectGroup = (project: Project) => project.pinned ? 'Đã ghim' : project.section || 'Dự án';
  const visibleProjects = projects.filter(project => !q || project.name.toLowerCase().includes(q) || filtered.some(s => s.project_id === project.id)).sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const groupA = projectGroup(a), groupB = projectGroup(b);
    if (groupA !== groupB) {
      if (groupA === 'Dự án') return -1;
      if (groupB === 'Dự án') return 1;
      return groupA.localeCompare(groupB, 'vi');
    }
    return b.created_at - a.created_at;
  });
  const inFolder = (s: Session) => folderOf[s.id] && folders.some(f => f.id === folderOf[s.id]);
  const unassigned = filtered.filter(s => !projects.some(project => project.id === s.project_id) && !inFolder(s));
  const visible = q || expanded ? unassigned : unassigned.slice(0, PAGE_SIZE);

  const cycleSort = () => {
    const next = SORT_CYCLE[(SORT_CYCLE.indexOf(sortMode) + 1) % SORT_CYCLE.length];
    setSortMode(next);
    saveLocal('ohmyt_sidebar_sort', next);
  };

  const commitFolders = (next: FolderItem[]) => {
    setFolders(next);
    saveLocal('ohmyt_folders', next);
  };

  const commitFolderOf = (next: Record<string, string>) => {
    setFolderOf(next);
    saveLocal('ohmyt_session_folders', next);
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      setNewFolderName('');
      return;
    }
    commitFolders([...folders, { id: 'fld_' + Math.random().toString(36).substring(2, 9), name }]);
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const handleDeleteFolder = (id: string) => {
    const f = folders.find(f => f.id === id);
    if (!f || !confirm(`Xóa folder "${f.name}"? Các phiên bên trong giữ lại.`)) return;
    commitFolders(folders.filter(f => f.id !== id));
    const next = { ...folderOf };
    for (const sid of Object.keys(next)) if (next[sid] === id) delete next[sid];
    commitFolderOf(next);
  };


  const groups: Array<{ label: string; items: Session[] }> = [];
  if (!q) {
    for (const s of visible) {
      const label = groupOf(s.updated_at || s.created_at);
      const g = groups.find(g => g.label === label);
      if (g) g.items.push(s);
      else groups.push({ label, items: [s] });
    }
  }

  const renderRow = (session: Session) => {
    const isActive = session.id === activeSessionId;
    return (
      <div
        key={session.id}
        className={`sidebar-session group flex items-center rounded-lg text-xs transition-all${isActive ? ' is-active' : ''}`}
        style={{
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: isActive ? 600 : 400
        }}
      >
        {editingId === session.id ? <form className="session-rename-inline" onSubmit={event => void saveRename(event, session)}>
          <div className="session-rename-field">
            <input ref={renameInputRef} aria-label="Tên cuộc trò chuyện" placeholder="Tên cuộc trò chuyện" value={draftTitle} maxLength={200} disabled={renameSaving} aria-invalid={Boolean(renameError)} aria-describedby={`rename-hint-${session.id}`} onChange={event => setDraftTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !renameSaving) { event.preventDefault(); setEditingId(null); } }} />
            <button type="submit" aria-label="Lưu tên" title="Lưu tên" disabled={renameSaving || !draftTitle.trim()}><Check size={15} /></button>
            <button type="button" aria-label="Hủy đổi tên" title="Hủy" disabled={renameSaving} onClick={() => setEditingId(null)}><X size={15} /></button>
          </div>
          <p id={`rename-hint-${session.id}`} role={renameError ? 'alert' : 'status'} className={renameError ? 'session-rename-error' : ''}>{renameError || (renameSaving ? 'Đang lưu…' : 'Enter để lưu · Esc để hủy')}</p>
        </form> : <><button
          type="button"
          onDoubleClick={() => beginRename(session)}
          onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); beginRename(session); } }}
          onClick={() => {
            onSelectSession(session.id);
            setSearchOpen(false);
          }}
          title={session.title}
          aria-label={session.title}
          aria-current={isActive ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left cursor-pointer"
        >
          {sessionActivity[session.id] && <span className="sidebar-run-spinner" data-waiting={sessionActivity[session.id] === 'waiting'} role="img" aria-label={sessionActivity[session.id] === 'waiting' ? 'Chờ bạn duyệt' : 'Đang chạy'} title={sessionActivity[session.id] === 'waiting' ? 'Chờ bạn duyệt' : 'Đang chạy'} />}
          {!sessionActivity[session.id] && unseenCompletedSessions[session.id] && <span className="sidebar-run-completed" role="img" aria-label="Đã hoàn tất · Chưa xem" title="Đã hoàn tất · Chưa xem"><Check size={14} strokeWidth={2.5} aria-hidden="true" /></span>}
          <span className="sidebar-session-name flex-1 truncate">{session.title}</span>
        </button>
        <SessionActions
          session={session}
          folders={folders}
          folderId={folderOf[session.id]}
          onMoveFolder={folderId => {
            const next = { ...folderOf };
            if (folderId) next[session.id] = folderId; else delete next[session.id];
            commitFolderOf(next);
          }}
          onRequestRename={() => beginRename(session)}
          onRename={title => onRenameSession(session.id, title)}
          onDelete={() => onDeleteSession(session.id)}
        /></>}
      </div>
    );
  };

  return (
    <aside
      className={`sidebar-panel flex flex-shrink-0 flex-col select-none${hidden ? ' is-collapsed' : ''}`}
      style={{ backgroundColor: 'var(--sidebar)' }}
      inert={hidden || undefined}
    >
      <div className="sidebar-brand flex items-center gap-2.5 pl-4 pr-2 py-2.5">
        <Avatar kind="assistant" size={28} showStatusDot={false} />
        <span className="sidebar-brand-copy text-[13px] font-semibold tracking-tight truncate flex-1" style={{ color: 'var(--text-primary)' }}>
          ohmyt
        </span>
      </div>

      <div className="pl-2.5 pr-0 pb-1 space-y-1">
        <button
          type="button"
          onClick={onGoHome}
          aria-label="Trang chủ"
          aria-current={isHome ? 'page' : undefined}
          className={`sidebar-nav-item flex w-full items-center gap-2 px-3 py-2 text-xs font-medium cursor-pointer${isHome ? ' is-active' : ''}`}
          style={{ color: isHome ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          <House size={14} className="flex-shrink-0" />
          <span className="truncate">Trang chủ</span>
        </button>
      </div>

      <div className="sidebar-session-list min-h-0 flex-1 space-y-1 overflow-y-auto pl-2 pr-0 pb-2">
        <div className="sidebar-projects-zone">
        <div className="sidebar-projects-head flex items-center justify-between px-2.5 py-1.5">
          {projects.length > 0 ? <button type="button" onClick={() => setProjectsCollapsed(value => !value)} aria-expanded={!projectsCollapsed} aria-label={projectsCollapsed ? 'Mở rộng danh sách project' : 'Thu gọn danh sách project'} title="Thu gọn/mở rộng Projects" className="flex min-w-0 flex-1 items-center gap-1.5 cursor-pointer">
            <span className="text-[11px] font-medium uppercase" style={{ color: 'var(--text-tertiary)' }}>Projects</span>
            <ChevronDown size={13} aria-hidden="true" className={`project-chevron project-section-chevron flex-shrink-0${projectsCollapsed ? '' : ' is-open'}`} />
          </button> : <span className="text-[11px] font-medium uppercase" style={{ color: 'var(--text-tertiary)' }}>Projects</span>}
          <button type="button" onClick={() => void chooseProject()} disabled={projectBusy} aria-label="Thêm project" title="Thêm project" className="control-button rounded-md p-1.5 project-add-trigger"><FolderPlus size={14} /></button>
        </div>
        {(!projectsCollapsed || projects.length === 0) && <>{projectError && <div className="px-2.5 text-xs space-y-1"><p role="alert" className="text-red-500">{projectError}</p>{!projectFormOpen && <button type="button" onClick={() => void loadProjects()} className="control-button rounded-md px-2 py-1">Thử lại</button>}</div>}
        {projectFormOpen && <form className="px-2.5 space-y-2 py-2" onSubmit={event => { event.preventDefault(); if (!projectBusy) void addProject(projectPath); }}>
          <label className="text-xs" htmlFor="project-directory">Thư mục trên máy chạy ohmyt</label>
          <input autoFocus id="project-directory" placeholder="/home/user/Projects/my-app" value={projectPath} onChange={event => setProjectPath(event.target.value)} disabled={projectBusy} className="w-full rounded-md p-2 text-xs" style={{ background: 'var(--input-background)', border: '1px solid var(--border)' }} />
          <div className="flex gap-2 text-xs"><button type="submit" disabled={projectBusy || !projectPath.trim()}>{projectBusy ? 'Đang thêm…' : 'Thêm và mở chat'}</button><button type="button" onClick={() => setProjectFormOpen(false)} disabled={projectBusy}>Hủy</button></div>
        </form>}
        {visibleProjects.map((project, index) => {
          const items = (q && project.name.toLowerCase().includes(q) ? sorted : filtered).filter(s => s.project_id === project.id);
          const projectOpen = !collapsed[project.id] || Boolean(q);
          return <div key={project.id}>
            {(index === 0 || projectGroup(visibleProjects[index - 1]) !== projectGroup(project)) && (sectionNames.length > 0 || projects.some(p => p.pinned)) && <div className="sidebar-project-group">{projectGroup(project)}</div>}
            <div className="sidebar-project-row flex items-center rounded-lg">
              <button type="button" aria-expanded={projectOpen} onClick={() => setCollapsed(current => ({ ...current, [project.id]: !current[project.id] }))} title={project.path} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-xs text-left cursor-pointer">
                <ProjectFolderIcon open={projectOpen} /><span className="truncate">{project.name}</span>{Boolean(project.pinned) && <Pin size={11} aria-label="Đã ghim" className="shrink-0 opacity-50" />}
              </button>
              <ProjectActions project={project} disabled={projectBusy} sections={sectionNames} chatCount={sessions.filter(s => s.project_id === project.id && !s.archived_at).length} onUpdate={values => updateProject(project.id, values)} onArchive={() => archiveProject(project.id)} onRemove={() => removeProject(project.id)} />
              <button type="button" disabled={projectBusy} onClick={() => void newProjectChat(project.id)} aria-label={`Chat mới trong ${project.name}`} title="Chat mới trong project" className="control-button rounded-md p-1.5 mr-1 project-new-chat-trigger">+</button>
            </div>
            {projectOpen && <div className="pl-3">{items.map(renderRow)}{items.length === 0 && <button type="button" disabled={projectBusy} className="px-2.5 py-2 text-xs" onClick={() => void newProjectChat(project.id)}>Bắt đầu chat trong project</button>}</div>}
          </div>;
        })}
        </>}
        </div>
        <div className={`sidebar-search px-0.5 pb-1${searchOpen ? ' is-open' : ''}`}>
          <div className="sidebar-search-field relative flex items-center">
            <Search size={13} aria-hidden="true" className="pointer-events-none absolute left-2.5" style={{ color: 'var(--text-tertiary)' }} />
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Tìm kiếm phiên làm việc"
              placeholder="Tìm kiếm..."
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false); }}
              className="w-full rounded-md py-1.5 pl-8 pr-2.5 text-xs focus:outline-none"
              style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {creatingFolder && (
          <div className="flex items-center gap-2 px-2.5 py-1">
            <Folder size={13} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <input
              ref={folderInputRef}
              type="text"
              aria-label="Tên folder mới"
              placeholder="Tên folder..."
              value={newFolderName}
              onChange={event => setNewFolderName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleCreateFolder();
                if (event.key === 'Escape') {
                  setCreatingFolder(false);
                  setNewFolderName('');
                }
              }}
              onBlur={() => {
                if (!newFolderName.trim()) {
                  setCreatingFolder(false);
                  setNewFolderName('');
                }
              }}
              className="w-full rounded-md py-1.5 px-2.5 text-xs focus:outline-none"
              style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {q ? 'Không tìm thấy phiên' : 'Chưa có phiên nào'}
          </div>
        ) : q ? (
          filtered.filter(session => !projects.some(project => project.id === session.project_id)).map(renderRow)
        ) : (
          <>
            {folders.map(f => {
              const items = filtered.filter(s => !projects.some(project => project.id === s.project_id) && folderOf[s.id] === f.id);
              const isCollapsed = Boolean(collapsed[f.id]);
              return (
                <div key={f.id}>
                  <div className="group flex items-center rounded-lg">
                    <button
                      type="button"
                      onClick={() => setCollapsed(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                      aria-expanded={!isCollapsed}
                      title={f.name}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left cursor-pointer"
                    >
                      {isCollapsed
                        ? <ChevronRight size={13} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                        : <ChevronDown size={13} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
                      <Folder size={13} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="flex-1 truncate text-[11px] font-medium tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>
                        {f.name}
                      </span>
                      <span className="flex-shrink-0 text-[10px] font-mono-code" style={{ color: 'var(--text-tertiary)' }}>
                        {items.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(f.id)}
                      title={`Xóa folder: ${f.name}`}
                      aria-label={`Xóa folder: ${f.name}`}
                      className="delete-action rounded p-1 opacity-0 transition-all focus-visible:opacity-100 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 mr-1 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {!isCollapsed && items.map(renderRow)}
                </div>
              );
            })}
            {groups.map(g => (
              <div key={g.label}>
                <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-medium tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>
                  {folders.length > 0 ? `Chưa xếp · ${g.label}` : g.label}
                </div>
                {g.items.map(renderRow)}
              </div>
            ))}
          </>
        )}
        {!q && unassigned.length > PAGE_SIZE && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="w-full px-2.5 py-1.5 text-left text-[11px] cursor-pointer rounded-lg hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {expanded ? 'Thu gọn' : `Xem thêm ${unassigned.length - PAGE_SIZE} phiên`}
          </button>
        )}
      </div>

      <div className="pl-2.5 pr-0 py-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button type="button" onClick={() => setArchiveOpen(true)} className="sidebar-nav-item flex w-full items-center gap-2 px-3 py-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}><Archive size={14} /><span>Đã lưu trữ</span>{sessions.some(s => s.archived_at) && <span className="ml-auto text-[10px]">{sessions.filter(s => s.archived_at).length}</span>}</button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Mở cài đặt"
          className="sidebar-nav-item flex w-full items-center gap-2 px-3 py-2 text-xs font-medium cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <SettingsIcon size={14} className="flex-shrink-0" />
          <span className="truncate">Cài đặt</span>
        </button>
      </div>
      {archiveOpen && <ArchivedChats sessions={sessions.filter(session => session.archived_at)} onClose={() => setArchiveOpen(false)} onRestore={async id => { await api.archiveSession(id, false); await onRefreshSessions(); }} onSelect={id => { setArchiveOpen(false); onSelectSession(id); }} />}
    </aside>
  );
};
