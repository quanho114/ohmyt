import React, { useState, useEffect, useRef } from 'react';
import { Session, Message, MemoryItem, SkillItem, SystemStatus, ToolCallItem, PermissionRequest, AIProvider } from './types.ts';
import { api } from './api.ts';
import { useTheme } from './useTheme.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { ChatStage } from './components/ChatStage.tsx';
import { HomeView } from './components/HomeView.tsx';
import { SettingsPage, SettingsTab } from './components/SettingsPage.tsx';
import { PermissionModal } from './components/PermissionModal.tsx';

export const App: React.FC = () => {
  const { appearance, updateAppearance, activeTheme, toggleQuickTheme, locale, saveState } = useTheme();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);

  // Active run state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeTools, setActiveTools] = useState<ToolCallItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<Array<{ type: string; payload: Record<string, unknown>; timestamp: number }>>([]);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedModel, setSelectedModel] = useState<{ providerId: string; modelId: string } | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('settings');
  const settingsOpenerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isSettingsOpen && settingsOpenerRef.current?.isConnected) settingsOpenerRef.current.focus();
  }, [isSettingsOpen]);

  // Ref to hold SSE cleanup
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());

  // Initial data loading
  // Sync settings state with URL hash (#settings/providers)
  useEffect(() => {
    const syncFromUrl = () => {
      try {
        const hash = window.location.hash;
        if (hash.startsWith('#settings')) {
          setIsSettingsOpen(true);
          const tabPart = hash.slice('#settings'.length).replace(/^\//, '');
          const validTabs: SettingsTab[] = ['settings', 'providers', 'memory', 'skills', 'timeline', 'stats'];
          setSettingsTab(validTabs.includes(tabPart as SettingsTab) ? tabPart as SettingsTab : 'settings');
        } else {
          setIsSettingsOpen(false);
        }
      } catch {}
    };

    syncFromUrl();
    window.addEventListener('hashchange', syncFromUrl);
    return () => window.removeEventListener('hashchange', syncFromUrl);
  }, []);

  const handleOpenSettings = (tab: SettingsTab = 'settings') => {
    settingsOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSettingsTab(tab);
    setIsSettingsOpen(true);
    try {
      window.location.hash = `#settings/${tab}`;
    } catch {}
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    try {
      if (window.location.hash.startsWith('#settings')) {
        window.location.hash = '';
      }
    } catch {}
  };

  const handleSelectSettingsTab = (tab: SettingsTab) => {
    setSettingsTab(tab);
    try {
      window.location.hash = `#settings/${tab}`;
    } catch {}
  };

  // Initial data loading
  useEffect(() => {
    loadInitialData();
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);
  const loadInitialData = async () => {
    try {
      const [statusRes, sessionsRes, memoriesRes, skillsRes, providersRes] = await Promise.all([
        api.getStatus().catch(() => null),
        api.getSessions().catch(() => []),
        api.getMemories().catch(() => []),
        api.getSkills().catch(() => []),
        api.getProviders().catch(() => [] as AIProvider[])
      ]);

      if (statusRes) setStatus(statusRes);
      setMemories(memoriesRes);
      setSkills(skillsRes);
      setProviders(providersRes);
      const pickDefaultModel = () => {
        const enabled = providersRes.filter((p) => p.enabled);
        const pool = enabled.length > 0 ? enabled : providersRes;
        for (const p of pool) {
          if (p.models.length > 0) return { providerId: p.id, modelId: p.models[0].model_id };
        }
        return null;
      };

      if (sessionsRes.length > 0) {
        setSessions(sessionsRes);
        // Mở màn home kiểu LobeHub, không tự chọn phiên đầu (tránh F5 quên model).
        setActiveSessionId(null);
        setMessages([]);
        const d = pickDefaultModel();
        if (d) setSelectedModel(d);
      } else {
        setSessions([]);
        setActiveSessionId(null);
        setMessages([]);
        const d = pickDefaultModel();
        if (d) setSelectedModel(d);
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu ban đầu:', err);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const msgs = await api.getMessages(sessionId);
      setMessages(msgs);
    } catch (err) {
      console.error('Lỗi tải tin nhắn:', err);
    }
  };

  // Switch session
  const handleSelectSession = (id: string) => {
    if (isStreaming) {
      if (!confirm('Tác vụ đang xử lý. Bạn có muốn chuyển phiên làm việc?')) return;
      handleAbortRun();
    }
    if (unsubscribeRef.current) unsubscribeRef.current();
    seenEventsRef.current = new Set();
    setActiveSessionId(id);
    loadMessages(id);
    setStreamingContent('');
    setActiveTools([]);
    setTimelineEvents([]);
    api.getSessionModel(id).then((r) => {
      if (r.override) setSelectedModel(r.override);
    }).catch(() => {});
  };

  const handleSelectModel = async (v: { providerId: string; modelId: string }) => {
    setSelectedModel(v);
    if (activeSessionId) {
      try {
        await api.setSessionModel(activeSessionId, v);
      } catch (err) {
        console.error('Lỗi lưu model override:', err);
      }
    }
  };

  const refreshProviders = async () => {
    try {
      const list = await api.getProviders();
      setProviders(list);
    } catch {}
  };

  // Delete session
  const handleDeleteSession = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa phiên làm việc này?')) return;
    try {
      await api.deleteSession(id);
      const remaining = sessions.filter(s => s.id !== id);
      setSessions(remaining);
      if (activeSessionId === id) {
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
          loadMessages(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      alert(`Không thể xóa: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Send message and connect stream
  const handleSendMessage = async (prompt: string, sid?: string) => {
    const targetId = sid ?? activeSessionId;
    if (!targetId || isStreaming) return;

    const tempUserMsg: Message = {
      id: `temp_${Date.now()}`,
      session_id: targetId,
      sender: 'user',
      content: prompt,
      created_at: Date.now()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsStreaming(true);
    setStreamingContent('');
    setActiveTools([]);

    try {
      const { runId } = await api.startRun(targetId, prompt, appearance.responseLanguage);
      setActiveRunId(runId);
      seenEventsRef.current = new Set();

      if (unsubscribeRef.current) unsubscribeRef.current();

      unsubscribeRef.current = api.subscribeRunStream(
        runId,
        (event) => {
          const evtId = event.eventId || `${event.type}_${JSON.stringify(event.payload).length}_${event.sequence ?? ''}`;
          if (event.eventId && seenEventsRef.current.has(event.eventId)) return;
          if (event.eventId) seenEventsRef.current.add(event.eventId);
          else if (seenEventsRef.current.has(evtId)) return;
          else seenEventsRef.current.add(evtId);
          const type = event.type;
          const payload = event.payload;

          setTimelineEvents(prev => [{
            type,
            payload,
            timestamp: Date.now()
            }, ...prev.slice(0, 499)]);

          if (type === 'TextDelta' || type === 'model.delta') {
            const delta = typeof payload.delta === 'string' ? payload.delta : '';
            setStreamingContent(prev => prev + delta);
          } else if (type === 'ToolCallStarted') {
            const toolId = String(payload.toolId || `tool_${Date.now()}`);
            const toolName = String(payload.toolName || 'tool');
            const input = (payload.input && typeof payload.input === 'object') ? payload.input as Record<string, unknown> : {};
            setActiveTools(prev => [...prev, {
              id: toolId,
              name: toolName,
              input,
              status: 'running'
            }]);
          } else if (type === 'PermissionRequired') {
            setIsSettingsOpen(false);
            setPendingPermission({
              runId,
              requestId: String(payload.requestId || ''),
              toolName: String(payload.toolName || ''),
              target: String(payload.target || ''),
              input: (payload.input && typeof payload.input === 'object') ? payload.input as Record<string, unknown> : {},
              description: String(payload.description || '')
            });
          } else if (type === 'ToolCallCompleted') {
            const toolId = String(payload.toolId || '');
            const output = payload.output;
            const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : undefined;
            const success = Boolean(payload.success);

            setActiveTools(prev => prev.map(t => t.id === toolId ? {
              ...t,
              output,
              durationMs,
              status: success ? 'completed' : 'error'
            } : t));
          } else if (type === 'ToolCallBlocked') {
            const toolName = String(payload.toolName || '');
            setActiveTools(prev => prev.map(t => t.name === toolName && t.status === 'running' ? {
              ...t,
              status: 'blocked'
            } : t));
          } else if (type === 'MemoryUpdated') {
            api.getMemories().then(setMemories).catch(() => {});
          } else if (type === 'RunCompleted' || type === 'RunFailed' || type === 'RunAborted') {
            setIsStreaming(false);
            setPendingPermission(null);
            loadMessages(targetId);
            api.getSessions().then(setSessions).catch(() => {});
          }
        },
        (streamErr) => {
          console.warn('SSE stream error:', streamErr);
          setIsStreaming(false);
        }
      );
    } catch (err) {
      alert(`Lỗi khởi động tác vụ: ${err instanceof Error ? err.message : String(err)}`);
      setIsStreaming(false);
    }
  };

  // Go home (LobeHub-style landing)
  const handleGoHome = () => {
    if (isStreaming) {
      if (!confirm('Tác vụ đang xử lý. Bạn có muốn về Trang chủ?')) return;
      handleAbortRun();
    }
    if (unsubscribeRef.current) unsubscribeRef.current();
    seenEventsRef.current = new Set();
    setActiveSessionId(null);
    setMessages([]);
    setStreamingContent('');
    setActiveTools([]);
    setTimelineEvents([]);
    setPendingPermission(null);
  };

  // Submit from home composer: create session then send
  const handleHomeSubmit = async (prompt: string) => {
    if (isStreaming) return;
    try {
      const sess = await api.createSession(`Phiên làm việc ${sessions.length + 1}`);
      setSessions([sess, ...sessions]);
      setActiveSessionId(sess.id);
      setMessages([]);
      setStreamingContent('');
      setActiveTools([]);
      if (selectedModel) {
        try {
          await api.setSessionModel(sess.id, selectedModel);
        } catch (err) {
          console.error('Lỗi lưu model override:', err);
        }
      }
      await handleSendMessage(prompt, sess.id);
    } catch (err) {
      alert(`Không thể tạo phiên: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRespondPermission = async (decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => {
    if (!pendingPermission || !activeRunId) return;

    try {
      await api.respondPermission(activeRunId, pendingPermission.requestId, decision);
      setPendingPermission(null);
    } catch (err) {
      alert(`Lỗi phản hồi quyền: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAbortRun = async () => {
    if (!activeRunId) return;
    try {
      await api.abortRun(activeRunId, 'Người dùng bấm nút Take Control');
      setIsStreaming(false);
      setPendingPermission(null);
      if (activeSessionId) loadMessages(activeSessionId);
    } catch (err) {
      console.error('Lỗi khi Take Control:', err);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  // Compute agent status
  let agentStatus: 'idle' | 'running' | 'waiting_approval' | 'error' = 'idle';
  if (pendingPermission) {
    agentStatus = 'waiting_approval';
  } else if (isStreaming) {
    agentStatus = 'running';
  }

  return (
    <div
      className="app-shell h-screen w-screen flex flex-row overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--text-primary)'
      }}
    >
      <div className="workspace-layout" hidden={isSettingsOpen} inert={isSettingsOpen || undefined}>
      {/* Column 1: Sidebar */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isHome={activeSessionId === null}
        status={status}
        agentStatus={agentStatus}
        onGoHome={handleGoHome}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => handleOpenSettings('settings')}
      />

      {/* Column 2: Home or Chat Stage */}
      <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden relative">
        {activeSession ? (
        <ChatStage
          session={activeSession}
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          activeTools={activeTools}
          status={status}
          agentStatus={agentStatus}
          activeTheme={activeTheme}
          appearance={appearance}
          providers={providers}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          pendingPermission={pendingPermission}
          onRespondPermission={handleRespondPermission}
          onToggleTheme={toggleQuickTheme}
          onSendMessage={handleSendMessage}
          onAbortRun={handleAbortRun}
          onRefreshMessages={() => activeSessionId && loadMessages(activeSessionId)}
        />
        ) : (
        <HomeView
          sessions={sessions}
          providers={providers}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          onSubmit={handleHomeSubmit}
          onSelectSession={handleSelectSession}
        />
        )}
      </main>
      </div>

      {/* Settings open from the sidebar without taking space from the chat. */}
      {isSettingsOpen && (
        <SettingsPage
          status={status}
          memories={memories}
          skills={skills}
          timelineEvents={timelineEvents}
          activeTab={settingsTab}
          onSelectTab={handleSelectSettingsTab}
          isStreaming={isStreaming}
          appearance={appearance}
          onChangeAppearance={updateAppearance}
          activeTheme={activeTheme}
          locale={locale}
          saveState={saveState}
          onTakeControl={handleAbortRun}
          onDeleteMemory={async (id) => {
            await api.deleteMemory(id);
            setMemories(prev => prev.filter(m => m.id !== id));
          }}
          onRefreshMemories={async (query) => {
            const list = await api.getMemories(query);
            setMemories(list);
          }}
          onClose={handleCloseSettings}
          providers={providers}
          onRefreshProviders={refreshProviders}
        />
      )}

      {/* Permission Approval Modal (Human-in-the-loop) */}
      <PermissionModal
        request={pendingPermission}
        onRespond={handleRespondPermission}
      />
    </div>
  );
};
