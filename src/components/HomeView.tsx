import type { ImageAttachment } from '../types.ts';
import { topicPreview, topicDate } from '../topicPreview.ts';
import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import type { Session, AIProvider, SystemStatus } from '../types.ts';
import { mascots } from '../mascots.ts';
import type { Appearance } from '../appearance.ts';
import { SessionAvatar } from './SessionAvatar.tsx';
import { Composer } from './Composer.tsx';
import { loadProfile } from './ProfileSettings.tsx';
import { ArrowUpRight } from 'lucide-react';
import { taskSuggestions,type TaskStartOptions } from '../taskSuggestions.ts';
import type { ApprovalMode } from '../types.ts';
import {RuntimeCompatibilityNotice} from './RuntimeCompatibilityNotice.tsx';

const IslandSea=lazy(()=>import('../islandSea/IslandSea.tsx').then(module=>({default:module.IslandSea})));

interface HomeViewProps {
  appearance?: Appearance;
  onChangeIslandSea?: (mode:Appearance['islandSea'])=>void;
  approvalMode: ApprovalMode;
  onChangeApprovalMode: (mode: ApprovalMode) => Promise<void>;
  mascot: Appearance['mascot'];
  sessions: Session[];
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  status?: SystemStatus | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  onSubmit: (prompt: string, images?: ImageAttachment[], options?: TaskStartOptions) => void | boolean | Promise<void | boolean>;
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

export const HomeView: React.FC<HomeViewProps> = ({
  appearance,
  onChangeIslandSea,
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
  const starting=useRef(false);
  const [taskBusy,setTaskBusy]=useState(false),[taskError,setTaskError]=useState('');
  const startTask=async(label:string,options:TaskStartOptions)=>{
    if(starting.current)return;starting.current=true;setTaskBusy(true);setTaskError('');
    try{await onSubmit(label,undefined,options);}catch(e){setTaskError(e instanceof Error?e.message:String(e));}
    finally{starting.current=false;setTaskBusy(false);}
  };
  const suggestions=taskSuggestions.map(({icon:Icon,...item})=>({...item,icon:<Icon size={23} strokeWidth={1.7}/>,onSelect:()=>void startTask(item.label,{workflowId:item.id})}));
  useEffect(() => {
    const refresh = () => setProfileName(loadProfile().displayName);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const showSea=Boolean(appearance&&onChangeIslandSea&&appearance.chatBackground==='none');
  return (
    <div data-island-sea={showSea&&appearance?.islandSea!=='off'} className="home-view flex-1 flex flex-col h-full overflow-y-auto relative" style={{ backgroundColor: 'transparent' }}>
      {showSea&&appearance&&onChangeIslandSea&&<Suspense fallback={null}><IslandSea mode={appearance.islandSea} onMode={onChangeIslandSea}/></Suspense>}
      <div className="island-home-scroll"><div className="home-content">
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
          {taskError&&<RuntimeCompatibilityNotice message={taskError}/>}
          <div className="home-section-heading"><h2 id="home-suggestions-heading">Gợi ý</h2></div>
          <div className="home-suggestion-grid">
            {suggestions.map(item => (
              <button key={item.label} type="button" disabled={taskBusy} onClick={item.onSelect} className="home-suggest-card">
                <span className="home-suggestion-icon" data-tone={item.tone} aria-hidden="true">{item.icon}</span>
                <span className="home-suggestion-copy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <ArrowUpRight size={15} className="home-suggestion-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      </div></div>
    </div>
  );
};
