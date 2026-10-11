import type { ImageAttachment } from '../types.ts';
import { topicPreview, topicDate } from '../topicPreview.ts';
import React, { useEffect, useState } from 'react';
import type { Session, AIProvider, SystemStatus } from '../types.ts';
import { mascots } from '../mascots.ts';
import type { Appearance } from '../appearance.ts';
import { SessionAvatar } from './SessionAvatar.tsx';
import { Composer } from './Composer.tsx';
import { loadProfile } from './ProfileSettings.tsx';
import { ArrowUpRight, Brain, FileJson2, FolderOpen, GitBranch } from 'lucide-react';
import type { ApprovalMode } from '../types.ts';

interface HomeViewProps {
  approvalMode: ApprovalMode;
  onChangeApprovalMode: (mode: ApprovalMode) => Promise<void>;
  mascot: Appearance['mascot'];
  sessions: Session[];
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  status?: SystemStatus | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  onSubmit: (prompt: string, images?: ImageAttachment[]) => void | boolean | Promise<void | boolean>;
  onSelectSession: (id: string) => void;
  onOpenProviders: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const base = hour < 11 ? 'Chào buổi sáng.' : hour < 13 ? 'Chào buổi trưa.' : hour < 18 ? 'Chào buổi chiều.' : 'Chào buổi tối.';
  return name ? base.replace(/\.$/, `, ${name}.`) : base;
}

const suggestions = [
  { label: 'Liệt kê tệp', prompt: 'Liệt kê danh sách file trong thư mục dự án', tone: 'blue', icon: <FolderOpen size={23} strokeWidth={1.7} /> },
  { label: 'Đọc package.json', prompt: 'Đọc nội dung file package.json', tone: 'purple', icon: <FileJson2 size={23} strokeWidth={1.7} /> },
  { label: 'Kiểm tra Git', prompt: 'Chạy lệnh shell: git status', tone: 'orange', icon: <GitBranch size={23} strokeWidth={1.9} /> },
  { label: 'Ghi nhớ sở thích', prompt: 'Ghi nhớ rằng tôi luôn ưu tiên kiến trúc local-first và code tối giản', tone: 'teal', icon: <Brain size={23} strokeWidth={1.7} /> }
];

export const HomeView: React.FC<HomeViewProps> = ({
  approvalMode,
  onChangeApprovalMode,
  mascot,
  sessions,
  providers,
  selectedModel,
  status = null,
  onSelectModel,
  onSubmit,
  onSelectSession,
  onOpenProviders
}) => {
  const recent = sessions.slice(0, 5);
  const selectedMascot = mascots.find(item => item.id === mascot) ?? mascots[0];
  const [profileName, setProfileName] = useState(() => loadProfile().displayName);
  useEffect(() => {
    const refresh = () => setProfileName(loadProfile().displayName);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return (
    <div className="home-view flex-1 flex flex-col h-full overflow-y-auto relative" style={{ backgroundColor: 'transparent' }}>
      <div className="home-content">
        <div className="home-welcome">
          <h1 className="home-greeting">{greeting(profileName)}</h1>
          <div className="home-mascot">
            <span className="home-mascot-speech">Hôm nay mình giúp gì cho bạn?</span>
            <img src={selectedMascot.image} alt={selectedMascot.vi} width={160} height={160} draggable={false} />
          </div>
        </div>
        <Composer
          approvalMode={approvalMode}
          onChangeApprovalMode={onChangeApprovalMode}
          providers={providers}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          onOpenProviders={onOpenProviders}
          status={status}
          isHome
          placeholder="Hỏi, tạo hoặc bắt đầu một nhiệm vụ..."
          suggestions={suggestions}
          onSend={onSubmit}
        />

        {recent.length > 0 && (
          <section className="home-recent" aria-labelledby="home-recent-heading">
            <div className="home-section-heading">
              <h2 id="home-recent-heading">Chủ đề gần đây</h2>
              <span>{sessions.length}</span>
            </div>
            <div className="home-recent-list">
              {recent.map(session => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className="home-topic-row"
                  title={`Mở cuộc trò chuyện: ${session.title}`}
                >
                  <div className="home-topic-icon">
                    <SessionAvatar sessionId={session.id} />
                  </div>
                  <span className="home-topic-copy">
                    <span className="home-topic-title">{session.title}</span>
                    {session.last_message && <span className="home-topic-preview">{topicPreview(session.last_message)}</span>}
                  </span>
                  <div className="home-topic-meta">
                    <time className="home-topic-time" title={new Date(session.updated_at).toLocaleString('vi-VN')}>{topicDate(session.updated_at)}</time>
                    <ArrowUpRight size={15} className="home-topic-open-icon" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="home-suggestions" aria-labelledby="home-suggestions-heading">
          <div className="home-section-heading"><h2 id="home-suggestions-heading">Gợi ý</h2></div>
          <div className="home-suggestion-grid">
            {suggestions.map(item => (
              <button key={item.label} type="button" onClick={() => onSubmit(item.prompt)} className="home-suggest-card">
                <span className="home-suggestion-icon" data-tone={item.tone} aria-hidden="true">{item.icon}</span>
                <span className="home-suggestion-copy">
                  <strong>{item.label}</strong>
                  <small>{item.prompt}</small>
                </span>
                <ArrowUpRight size={15} className="home-suggestion-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
