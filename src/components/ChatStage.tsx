import React, { useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Session, Message, ToolCallItem, ResponseActivityData, SystemStatus, AIProvider } from '../types.ts';
import { ChatMessage } from './ChatMessage.tsx';
import { Folder, FileText, Terminal, Database, RefreshCw, Sun, Moon, Trash2, X, ArrowDown, Forward, Search, MessageSquare, GitFork, Share2, CircleCheck, CircleAlert } from 'lucide-react';
import { Avatar } from './Avatar.tsx';
import { Composer } from './Composer.tsx';
import { api } from '../api.ts';
import type { Appearance } from '../appearance.ts';

interface ChatStageProps {
  session: Session | null;
  sessions: Session[];
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning?: string;
  activityStartedAt?: number;
  responsePhase?: ResponseActivityData['phase'];
  activeTools: ToolCallItem[];
  status: SystemStatus | null;
  agentStatus: 'idle' | 'running' | 'waiting_approval' | 'error';
  activeTheme: 'light' | 'dark';
  appearance: Appearance;
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  onOpenProviders?: () => void;
  pendingPermission?: { toolName: string; target: string; input: Record<string, unknown>; description: string } | null;
  onRespondPermission?: (d: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => void;
  onToggleTheme: () => void;
  onSendMessage: (prompt: string) => void;
  onAbortRun: () => void;
  onRefreshMessages: () => void;
  onEditMessage?: (message: Message, content: string) => void;
  onDeleteMessage?: (message: Message) => void;
  onRegenerateMessage?: (message: Message) => void;
  onBranchMessage?: (message: Message, includeContext: boolean) => void;
  onForwardMessages?: (targetSessionId: string, items: Array<{ sender: string; content: string }>, note: string) => void;
  branchMode?: {
    includeContext: boolean;
    onToggleContext: (include: boolean) => void;
    onClose: () => void;
  };
  branchDividerIndex?: number;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const ChatStage: React.FC<ChatStageProps> = ({
  session,
  sessions,
  messages,
  isStreaming,
  streamingContent,
  streamingReasoning = '',
  activityStartedAt,
  responsePhase,
  activeTools,
  status,
  agentStatus,
  activeTheme,
  appearance,
  providers,
  selectedModel,
  onSelectModel,
  onOpenProviders,
  pendingPermission,
  onRespondPermission,
  onToggleTheme,
  onSendMessage,
  onAbortRun,
  onRefreshMessages,
  onEditMessage,
  onDeleteMessage,
  onRegenerateMessage,
  onBranchMessage,
  onForwardMessages,
  branchMode,
  branchDividerIndex,
  sidebarOpen = true,
  onToggleSidebar
}) => {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [shareToast, setShareToast] = useState<'copied' | 'failed' | null>(null);
  const [forwardTarget, setForwardTarget] = useState<string | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardNote, setForwardNote] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareChoice, setShareChoice] = useState<'lan' | 'file' | 'tunnel'>('lan');
  const [netAddrs, setNetAddrs] = useState<string[]>([]);
  const [netPort, setNetPort] = useState(3188);
  const [shareBusy, setShareBusy] = useState(false);
  const enterSelect = (msg: Message) => {
    setSelectMode(true);
    setSelectedIds(prev => prev.includes(msg.id) ? prev : [...prev, msg.id]);
  };
  const toggleSelect = (msg: Message) => {
    setSelectedIds(prev => prev.includes(msg.id) ? prev.filter(id => id !== msg.id) : [...prev, msg.id]);
  };
  const selectUpTo = (index: number) => {
    setSelectedIds(messages.slice(0, index + 1).map(m => m.id));
  };
  const exitSelect = () => { setSelectMode(false); setSelectedIds([]); setForwardOpen(false); };
  const openShare = async () => {
    setShareChoice('lan');
    setShareOpen(true);
    try {
      const net = await api.getNetwork();
      setNetAddrs(net.addresses || []);
      if (net.port) setNetPort(net.port);
    } catch {
      setNetAddrs([]);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setShareToast('copied');
    } catch {
      setShareToast('failed');
    }
    window.setTimeout(() => setShareToast(null), 2000);
  };

  const exportMarkdown = () => {
    if (!session || shareBusy) return;
    setShareBusy(true);
    try {
      const lines = [`# ${session.title}`, ''];
      for (const msg of messages.filter(m => !m.id.startsWith('temp_'))) {
        lines.push(msg.sender === 'user' ? '## Bạn' : '## ohmyt', '', msg.content, '');
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${session.title.replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_').slice(0, 80) || 'session'}.md`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setShareToast('copied');
      window.setTimeout(() => setShareToast(null), 2000);
    } finally {
      setShareBusy(false);
    }
  };

  const lanLinks = netAddrs.map(ip => `http://${ip}:${netPort}/#session/${encodeURIComponent(session?.id || '')}`);

  const renderShareModal = () => {
    if (!shareOpen || !session) return null;
    return createPortal(
      <div className="forward-modal-overlay" onClick={() => setShareOpen(false)} role="dialog" aria-modal="true" aria-label="Chia sẻ phiên">
        <div className="forward-modal-card share-modal-card" onClick={e => e.stopPropagation()}>
          <div className="forward-modal-head">
            <span className="forward-modal-title"><Share2 size={15} /> Chia sẻ “{session.title}”</span>
            <button type="button" className="branch-modal-x" aria-label="Đóng" onClick={() => setShareOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="forward-modal-cols">
            <div className="forward-modal-left" role="radiogroup" aria-label="Cách chia sẻ">
              {([
                { key: 'lan', title: 'Mạng nội bộ (LAN)', desc: 'Cùng WiFi mở link trực tiếp' },
                { key: 'file', title: 'Xuất file Markdown', desc: 'Gửi file qua chat, email' },
                { key: 'tunnel', title: 'Khác mạng internet', desc: 'Qua Tailscale / Cloudflare Tunnel' }
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={shareChoice === opt.key}
                  className="share-option"
                  data-active={shareChoice === opt.key}
                  onClick={() => setShareChoice(opt.key)}
                >
                  <span className="share-option-title">{opt.title}</span>
                  <span className="share-option-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className="forward-modal-right">
              {shareChoice === 'lan' && (
                <>
                  <div className="forward-preview-hint">
                    Người cùng mạng mở link sau là vào thẳng phiên này trên máy bạn (không cần đăng nhập — chỉ share với người tin tưởng):
                  </div>
                  <div className="share-link-list">
                    {lanLinks.length === 0 && <div className="forward-empty">Không tìm thấy địa chỉ mạng. Kiểm tra kết nối WiFi rồi mở lại bảng này.</div>}
                    {lanLinks.map(link => (
                      <div key={link} className="share-link-row">
                        <span className="share-link-url">{link}</span>
                        <button type="button" className="message-edit-cancel" onClick={() => copyText(link)}>Sao chép</button>
                      </div>
                    ))}
                  </div>
                  <div className="branch-modal-hint">Nếu mở không được: cho phép port {netPort} qua firewall (Windows: Firewall → Inbound Rules → New Rule → Port {netPort}).</div>
                </>
              )}
              {shareChoice === 'file' && (
                <>
                  <div className="forward-preview-hint">
                    Xuất toàn bộ hội thoại ra file Markdown (.md) để gửi qua Zalo, mail, hoặc lưu trữ:
                  </div>
                  <div className="forward-modal-footer" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="message-edit-send" disabled={shareBusy} onClick={exportMarkdown}>
                      {shareBusy ? 'Đang xuất...' : 'Xuất file .md'}
                    </button>
                  </div>
                </>
              )}
              {shareChoice === 'tunnel' && (
                <>
                  <div className="forward-preview-hint">App không có cloud trung gian nên khác mạng phải bắc cầu:</div>
                  <ol className="share-steps">
                    <li><strong>Cách dễ:</strong> cả hai cài Tailscale, đăng nhập cùng tài khoản → người kia mở link Tailscale IP + <code>:{netPort}/#session/{session.id}</code>.</li>
                    <li><strong>Không cài app:</strong> chạy <code>cloudflared tunnel --url http://localhost:{netPort}</code> → Cloudflare cấp link công cộng, gửi link đó kèm đường dẫn phiên.</li>
                  </ol>
                  <div className="forward-modal-footer" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="message-edit-cancel" onClick={() => copyText(`#session/${session.id}`)}>Sao chép đường dẫn phiên</button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="forward-modal-footer share-modal-footer">
            <button type="button" className="message-edit-cancel" onClick={() => setShareOpen(false)}>Đóng</button>
          </div>
        </div>
      </div>,
      document.body
    );
  };
  const openForward = () => {
    if (!selectedIds.length) return;
    setForwardTarget(null);
    setForwardSearch('');
    setForwardNote('');
    setForwardOpen(true);
  };
  const confirmForward = async () => {
    const picked = messages.filter(m => selectedIds.includes(m.id));
    if (!forwardTarget || !picked.length || forwarding) return;
    setForwarding(true);
    try {
      await onForwardMessages?.(
        forwardTarget,
        picked.map(m => ({ sender: m.sender === 'agent' ? 'agent' : 'user', content: m.content })),
        forwardNote
      );
      exitSelect();
    } finally {
      setForwarding(false);
    }
  };
  const forwardPicked = messages.filter(m => selectedIds.includes(m.id));
  const forwardSessions = sessions.filter(s => s.id !== session?.id)
    .filter(s => !forwardSearch.trim() || s.title.toLowerCase().includes(forwardSearch.trim().toLowerCase()));
  const renderForwardModal = () => {
    if (!forwardOpen) return null;
    return createPortal(
      <div className="forward-modal-overlay" onClick={() => setForwardOpen(false)} role="dialog" aria-modal="true" aria-label="Chuyển tiếp">
        <div className="forward-modal-card" onClick={e => e.stopPropagation()}>
          <div className="forward-modal-head">
            <span className="forward-modal-title">Chuyển tiếp đến Phiên làm việc</span>
            <button type="button" className="branch-modal-x" aria-label="Đóng" onClick={() => setForwardOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="forward-modal-cols">
            <div className="forward-modal-left">
              <div className="forward-search">
                <Search size={14} />
                <input value={forwardSearch} onChange={e => setForwardSearch(e.target.value)}
                  placeholder="Tìm kiếm phiên..." aria-label="Tìm kiếm phiên" />
              </div>
              <div className="forward-session-list" role="listbox" aria-label="Phiên đích">
                {forwardSessions.length === 0 && (
                  <div className="forward-empty">Không có phiên nào khác khả dụng</div>
                )}
                {forwardSessions.map(s => (
                  <button key={s.id} type="button" role="option" aria-selected={forwardTarget === s.id}
                    className="forward-session-item" data-active={forwardTarget === s.id}
                    onClick={() => setForwardTarget(s.id)}>
                    <MessageSquare size={14} />
                    <span className="forward-session-title">{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="forward-modal-right">
              <div className="forward-preview-hint">
                {forwardPicked.length} tin nhắn sau đã được chuyển tiếp từ một cuộc trò chuyện khác.
                Vui lòng sử dụng chúng làm ngữ cảnh và tiếp tục:
              </div>
              <div className="forward-preview-box">
                {forwardPicked.map(m => (
                  <div key={m.id} className="forward-preview-msg">
                    <div className="forward-preview-sender">{m.sender === 'user' ? 'Người dùng:' : 'ohmyt:'}</div>
                    <div className="forward-preview-content">{m.content.slice(0, 500)}</div>
                  </div>
                ))}
              </div>
              <textarea value={forwardNote} onChange={e => setForwardNote(e.target.value)}
                placeholder="Thêm ghi chú (tùy chọn) — gửi kèm với tin nhắn"
                aria-label="Ghi chú chuyển tiếp" className="forward-note" rows={2} />
              <div className="forward-modal-footer">
                <button type="button" className="message-edit-cancel" onClick={() => setForwardOpen(false)}>Hủy</button>
                <button type="button" className="message-edit-send"
                  disabled={!forwardTarget || forwarding || !forwardPicked.length}
                  onClick={confirmForward}>
                  {forwarding ? 'Đang gửi...' : 'Chuyển tiếp'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };
  const deleteSelected = async () => {
    const picked = messages.filter(m => selectedIds.includes(m.id) && !m.id.startsWith('temp_'));
    if (!picked.length) { exitSelect(); return; }
    if (!confirm(`Xóa ${picked.length} tin nhắn đã chọn?`)) return;
    for (const m of picked) { try { await onDeleteMessage?.(m); } catch {} }
    exitSelect();
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const initializedSessionRef = useRef<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const scrollPolicyRef = useRef({ autoScroll: appearance.autoScroll, sessionId: session?.id });
  scrollPolicyRef.current = { autoScroll: appearance.autoScroll, sessionId: session?.id };

  useLayoutEffect(() => {
    initializedSessionRef.current = null;
    nearBottomRef.current = true;
  }, [session?.id]);

  // Session initialization is independent of following a live response.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!session || !scroller || initializedSessionRef.current === session.id) return;
    if (messages.some(message => message.session_id !== session.id)) return;
    // An empty layout needs no positioning; wait for persisted history to load.
    if (messages.length === 0) return;

    const initialize = () => {
      if (!scroller.clientHeight) return false;
      scroller.scrollTop = scroller.scrollHeight;
      nearBottomRef.current = true;
      initializedSessionRef.current = session.id;
      return true;
    };
    if (initialize()) return;
    const observer = new ResizeObserver(() => {
      if (initialize()) observer.disconnect();
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [session?.id, messages]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (appearance.autoScroll && initializedSessionRef.current === session?.id
      && nearBottomRef.current && scroller?.clientHeight) {
      // Instant positioning avoids a queue of smooth scrolls during streaming.
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messages, streamingContent, activeTools, isStreaming, pendingPermission]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => {
      const policy = scrollPolicyRef.current;
      if (policy.autoScroll && initializedSessionRef.current === policy.sessionId
        && nearBottomRef.current && scroller.clientHeight) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    observer.observe(scroller);
    if (feedRef.current) observer.observe(feedRef.current);
    return () => observer.disconnect();
  }, [session?.id, messages.length === 0 && !isStreaming]);

  const handleScroll = () => {
    const scroller = scrollRef.current;
    if (scroller?.clientHeight) {
      nearBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 80;
    }
  };

  const handleSendText = (text: string) => {
    if (!text.trim() || isStreaming) return;
    onSendMessage(text);
  };

  const suggestions = [
    { label: 'Liệt kê tệp', prompt: 'Liệt kê danh sách file trong thư mục dự án', icon: <Folder size={13} /> },
    { label: 'Đọc package.json', prompt: 'Đọc nội dung file package.json', icon: <FileText size={13} /> },
    { label: 'Kiểm tra Git', prompt: 'Chạy lệnh shell: git status', icon: <Terminal size={13} /> },
    { label: 'Ghi nhớ sở thích', prompt: 'Ghi nhớ rằng tôi luôn ưu tiên kiến trúc local-first và code tối giản', icon: <Database size={13} /> }
  ];

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden relative"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Top Header */}
      {/* Top Header */}
      {branchMode ? (
      <header
        className="h-13 px-4 flex items-center gap-2.5 backdrop-blur-md z-10 flex-shrink-0"
        style={{
          backgroundColor: 'transparent'
        }}
      >
        <GitFork size={15} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />
        <span className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
          Bắt đầu chủ đề phụ mới
        </span>
        <button type="button" role="switch" aria-checked={branchMode.includeContext}
          aria-label="Bao gồm ngữ cảnh chủ đề"
          className="branch-switch" data-on={branchMode.includeContext}
          onClick={() => branchMode.onToggleContext(!branchMode.includeContext)}>
          <span className="branch-switch-dot" />
        </button>
        <span className="text-xs truncate hidden sm:inline" style={{ color: 'var(--text-primary)' }}>
          Bao gồm ngữ cảnh chủ đề
        </span>
        <button
          type="button"
          onClick={branchMode.onClose}
          title="Đóng chủ đề phụ"
          aria-label="Đóng chủ đề phụ"
          className="control-button p-2 hover:bg-[var(--surface-hover)] cursor-pointer"
          style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}
        >
          <X size={15} />
        </button>
      </header>
      ) : (
      <header
        className="h-11 px-4 flex items-center justify-between backdrop-blur-md z-10 flex-shrink-0"
        style={{
          backgroundColor: 'transparent'
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {session ? session.title : 'Chọn hoặc tạo phiên làm việc'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { if (session) void openShare(); }}
            title="Chia sẻ phiên"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
          >
            <Share2 size={13} />
            <span>Chia sẻ</span>
          </button>
        </div>
      </header>
      )}

      {/* Messages Scroll Area */}
      <div ref={scrollRef} onScroll={handleScroll} className="chat-scroller flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto">
            {/* Lobe Core Mark */}
            <div className="mb-4">
              <Avatar kind="assistant" status={agentStatus} size={48} />
            </div>

            <h2 className="text-base font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text-primary)' }}>
              ohmyt Local-First
            </h2>
            <p className="text-xs leading-relaxed mb-6 max-w-md" style={{ color: 'var(--text-secondary)' }}>
              Trợ lý AI độc lập chạy trực tiếp trên máy của bạn. Tự động hóa tác vụ với tệp, terminal, web và quản lý bộ nhớ dài hạn.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
              {suggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSendMessage(item.prompt)}
                  className="empty-suggestion p-3.5 rounded-xl transition-all text-xs group cursor-pointer shadow-xs hover:border-[var(--border-strong)]"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <div className="flex items-center gap-2 font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    <span
                      className="p-1 rounded-md flex-shrink-0"
                      style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </div>
                  <div className="text-[11px] truncate opacity-75" style={{ color: 'var(--text-tertiary)' }}>
                    {item.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={feedRef} className="conversation-width conversation-feed">
            {branchDividerIndex != null && branchDividerIndex <= 0 && (
              <div className="branch-divider">
                <GitFork size={13} />
                <span>Được tách ra tại đây, kế thừa ngữ cảnh chính của cuộc trò chuyện cho đến nay</span>
              </div>
            )}
            {messages.map((msg, idx) => (
              <React.Fragment key={msg.id}>
                <ChatMessage
                  message={msg}
                  appearance={appearance}
                  activeTheme={activeTheme}
                  actionsDisabled={isStreaming}
                  onEditMessage={onEditMessage}
                  onDeleteMessage={onDeleteMessage}
                  onRegenerateMessage={onRegenerateMessage}
                  onBranchMessage={onBranchMessage}
                  selectMode={selectMode}
                  selected={selectedIds.includes(msg.id)}
                  onToggleSelect={toggleSelect}
                  onEnterSelect={enterSelect}
                />
                {selectMode && (
                  <div className="select-upto-divider">
                    <button type="button" className="select-upto-btn" onClick={() => selectUpTo(idx)}>
                      <ArrowDown size={13} /> Chọn đến đây
                    </button>
                  </div>
                )}
                {branchDividerIndex != null && branchDividerIndex === idx + 1 && (
                  <div className="branch-divider">
                    <GitFork size={13} />
                    <span>Được tách ra tại đây, kế thừa ngữ cảnh chính của cuộc trò chuyện cho đến nay</span>
                  </div>
                )}
              </React.Fragment>
            ))}

            {/* Live Streaming Message */}
            {isStreaming && (
              <ChatMessage
                message={{
                  id: 'streaming-active',
                  session_id: session?.id || '',
                  sender: 'agent',
                  content: streamingContent,
                  created_at: Date.now()
                }}
                isStreaming={true}
                tools={activeTools}
                activity={{ phase: responsePhase, reasoning: streamingReasoning, tools: activeTools, startedAt: activityStartedAt ?? Date.now() }}
                appearance={appearance}
                activeTheme={activeTheme}
              />
            )}

            {pendingPermission && (
              <div className="mx-auto max-w-2xl my-2 p-3 rounded-xl text-xs" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Terminal access requested</div>
                <div className="font-mono-code break-all mb-1" style={{ color: 'var(--text-primary)' }}>{pendingPermission.target || pendingPermission.toolName}</div>
                <div className="mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Risk: {pendingPermission.toolName === 'shell_exec' && /rm|push|format|del/i.test(pendingPermission.target) ? 'Destructive — review carefully' : 'Read-only / review recommended'}
                </div>
                <div className="flex gap-1.5 justify-end">
                  <button onClick={() => onRespondPermission?.('DENY')} className="px-2.5 py-1 rounded-md cursor-pointer" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Deny</button>
                  <button onClick={() => onRespondPermission?.('ALLOW_ONCE')} className="px-2.5 py-1 rounded-md cursor-pointer" style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>Allow once</button>
                  <button onClick={() => onRespondPermission?.('ALLOW_ALWAYS')} className="px-2.5 py-1 rounded-md cursor-pointer bg-emerald-600 text-white">Always allow</button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Bottom Sticky Input Bar */}
      <div
        className="px-3.5 pt-1.5 pb-1 flex-shrink-0"
        style={{ backgroundColor: 'transparent', borderTop: selectMode ? '1px solid var(--border-subtle)' : undefined }}
      >
        {selectMode ? (
          <div className="conversation-width select-footer-bar">
            <span className="select-footer-count">Đã chọn {selectedIds.length}</span>
            <span className="select-footer-actions">
              <button type="button" className="select-footer-btn" onClick={exitSelect}>
                <X size={14} /> Hủy
              </button>
              <button type="button" className="select-footer-btn danger" onClick={deleteSelected} disabled={!selectedIds.length}>
                <Trash2 size={14} /> Xóa
              </button>
              <button type="button" className="select-footer-btn" onClick={openForward} disabled={!selectedIds.length}>
                <Forward size={14} /> Chuyển tiếp
              </button>
            </span>
          </div>
        ) : (
        <div className="conversation-width">
          <Composer
            providers={providers}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            onOpenProviders={onOpenProviders}
            status={status}
            agentStatus={agentStatus}
            isStreaming={isStreaming}
            disabled={!session}
            placeholder={session ? "Nhập yêu cầu tác vụ (Enter để gửi, Shift+Enter xuống dòng)..." : "Hãy chọn một phiên làm việc..."}
            suggestions={suggestions}
            onSend={handleSendText}
            onAbort={onAbortRun}
          />
        </div>
        )}
        {renderForwardModal()}
        {renderShareModal()}
        {shareToast && createPortal(
          <div className="copy-toast-wrap">
            <div className="copy-toast" role="status" aria-live="polite" data-failed={shareToast === 'failed'}>
              {shareToast === 'copied'
                ? <CircleCheck size={18} className="copy-toast-icon" style={{ color: 'var(--success)' }} />
                : <CircleAlert size={18} className="copy-toast-icon" style={{ color: 'var(--danger)' }} />}
              <span className="copy-toast-text">
                {shareToast === 'copied' ? 'Đã sao chép liên kết phiên' : 'Không thể sao chép. Kiểm tra quyền clipboard và thử lại.'}
              </span>
              <button type="button" className="copy-toast-close" aria-label="Đóng" onClick={() => setShareToast(null)}>
                <X size={14} />
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};
