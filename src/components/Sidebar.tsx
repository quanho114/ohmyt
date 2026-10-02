import React, { useEffect, useRef, useState } from 'react';
import { Session, SystemStatus } from '../types.ts';
import { Trash2, Search, Settings as SettingsIcon, House, ArrowUpDown, FolderPlus, Folder, ChevronDown, ChevronRight, FolderInput } from 'lucide-react';
import { Avatar } from './Avatar.tsx';

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  isHome: boolean;
  status: SystemStatus | null;
  agentStatus: 'idle' | 'running' | 'waiting_approval' | 'error';
  onGoHome: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
}

const PAGE_SIZE = 8;

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

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}ph`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}g`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}ng`;
  return new Date(ts).toLocaleDateString();
}

function groupOf(ts: number): string {
  const day = new Date(ts).toDateString();
  if (day === new Date().toDateString()) return 'Hôm nay';
  if (Date.now() - ts < 7 * 24 * 3600 * 1000) return '7 ngày qua';
  return 'Cũ hơn';
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  isHome,
  status,
  agentStatus,
  onGoHome,
  onSelectSession,
  onDeleteSession,
  onOpenSettings
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => loadLocal<SortMode>('ohmyt_sidebar_sort', 'new'));
  const [folders, setFolders] = useState<FolderItem[]>(() => loadLocal<FolderItem[]>('ohmyt_folders', []));
  const [folderOf, setFolderOf] = useState<Record<string, string>>(() => loadLocal<Record<string, string>>('ohmyt_session_folders', {}));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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

  const statusText = agentStatus === 'running'
    ? 'Đang xử lý'
    : agentStatus === 'waiting_approval'
      ? 'Chờ cấp quyền'
      : agentStatus === 'error'
        ? 'Lỗi'
        : status?.llm.available ? 'Model connected' : 'Local Engine';
  const statusColor = agentStatus === 'running'
    ? 'var(--success)'
    : agentStatus === 'waiting_approval'
      ? 'var(--warning)'
      : agentStatus === 'error'
        ? 'var(--danger)'
        : 'var(--text-tertiary)';

  const q = searchQuery.trim().toLowerCase();
  const sorted = [...sessions].sort((a, b) => {
    if (sortMode === 'az') return a.title.localeCompare(b.title, 'vi');
    const ta = a.updated_at || a.created_at;
    const tb = b.updated_at || b.created_at;
    return sortMode === 'old' ? ta - tb : tb - ta;
  });
  const filtered = q
    ? sorted.filter(s => s.title.toLowerCase().includes(q))
    : sorted;
  const inFolder = (s: Session) => folderOf[s.id] && folders.some(f => f.id === folderOf[s.id]);
  const unassigned = filtered.filter(s => !inFolder(s));
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

  // Nút gán nhanh: bấm để chuyển phiên sang folder kế tiếp (cuối vòng về Chưa xếp).
  const moveToNextFolder = (sessionId: string) => {
    if (folders.length === 0) return;
    const cur = folderOf[sessionId];
    const idx = folders.findIndex(f => f.id === cur);
    const next = { ...folderOf };
    if (idx === -1) next[sessionId] = folders[0].id;
    else if (idx === folders.length - 1) delete next[sessionId];
    else next[sessionId] = folders[idx + 1].id;
    commitFolderOf(next);
  };

  const nextFolderName = (sessionId: string) => {
    const cur = folderOf[sessionId];
    const idx = folders.findIndex(f => f.id === cur);
    if (idx === -1) return folders[0]?.name ?? '';
    if (idx === folders.length - 1) return 'Chưa xếp';
    return folders[idx + 1].name;
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
        <button
          type="button"
          onClick={() => {
            onSelectSession(session.id);
            setSearchOpen(false);
          }}
          title={session.title}
          aria-label={session.title}
          aria-current={isActive ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left cursor-pointer"
        >
          <span className="sidebar-session-name flex-1 truncate">{session.title}</span>
          <span className="flex-shrink-0 text-[10px] font-mono-code" style={{ color: 'var(--text-tertiary)' }}>
            {timeAgo(session.updated_at || session.created_at)}
          </span>
        </button>
        {folders.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              moveToNextFolder(session.id);
            }}
            title={`Chuyển tới: ${nextFolderName(session.id)}`}
            aria-label={`Chuyển phiên sang ${nextFolderName(session.id)}`}
            className="rounded p-1 opacity-0 transition-all focus-visible:opacity-100 group-hover:opacity-100 hover:bg-[var(--surface-hover)] mr-0.5 cursor-pointer"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <FolderInput size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteSession(session.id);
          }}
          title={`Xóa phiên: ${session.title}`}
          aria-label={`Xóa phiên: ${session.title}`}
          className="delete-action sidebar-session-action rounded p-1 opacity-0 transition-all focus-visible:opacity-100 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 mr-1 cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  };

  return (
    <aside
      className="sidebar-panel flex flex-shrink-0 flex-col select-none"
      style={{ backgroundColor: 'var(--sidebar)' }}
    >
      <div className="sidebar-brand flex items-center gap-2.5 px-4 py-3">
        <Avatar kind="assistant" status={agentStatus} size={28} />
        <span className="sidebar-brand-copy text-[13px] font-semibold tracking-tight truncate flex-1" style={{ color: 'var(--text-primary)' }}>
          ohmyt
        </span>
        <span aria-hidden="true" title={statusText} className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
      </div>

      <div className="px-2.5 pb-1 space-y-1">
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

      <div className="sidebar-session-list min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        <div className="sidebar-section-head flex items-center justify-between px-2.5 py-1.5">
          <span className="text-[11px] font-medium tracking-wider uppercase opacity-70" style={{ color: 'var(--text-tertiary)' }}>
            Không gian
          </span>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setSearchOpen(open => !open)}
              aria-label={searchOpen ? 'Đóng tìm kiếm phiên' : 'Tìm kiếm phiên'}
              aria-expanded={searchOpen}
              className="control-button rounded-md p-1.5 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Search size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={cycleSort}
              title={`Sắp xếp: ${SORT_LABEL[sortMode]} (bấm để đổi)`}
              aria-label={`Sắp xếp: ${SORT_LABEL[sortMode]}`}
              className="control-button rounded-md p-1.5 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowUpDown size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              title="Tạo folder mới"
              aria-label="Tạo folder mới"
              className="control-button rounded-md p-1.5 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <FolderPlus size={13} aria-hidden="true" />
            </button>
          </div>
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
          filtered.map(renderRow)
        ) : (
          <>
            {folders.map(f => {
              const items = filtered.filter(s => folderOf[s.id] === f.id);
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

      <div className="px-2.5 py-2" style={{ borderTop: '1px solid var(--border)' }}>
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
    </aside>
  );
};
