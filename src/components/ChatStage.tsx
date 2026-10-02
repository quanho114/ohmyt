import React, { useState, useRef, useEffect } from 'react';
import { Session, Message, ToolCallItem, SystemStatus, AIProvider } from '../types.ts';
import { ChatMessage } from './ChatMessage.tsx';
import { ArrowUp, Square, Folder, FileText, Terminal, Database, RefreshCw, Sun, Moon } from 'lucide-react';
import { Avatar } from './Avatar.tsx';
import { ModelPicker } from './ModelPicker.tsx';
import type { Appearance } from '../appearance.ts';

interface ChatStageProps {
  session: Session | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  activeTools: ToolCallItem[];
  status: SystemStatus | null;
  agentStatus: 'idle' | 'running' | 'waiting_approval' | 'error';
  activeTheme: 'light' | 'dark';
  appearance: Appearance;
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  pendingPermission?: { toolName: string; target: string; input: Record<string, unknown>; description: string } | null;
  onRespondPermission?: (d: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => void;
  onToggleTheme: () => void;
  onSendMessage: (prompt: string) => void;
  onAbortRun: () => void;
  onRefreshMessages: () => void;
}

export const ChatStage: React.FC<ChatStageProps> = ({
  session,
  messages,
  isStreaming,
  streamingContent,
  activeTools,
  status,
  agentStatus,
  activeTheme,
  appearance,
  providers,
  selectedModel,
  onSelectModel,
  pendingPermission,
  onRespondPermission,
  onToggleTheme,
  onSendMessage,
  onAbortRun,
  onRefreshMessages
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [messages, streamingContent, activeTools]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = inputPrompt.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setInputPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
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
      style={{ backgroundColor: 'var(--background)' }}
    >
      {/* Top Header */}
      {/* Top Header */}
      <header
        className="h-13 px-4 flex items-center justify-between backdrop-blur-md z-10 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--background)'
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {session ? session.title : 'Chọn hoặc tạo phiên làm việc'}
          </span>

          <div
            className="chat-connection flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${status?.llm.available ? 'bg-emerald-500' : 'bg-zinc-400'}`}
            />
            <span>{status?.llm.available ? 'Model connected' : 'Local Engine'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            title={activeTheme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
            aria-label={activeTheme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            aria-pressed={activeTheme === 'dark'}
            className="control-button p-2 hover:bg-[var(--surface-hover)] cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            {activeTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            type="button"
            onClick={onRefreshMessages}
            title="Làm mới lịch sử"
            aria-label="Làm mới lịch sử"
            className="control-button p-2 hover:bg-[var(--surface-hover)] cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
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
          <div className="conversation-width conversation-feed">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} appearance={appearance} activeTheme={activeTheme} />
            ))}

            {/* Live Streaming Message */}
            {isStreaming && (
              <ChatMessage
                message={{
                  id: 'streaming-active',
                  session_id: session?.id || '',
                  sender: 'agent',
                  content: streamingContent || 'Đang xử lý...',
                  created_at: Date.now()
                }}
                isStreaming={true}
                tools={activeTools}
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

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Sticky Input Bar */}
      <div
        className="px-3.5 pt-3 pb-4 flex-shrink-0"
        style={{ backgroundColor: 'var(--background)' }}
      >
        <div className="conversation-width">
          <div
            className="composer-shell relative p-3"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)'
            }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputPrompt}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={session ? "Nhập yêu cầu tác vụ (Enter để gửi, Shift+Enter xuống dòng)..." : "Hãy chọn một phiên làm việc..."}
              disabled={!session || isStreaming}
              className="w-full bg-transparent text-[13.5px] leading-relaxed resize-none focus:outline-none min-h-[44px] max-h-[140px] px-1.5 py-1"
              style={{ color: 'var(--text-primary)' }}
            />

            <div className="composer-toolbar flex items-center justify-between gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <ModelPicker providers={providers} value={selectedModel} onChange={onSelectModel} />
              </div>

              <div className="composer-toolbar-actions flex items-center gap-2">
                <span className="text-[11px] opacity-40 hidden sm:inline font-mono-code" style={{ color: 'var(--text-tertiary)' }}>
                  Enter ↵
                </span>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onAbortRun}
                    className="p-2 rounded-xl transition-all cursor-pointer bg-red-600 text-white hover:bg-red-700 active:scale-95 flex items-center justify-center"
                    title="Dừng xử lý"
                    aria-label="Dừng tác vụ"
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputPrompt.trim() || !session}
                    className="composer-send p-2 rounded-xl font-medium transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center shadow-xs"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-contrast)'
                    }}
                    title="Gửi yêu cầu"
                    aria-label="Gửi yêu cầu"
                  >
                    <ArrowUp size={15} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
