import { copyToClipboard } from '../clipboard.ts';
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, PanelLeft, Sun, Moon, RefreshCw, Settings, Plus, Copy, Trash2, HelpCircle, Minus, Square, Copy as RestoreWindow, X } from 'lucide-react';
import type { Session } from '../types.ts';

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  canGoBack: boolean;
  onGoBack: () => void;
  canGoForward: boolean;
  onGoForward: () => void;
  onNewSession: () => void;
  activeSession: Session | null;
  onOpenSettings: (tab?: string) => void;
  activeTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRefresh?: () => void;
  onRefreshMessages?: () => void;
  onDeleteSession?: (id: string) => void;
  isStreaming?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  sidebarOpen,
  onToggleSidebar,
  canGoBack,
  onGoBack,
  canGoForward,
  onGoForward,
  onNewSession,
  activeSession,
  onOpenSettings,
  activeTheme,
  onToggleTheme,
  onRefresh,
  onRefreshMessages,
  onDeleteSession,
  isStreaming = false
}) => {
  const [activeMenu, setActiveMenu] = useState<'file' | 'edit' | 'view' | 'help' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const unsubscribe = window.electronAPI?.onMaximizedChanged?.(maximized => {
      receivedChange = true;
      setIsMaximized(maximized);
    });
    window.electronAPI?.isMaximized?.().then(maximized => {
      if (active && !receivedChange) setIsMaximized(maximized);
    }).catch(console.error);
    const syncFullscreen = () => setIsMaximized(Boolean(document.fullscreenElement));
    if (!window.electronAPI?.maximize) {
      syncFullscreen();
      document.addEventListener('fullscreenchange', syncFullscreen);
    }
    return () => {
      active = false;
      unsubscribe?.();
      document.removeEventListener('fullscreenchange', syncFullscreen);
    };
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    if (isStreaming) {
      const ok = window.confirm('Tác vụ đang chạy. Bạn có chắc muốn tải lại trang (F5)?');
      if (!ok) return;
    }
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else if (onRefreshMessages) {
        await onRefreshMessages();
      } else {
        window.location.reload();
      }
    } catch (e) {
      console.error('Lỗi khi tải lại:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMenu(null);
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenu]);

  return (
    <header
      className="desktop-top-bar h-9 w-full flex items-center justify-between pl-3 pr-0 select-none flex-shrink-0 z-30"
      style={{
        backgroundColor: 'var(--sidebar)',
        color: 'var(--text-primary)'
      }}
      ref={menuRef}
    >
      {/* Left controls: Nav arrows, sidebar toggle, desktop menus */}
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={onGoBack}
          disabled={!canGoBack}
          title="Quay lại"
          aria-label="Quay lại"
          className="topbar-nav-btn p-1 rounded hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-[var(--text-secondary)] transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onClick={onGoForward}
          disabled={!canGoForward}
          title="Tiếp theo"
          aria-label="Tiếp theo"
          className="topbar-nav-btn p-1 rounded hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-[var(--text-secondary)] transition-colors"
        >
          <ChevronRight size={15} />
        </button>

        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Thu gọn thanh bên" : "Mở thanh bên"}
          aria-label={sidebarOpen ? "Thu gọn thanh bên" : "Mở thanh bên"}
          className="topbar-nav-btn p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors ml-0.5"
        >
          <PanelLeft size={15} />
        </button>

        {/* Menu Bar: Tệp, Chỉnh sửa, Xem, Trợ giúp */}
        <div className="flex items-center ml-2 relative text-xs">
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
              className={`topbar-menu-item px-2 py-0.5 rounded cursor-pointer transition-colors ${
                activeMenu === 'file' ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              Tệp
            </button>
            {activeMenu === 'file' && (
              <div
                className="topbar-dropdown absolute left-0 top-full mt-1 w-44 rounded-lg shadow-lg border p-1 z-50 text-xs"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
              >
                <button
                  type="button"
                  onClick={() => { onNewSession(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer text-left"
                >
                  <Plus size={13} />
                  <span>Trò chuyện mới</span>
                </button>
                <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
                <button
                  type="button"
                  onClick={() => { onOpenSettings(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer text-left"
                >
                  <Settings size={13} />
                  <span>Cài đặt</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
              className={`topbar-menu-item px-2 py-0.5 rounded cursor-pointer transition-colors ${
                activeMenu === 'edit' ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              Chỉnh sửa
            </button>
            {activeMenu === 'edit' && (
              <div
                className="topbar-dropdown absolute left-0 top-full mt-1 w-48 rounded-lg shadow-lg border p-1 z-50 text-xs"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
              >
                <button
                  type="button"
                  disabled={!activeSession}
                  onClick={() => {
                    if (activeSession) {
                      copyToClipboard(window.location.href);
                    }
                    setActiveMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-left"
                >
                  <Copy size={13} />
                  <span>Sao chép liên kết phiên</span>
                </button>
                {activeSession && onDeleteSession && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Xóa phiên "${activeSession.title}"?`)) {
                        onDeleteSession(activeSession.id);
                      }
                      setActiveMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] text-red-500 cursor-pointer text-left"
                  >
                    <Trash2 size={13} />
                    <span>Xóa phiên</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
              className={`topbar-menu-item px-2 py-0.5 rounded cursor-pointer transition-colors ${
                activeMenu === 'view' ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              Xem
            </button>
            {activeMenu === 'view' && (
              <div
                className="topbar-dropdown absolute left-0 top-full mt-1 w-48 rounded-lg shadow-lg border p-1 z-50 text-xs"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
              >
                <button
                  type="button"
                  onClick={() => { onToggleSidebar(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer text-left"
                >
                  <PanelLeft size={13} />
                  <span>{sidebarOpen ? 'Thu gọn sidebar' : 'Mở sidebar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { onToggleTheme(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer text-left"
                >
                  {activeTheme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
                  <span>{activeTheme === 'dark' ? 'Giao diện Sáng' : 'Giao diện Tối'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleRefresh(); setActiveMenu(null); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    <span>Tải lại</span>
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono">F5</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
              className={`topbar-menu-item px-2 py-0.5 rounded cursor-pointer transition-colors ${
                activeMenu === 'help' ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              Trợ giúp
            </button>
            {activeMenu === 'help' && (
              <div
                className="topbar-dropdown absolute left-0 top-full mt-1 w-48 rounded-lg shadow-lg border p-1 z-50 text-xs"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
              >
                <div className="px-2.5 py-1.5 text-[var(--text-secondary)]">
                  <div className="font-semibold text-[var(--text-primary)]">ohmyt</div>
                  <div className="text-[11px] opacity-70">Desktop AI Agent v1.0.0</div>
                </div>
                <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
                <button
                  type="button"
                  onClick={() => { onOpenSettings('settings'); setActiveMenu(null); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer text-left"
                >
                  <HelpCircle size={13} />
                  <span>Về ohmyt</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Spacer */}
      <div className="flex-1 min-w-0 pointer-events-none" />

      {/* Right controls: Theme toggle, Refresh, Settings, Window controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onToggleTheme}
          title={activeTheme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          aria-label={activeTheme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          className="topbar-action-btn p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
        >
          {activeTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <button
          type="button"
          onClick={handleRefresh}
          title="Tải lại ứng dụng (F5)"
          aria-label="Tải lại ứng dụng (F5)"
          className="topbar-action-btn p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        <button
          type="button"
          onClick={() => onOpenSettings()}
          title="Cài đặt"
          aria-label="Cài đặt"
          className="topbar-action-btn p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
        >
          <Settings size={14} />
        </button>

        {/* Window controls (Minus, Square, X) like Codex */}
        <div className="flex items-center ml-1 border-l pl-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => window.electronAPI?.minimize()}
            title="Thu nhỏ"
            aria-label="Thu nhỏ"
            className="topbar-action-btn p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.electronAPI?.maximize) {
                window.electronAPI.maximize();
              } else if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                document.documentElement.requestFullscreen();
              }
            }}
            title={isMaximized ? 'Khôi phục kích thước' : 'Phóng to'}
            aria-label={isMaximized ? 'Khôi phục kích thước' : 'Phóng to'}
            className="topbar-action-btn p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
          >
            {isMaximized ? <RestoreWindow size={11} /> : <Square size={11} />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.electronAPI?.close) window.electronAPI.close();
              else window.close();
            }}
            title="Đóng"
            aria-label="Đóng"
            className="topbar-action-btn p-1 rounded hover:bg-red-500 hover:text-white cursor-pointer text-[var(--text-secondary)] transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  );
};
