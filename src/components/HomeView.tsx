import React, { useState, useRef } from 'react';
import { Session, AIProvider } from '../types.ts';
import { ModelPicker } from './ModelPicker.tsx';
import { Avatar } from './Avatar.tsx';
import { ArrowUp, MessageSquare, Folder, FileText, Terminal, Database } from 'lucide-react';

interface HomeViewProps {
  sessions: Session[];
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  onSubmit: (prompt: string) => void;
  onSelectSession: (id: string) => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng.';
  if (h < 13) return 'Chào buổi trưa.';
  if (h < 18) return 'Chào buổi chiều.';
  return 'Chào buổi tối.';
}

const suggestions = [
  { label: 'Liệt kê tệp', prompt: 'Liệt kê danh sách file trong thư mục dự án', icon: <Folder size={14} /> },
  { label: 'Đọc package.json', prompt: 'Đọc nội dung file package.json', icon: <FileText size={14} /> },
  { label: 'Kiểm tra Git', prompt: 'Chạy lệnh shell: git status', icon: <Terminal size={14} /> },
  { label: 'Ghi nhớ sở thích', prompt: 'Ghi nhớ rằng tôi luôn ưu tiên kiến trúc local-first và code tối giản', icon: <Database size={14} /> }
];

export const HomeView: React.FC<HomeViewProps> = ({
  sessions,
  providers,
  selectedModel,
  onSelectModel,
  onSubmit,
  onSelectSession
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const recent = sessions.slice(0, 5);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto" style={{ backgroundColor: 'var(--background)' }}>
      <div className="w-full max-w-3xl mx-auto px-6 pt-14 pb-10">
        <div className="flex items-center gap-2 mb-3">
          <Avatar kind="assistant" status="idle" size={28} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>ohmyt</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-8" style={{ color: 'var(--text-primary)' }}>
          {greeting()}
        </h1>

        <div
          className="composer-shell relative p-5"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-subtle)' }}
        >
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Hỏi, tạo hoặc bắt đầu một nhiệm vụ..."
            className="w-full bg-transparent text-[14px] leading-relaxed resize-none focus:outline-none min-h-[56px] max-h-[140px]"
            style={{ color: 'var(--text-primary)' }}
          />
          <div className="flex items-center justify-between gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <ModelPicker providers={providers} value={selectedModel} onChange={onSelectModel} />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="composer-send font-medium transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
              title="Gửi yêu cầu"
              aria-label="Gửi yêu cầu"
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
          {suggestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSubmit(item.prompt)}
              className="home-suggest-card p-3.5 text-left text-xs cursor-pointer"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                <span className="p-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
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

        {recent.length > 0 && (
          <div className="mt-8">
            <div className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Chủ đề gần đây ({sessions.length})
            </div>
            <div className="space-y-1">
              {recent.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  className="home-topic-row flex w-full items-center gap-3 p-3 text-left cursor-pointer"
                  style={{ backgroundColor: 'transparent', border: '1px solid transparent' }}
                >
                  <MessageSquare size={15} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {s.title}
                    </span>
                    {s.last_message && (
                      <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {s.last_message.slice(0, 90)}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-mono-code flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(s.updated_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
