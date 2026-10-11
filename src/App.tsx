import {enqueuePermission,removePermission} from './harness/permissionQueue.ts';
import type { ImageAttachment } from './types.ts';
import { BrowserPane } from './components/BrowserPane.tsx';
import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { Session, Message, MemoryItem, SkillItem, SystemStatus, ToolCallItem, PermissionRequest, AIProvider } from './types.ts';
import { visibleSavedMessages } from './streamHandoff.ts';
import { api } from './api.ts';
import { chatBackgroundPaint } from './chatBackgrounds.ts';
import { useTheme } from './useTheme.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { ChatStage } from './components/ChatStage.tsx';
import { BranchSourcePane } from './components/BranchSourcePane.tsx';
import { HomeView } from './components/HomeView.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
import type { SettingsTab } from './components/SettingsPage.tsx';
import { PermissionModal } from './components/PermissionModal.tsx';
import { TopBar } from './components/TopBar.tsx';
import type { ApprovalMode } from './types.ts';

function parseInitialRoute() {
  if (typeof window === 'undefined') {
    return { isSettings: false, settingsTab: 'settings' as SettingsTab, sessionRoute: null };
  }
  try {
    const hash = window.location.hash || '';
    if (hash.startsWith('#settings')) {
      const tabPart = hash.slice('#settings'.length).replace(/^\//, '');
      const validTabs: SettingsTab[] = ['settings', 'providers', 'memory', 'skills', 'stats', 'profile'];
      return {
        isSettings: true,
        settingsTab: (validTabs.includes(tabPart as SettingsTab) ? (tabPart as SettingsTab) : 'settings') as SettingsTab,
        sessionRoute: null,
      };
    }
    if (hash.startsWith('#session/')) {
      return {
        isSettings: false,
        settingsTab: 'settings' as SettingsTab,
        sessionRoute: decodeURIComponent(hash.slice('#session/'.length)),
      };
    }
  } catch {}
  return { isSettings: false, settingsTab: 'settings' as SettingsTab, sessionRoute: null };
}

export const App: React.FC = () => {
  const { appearance, updateAppearance, activeTheme, toggleQuickTheme, locale, saveState } = useTheme();

  const initialRoute = parseInitialRoute();

  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const raw = window.localStorage.getItem('ohmyt_cached_sessions');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeSessionId, commitActiveSessionId] = useState<string | null>(() => initialRoute.sessionRoute);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!initialRoute.sessionRoute) return [];
    try {
      const raw = window.localStorage.getItem(`ohmyt_last_messages_${initialRoute.sessionRoute}`)
        || window.localStorage.getItem('ohmyt_last_messages');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [newChatApprovalMode, setNewChatApprovalMode] = useState<ApprovalMode>('ask');
  const [approvalModeSaving, setApprovalModeSaving] = useState(false);
  const approvalSaveRef = useRef(false);
  const handleChangeApprovalMode = async (mode: ApprovalMode) => {
    const id = selectedSessionRef.current;
    if (!id) { setNewChatApprovalMode(mode); return; }
    approvalSaveRef.current = true;
    setApprovalModeSaving(true);
    try {
      const updated = await api.setSessionApprovalMode(id, mode);
      setSessions(previous => previous.map(session => session.id === id ? updated : session));
    } finally {
      approvalSaveRef.current = false;
      setApprovalModeSaving(false);
    }
  };
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);

  // Each conversation owns its stream, progress and approval request.
  const sessionSwitchVersion = useRef(0);
  const messageCacheRef = useRef(new Map<string, Message[]>());
  const selectedSessionRef = useRef(activeSessionId);
  const setActiveSessionId = (id: string | null) => { selectedSessionRef.current = id; commitActiveSessionId(id); };
  type SessionRun = {
    activeRunId: string | null;
    isStreaming: boolean;
    streamingContent: string;
    streamingReasoning: string;
    responsePhase: 'waiting' | 'reasoning' | 'tools' | 'answer';
    activityStartedAt: number;
    activeTools: ToolCallItem[];
    pendingPermission: PermissionRequest | null;
    permissionQueue:PermissionRequest[];
  };
  const emptyRun = (): SessionRun => ({
    activeRunId: null,
    isStreaming: false,
    streamingContent: '',
    streamingReasoning: '',
    responsePhase: 'waiting',
    activityStartedAt: Date.now(),
    activeTools: [],
    pendingPermission: null,
    permissionQueue:[],
  });
  const [sessionRuns, setSessionRuns] = useState<Record<string, SessionRun>>({});
  const sessionRunsRef = useRef<Record<string, SessionRun>>({});
  const [unseenCompletedSessions, setUnseenCompletedSessions] = useState<Record<string, true>>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('ohmyt_unseen_completed_sessions') || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved)
        ? Object.fromEntries(Object.entries(saved).filter(([, value]) => value === true)) as Record<string, true>
        : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('ohmyt_unseen_completed_sessions', JSON.stringify(unseenCompletedSessions)); } catch {}
  }, [unseenCompletedSessions]);
  const markSessionSeen = (id: string) => {
    setUnseenCompletedSessions(previous => {
      if (!previous[id]) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };
  const runSetters = (id: string | null) => {
    const fieldSetter = <K extends keyof SessionRun>(key: K) => (value: React.SetStateAction<SessionRun[K]>) => {
      if (!id) return;
      const previous = sessionRunsRef.current[id] || emptyRun();
      const nextValue = typeof value === 'function' ? (value as (prev: SessionRun[K]) => SessionRun[K])(previous[key]) : value;
      const next = { ...previous, [key]: nextValue };
      sessionRunsRef.current = { ...sessionRunsRef.current, [id]: next };
      setSessionRuns(sessionRunsRef.current);
    };
    return {
      setActiveRunId: fieldSetter('activeRunId'),
      setIsStreaming: fieldSetter('isStreaming'),
      setStreamingContent: fieldSetter('streamingContent'),
      setStreamingReasoning: fieldSetter('streamingReasoning'),
      setResponsePhase: fieldSetter('responsePhase'),
      setActivityStartedAt: fieldSetter('activityStartedAt'),
      setActiveTools: fieldSetter('activeTools'),
      setPendingPermission:(value:PermissionRequest|null)=>{if(!id)return;const previous=sessionRunsRef.current[id] || emptyRun();const queue=value?enqueuePermission(previous.permissionQueue,value):[];const next={...previous,permissionQueue:queue,pendingPermission:queue[0] || null};sessionRunsRef.current={...sessionRunsRef.current,[id]:next};setSessionRuns(sessionRunsRef.current);},
      removePermission:(requestId:string)=>{if(!id)return;const previous=sessionRunsRef.current[id] || emptyRun();const queue=removePermission(previous.permissionQueue,requestId);sessionRunsRef.current={...sessionRunsRef.current,[id]:{...previous,permissionQueue:queue,pendingPermission:queue[0] || null}};setSessionRuns(sessionRunsRef.current);},
    };
  };
  const { activeRunId, isStreaming, streamingContent, streamingReasoning, responsePhase, activityStartedAt, activeTools, pendingPermission } = (activeSessionId && sessionRuns[activeSessionId]) || emptyRun();
  const { setActiveRunId, setIsStreaming, setStreamingContent, setStreamingReasoning, setResponsePhase, setActivityStartedAt, setActiveTools, setPendingPermission } = runSetters(activeSessionId);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedModel, setSelectedModel] = useState<{ providerId: string; modelId: string } | null>(null);
  const [branch, setBranch] = useState<{
    sourceId: string; anchorId: string; branchId: string;
    includeContext: boolean; contextCount: number;
  } | null>(null);
  const [branchSourceMessages, setBranchSourceMessages] = useState<Message[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(initialRoute.isSettings);
  const settingsOpenRef = useRef(isSettingsOpen);
  settingsOpenRef.current = isSettingsOpen;
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(initialRoute.settingsTab);
  const [sessionRoute, setSessionRoute] = useState<string | null>(initialRoute.sessionRoute);
  const [homeRouteVersion, setHomeRouteVersion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return window.localStorage.getItem('ohmyt_sidebar_open') !== '0';
    } catch {
      return true;
    }
  });
  const [settingsNavCollapsed, setSettingsNavCollapsed] = useState(false);
  const settingsOpenerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isSettingsOpen && settingsOpenerRef.current?.isConnected) settingsOpenerRef.current.focus();
  }, [isSettingsOpen]);

  // Ref to hold SSE cleanup
  const streamSubscriptions = useRef(new Map<string, () => void>());

  // Initial data loading
  // Sync settings state with URL hash (#settings/providers)
  useEffect(() => {
    const syncFromUrl = () => {
      try {
        const hash = window.location.hash;
        if (hash.startsWith('#settings')) {
          setIsSettingsOpen(true);
          const tabPart = hash.slice('#settings'.length).replace(/^\//, '');
          const validTabs: SettingsTab[] = ['settings', 'providers', 'memory', 'skills', 'stats', 'profile'];
          setSettingsTab(validTabs.includes(tabPart as SettingsTab) ? tabPart as SettingsTab : 'settings');
        } else {
          setIsSettingsOpen(false);
          setSessionRoute(hash.startsWith('#session/') ? decodeURIComponent(hash.slice('#session/'.length)) : null);
          if (!hash || hash === '#') setHomeRouteVersion(current => current + 1);
        }
      } catch {}
    };

    syncFromUrl();
    window.addEventListener('hashchange', syncFromUrl);
    return () => window.removeEventListener('hashchange', syncFromUrl);
  }, []);

  const handleToggleSidebar = () => {
    setSidebarOpen(open => {
      try {
        window.localStorage.setItem('ohmyt_sidebar_open', open ? '0' : '1');
      } catch {}
      return !open;
    });
  };

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
        window.location.hash = activeSessionId ? `#session/${encodeURIComponent(activeSessionId)}` : '';
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
      for (const unsubscribe of streamSubscriptions.current.values()) unsubscribe();
      streamSubscriptions.current.clear();
    };
  }, []);
  const loadInitialData = async () => {
    try {
      const currentRouteId = parseInitialRoute().sessionRoute;
      const [statusRes, sessionsRes, memoriesRes, skillsRes, providersRes, targetMsgs] = await Promise.all([
        api.getStatus().catch(() => null),
        api.getSessions().catch(() => []),
        api.getMemories().catch(() => []),
        api.getSkills().catch(() => []),
        api.getProviders().catch(() => [] as AIProvider[]),
        currentRouteId ? api.getMessages(currentRouteId).catch(() => [] as Message[]) : Promise.resolve(null)
      ]);

      if (statusRes) setStatus(statusRes);
      setMemories(memoriesRes);
      setSkills(skillsRes);
      setProviders(providersRes);
      const pickDefaultModel = () => {
        const pool = providersRes.filter((p) => Boolean(p.enabled));
        for (const p of pool) {
          const model = (p.models || []).find(item => Boolean(item.enabled));
          if (model) return { providerId: p.id, modelId: model.model_id };
        }
        return null;
      };

      setSessions(sessionsRes);
      try {
        window.localStorage.setItem('ohmyt_cached_sessions', JSON.stringify(sessionsRes));
      } catch {}

      if (currentRouteId && sessionsRes.some(s => s.id === currentRouteId)) {
        setActiveSessionId(currentRouteId);
        setSessionRoute(currentRouteId);
        if (targetMsgs) {
          setMessages(targetMsgs);
          try {
            window.localStorage.setItem(`ohmyt_last_messages_${currentRouteId}`, JSON.stringify(targetMsgs));
            window.localStorage.setItem('ohmyt_last_messages', JSON.stringify(targetMsgs));
          } catch {}
        }
        api.getSessionModel(currentRouteId).then(r => {
          if (r.override) setSelectedModel(r.override);
          else {
            const d = pickDefaultModel();
            if (d) setSelectedModel(d);
          }
        }).catch(() => {
          const d = pickDefaultModel();
          if (d) setSelectedModel(d);
        });
      } else {
        setActiveSessionId(null);
        setMessages([]);
        const d = pickDefaultModel();
        if (d) setSelectedModel(d);
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu ban đầu:', err);
    }
  };

  const loadMessages = async (sessionId: string, finishRun = false) => {
    const finishingRunId=finishRun?sessionRunsRef.current[sessionId]?.activeRunId:null;
    try {
      const msgs = await api.getMessages(sessionId);
      messageCacheRef.current.set(sessionId, msgs);
      if (messageCacheRef.current.size > 30) messageCacheRef.current.delete(messageCacheRef.current.keys().next().value!);
      const running = sessionRunsRef.current[sessionId];
      finishRun=finishRun&&running?.activeRunId===finishingRunId;
      const visible = finishRun ? msgs : visibleSavedMessages(msgs, running?.isStreaming ? running.activeRunId : null);
      if (selectedSessionRef.current === sessionId) setMessages(visible);
      if (finishRun) {
        const setters = runSetters(sessionId);
        setters.setIsStreaming(false);
        setters.setPendingPermission(null);
        setters.setActiveRunId(null);
        setters.setStreamingContent('');
      }
      try {
        window.localStorage.setItem(`ohmyt_last_messages_${sessionId}`, JSON.stringify(msgs));
        window.localStorage.setItem('ohmyt_last_messages', JSON.stringify(msgs));
      } catch {}
    } catch (err) {
      finishRun=finishRun&&sessionRunsRef.current[sessionId]?.activeRunId===finishingRunId;
      if (finishRun) {
        const run = sessionRunsRef.current[sessionId];
        if (run && selectedSessionRef.current === sessionId) {
          const fallback: Message = {
            id: `temp_completed_${run.activeRunId || Date.now()}`,
            session_id: sessionId, sender: 'agent',
            content: run.streamingContent || 'Tác vụ đã kết thúc. Tải lại tin nhắn để xem kết quả đã lưu.',
            created_at: Date.now(),
            metadata: JSON.stringify({ activity: { reasoning: run.streamingReasoning, tools: run.activeTools, startedAt: run.activityStartedAt } })
          };
          setMessages(previous => [...previous, fallback]);
        }
        const setters = runSetters(sessionId);
        setters.setIsStreaming(false);
        setters.setPendingPermission(null);
        setters.setActiveRunId(null);
      }
      console.error('Lỗi tải tin nhắn:', err);
    }
  };

  const handleDeleteMessage = async (msg: Message) => {
    if (isStreaming || !activeSessionId || msg.id.startsWith('temp_')) return;
    try {
      await api.deleteMessage(activeSessionId, msg.id);
      setMessages(prev => prev.filter(item => item.id !== msg.id));
    } catch (err) {
      alert(`Không xóa được tin nhắn: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleForwardMessages = async (
    targetSessionId: string,
    items: Array<{ sender: string; content: string }>,
    note: string
  ) => {
    if (isStreaming || !items.length) return;
    const prompt = note.trim()
      || 'Hãy sử dụng các tin nhắn được chuyển tiếp trên làm ngữ cảnh và tiếp tục.';
    try {
      await api.forwardMessages(targetSessionId, items, note.trim(), activeSessionId || undefined);
      if (targetSessionId !== activeSessionId) {
        handleSelectSession(targetSessionId);
        const fresh = await api.getMessages(targetSessionId).catch(() => []);
        setMessages(fresh);
      } else {
        const fresh = await api.getMessages(targetSessionId).catch(() => []);
        setMessages(fresh);
      }
      await handleSendMessage(prompt, targetSessionId);
    } catch (err) {
      alert(`Không chuyển tiếp được: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const resendFromAnchor = async (anchor: Message, prompt: string) => {
    const targetId = activeSessionId;
    if (!targetId || isStreaming) return;
    const persisted = messages.filter(item => !item.id.startsWith('temp_'));
    const anchorIdx = persisted.findIndex(item => item.id === anchor.id);
    const beforeId = anchorIdx > 0 ? persisted[anchorIdx - 1].id : null;
    try {
      await api.truncateMessages(targetId, beforeId);
      setMessages(persisted.slice(0, Math.max(0, anchorIdx)));
      let images: ImageAttachment[]=[];
      try {images=JSON.parse(anchor.metadata || '{}').images || [];}catch{}
      await handleSendMessage(prompt, undefined, images);
    } catch (err) {
      alert(`Không gửi lại được: ${err instanceof Error ? err.message : String(err)}`);
      loadMessages(targetId);
    }
  };

  const handleEditMessage = async (msg: Message, content: string) => {
    if (msg.sender !== 'user' || !content.trim()) return;
    await resendFromAnchor(msg, content.trim());
  };

  const handleRegenerateMessage = async (msg: Message) => {
    if (isStreaming) return;
    const persisted = messages.filter(item => !item.id.startsWith('temp_'));
    const msgIdx = persisted.findIndex(item => item.id === msg.id);
    let anchorIdx = msgIdx;
    while (anchorIdx >= 0 && persisted[anchorIdx].sender !== 'user') anchorIdx--;
    if (msgIdx < 0 || anchorIdx < 0) return;
    await resendFromAnchor(persisted[anchorIdx], persisted[anchorIdx].content);
  };

  const handleBranchMessage = async (msg: Message, includeContext = true) => {
    if (!activeSessionId || isStreaming) return;
    const sourceId = activeSessionId;
    const snippet = msg.content.trim().slice(0, 40) || 'Chủ đề phụ';
    try {
      const { session, copied } = await api.branchSession(sourceId, msg.id, {
        title: `Chủ đề phụ: ${snippet}`,
        includeContext
      });
      let contextCount = copied;
      if (!includeContext) {
        await api.truncateMessages(session.id, null).catch(() => {});
        contextCount = 0;
      }
      setSessions(prev => {
        const next = [session, ...prev];
        try { window.localStorage.setItem('ohmyt_cached_sessions', JSON.stringify(next)); } catch {}
        return next;
      });
      const srcMsgs = await api.getMessages(sourceId).catch(() => [] as Message[]);
      setBranchSourceMessages(srcMsgs);
      setBranch({ sourceId, anchorId: msg.id, branchId: session.id, includeContext, contextCount });
      handleSelectSession(session.id, session.id);
    } catch (err) {
      alert(`Không tạo được chủ đề phụ: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCloseBranch = () => {
    if (!branch) return;
    const sourceId = branch.sourceId;
    setBranch(null);
    setBranchSourceMessages([]);
    handleSelectSession(sourceId);
  };

  const handleBranchToggleContext = async (include: boolean) => {
    if (!branch || isStreaming || include === branch.includeContext) return;
    try {
      if (!include) {
        if (!confirm('Tắt ngữ cảnh sẽ xóa toàn bộ lịch sử của chủ đề phụ này. Tiếp tục?')) return;
        await api.truncateMessages(branch.branchId, null);
        setBranch({ ...branch, includeContext: false, contextCount: 0 });
        loadMessages(branch.branchId);
      } else {
        const title = sessions.find(s => s.id === branch.branchId)?.title || 'Chủ đề phụ';
        const { session, copied } = await api.branchSession(branch.sourceId, branch.anchorId, { title, includeContext: true });
        setSessions(prev => [session, ...prev]);
        const srcMsgs = await api.getMessages(branch.sourceId).catch(() => [] as Message[]);
        setBranchSourceMessages(srcMsgs);
        setBranch({ ...branch, branchId: session.id, includeContext: true, contextCount: copied });
        handleSelectSession(session.id, session.id);
      }
    } catch (err) {
      alert(`Không đổi được ngữ cảnh: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Switch session
  const handleSelectSession = async (id: string, keepBranchId?: string) => {
    const version = ++sessionSwitchVersion.current;
    const sourceSession = selectedSessionRef.current;
    if (id === activeSessionId && !keepBranchId) return;
    if (activeSessionId) messageCacheRef.current.set(activeSessionId, messages);
    let cached = messageCacheRef.current.get(id);
    if (!cached) {
      try { const stored = JSON.parse(window.localStorage.getItem(`ohmyt_last_messages_${id}`) || 'null'); if (Array.isArray(stored) && stored.every(message => message?.session_id === id)) cached = stored; } catch {}
    }
    // Keep the current view until a cold session's history is ready. Commit
    // the target session and its messages together, without an empty frame.
    if (!cached) {
      try { cached = await api.getMessages(id); } catch { return; }
      if (version !== sessionSwitchVersion.current || sourceSession !== selectedSessionRef.current) return;
      messageCacheRef.current.set(id, cached);
    }
    markSessionSeen(id);
    if (branch && id !== (keepBranchId ?? branch.branchId)) {
      setBranch(null);
      setBranchSourceMessages([]);
    }
    setActiveSessionId(id);
    setSessionRoute(id);
    if (window.location.hash !== `#session/${encodeURIComponent(id)}`) window.location.hash = `#session/${encodeURIComponent(id)}`;
    const running = sessionRunsRef.current[id];
    setMessages(visibleSavedMessages(cached || [], running?.isStreaming ? running.activeRunId : null));
    loadMessages(id);
    api.getSessionModel(id).then((r) => {
      if (selectedSessionRef.current === id) setSelectedModel(r.override || (() => { const provider = providers.find(p => p.enabled && p.models?.some(m => m.enabled)); const model = provider?.models?.find(m => m.enabled); return provider && model ? { providerId: provider.id, modelId: model.model_id } : null; })());
    }).catch(() => {});
  };

  useEffect(() => {
    if (sessionRoute && sessionRoute !== activeSessionId && sessions.some(session => session.id === sessionRoute)) {
      handleSelectSession(sessionRoute);
    }
  }, [sessionRoute, sessions, activeSessionId]);

  useEffect(() => {
    if (activeSessionId && (!window.location.hash || window.location.hash === '#')) handleGoHome();
  }, [homeRouteVersion]);

  const handleRenameSession = async (id: string, title: string) => {
    const renamed = await api.renameSession(id, title);
    setSessions(current => {
      const updated = current.map(session => session.id === id ? { ...session, ...renamed } : session);
      try { window.localStorage.setItem('ohmyt_cached_sessions', JSON.stringify(updated)); } catch {}
      return updated;
    });
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

  const refreshSkills = async () => {
    try {
      const list = await api.getSkills();
      setSkills(list);
    } catch {}
  };

  // Delete session
  const handleDeleteSession = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa phiên làm việc này?')) return;
    try {
      const running = sessionRunsRef.current[id];
      if (running?.activeRunId && running.isStreaming) await api.abortRun(running.activeRunId, 'Người dùng xóa phiên');
      streamSubscriptions.current.get(id)?.();
      streamSubscriptions.current.delete(id);
      delete sessionRunsRef.current[id];
      setSessionRuns({ ...sessionRunsRef.current });
      await api.deleteSession(id);
      markSessionSeen(id);
      const remaining = sessions.filter(s => s.id !== id);
      setSessions(remaining);
      try { window.localStorage.setItem('ohmyt_cached_sessions', JSON.stringify(remaining)); } catch {}
      if (activeSessionId === id) {
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
          setSessionRoute(remaining[0].id);
          window.location.hash = `#session/${encodeURIComponent(remaining[0].id)}`;
          loadMessages(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setSessionRoute(null);
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
          setMessages([]);
        }
      }
    } catch (err) {
      alert(`Không thể xóa: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Send message and connect stream
  const handleSendMessage = async (prompt: string, sid?: string, images: ImageAttachment[] = [],existingRunId?:string) => {
    if (approvalSaveRef.current) return false;
    const targetId = sid ?? activeSessionId;
    if (!targetId || (!existingRunId && sessionRunsRef.current[targetId]?.isStreaming)) return false;
    if(existingRunId && sessionRunsRef.current[targetId]?.activeRunId===existingRunId && sessionRunsRef.current[targetId]?.isStreaming)return false;
    markSessionSeen(targetId);
    const { setActiveRunId, setIsStreaming, setStreamingContent, setStreamingReasoning, setResponsePhase, setActivityStartedAt, setActiveTools, setPendingPermission } = runSetters(targetId);
    const seenEvents = new Set<string>();

    const tempUserMsg: Message = {
      id: `temp_${Date.now()}`,
      session_id: targetId,
      sender: 'user',
      content: prompt,
      metadata: images.length ? JSON.stringify({images}) : null,
      created_at: Date.now()
    };
    if (!existingRunId&&selectedSessionRef.current === targetId) setMessages(prev => [...prev, tempUserMsg]);
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingReasoning('');
    setResponsePhase('waiting');
    setActivityStartedAt(Date.now());
    setActiveTools([]);
    setPendingPermission(null);

    try {
      // Persist the model displayed by the composer before starting this conversation's run.
      // This also repairs older project chats created without a model override.
      if (!existingRunId&&selectedModel) await api.setSessionModel(targetId, selectedModel);
      const { runId } = existingRunId?{runId:existingRunId}:await api.startRun(targetId, prompt, appearance.responseLanguage, images);
      if(existingRunId)void loadMessages(targetId);
      setActiveRunId(runId);
      streamSubscriptions.current.get(targetId)?.();
      const unsubscribe = api.subscribeRunStream(
        runId,
        (event) => {
          if(sessionRunsRef.current[targetId]?.activeRunId!==runId)return;
          const evtId = event.eventId || `${event.type}_${JSON.stringify(event.payload).length}_${event.sequence ?? ''}`;
          if (event.eventId && seenEvents.has(event.eventId)) return;
          if (event.eventId) seenEvents.add(event.eventId);
          else if (seenEvents.has(evtId)) return;
          else seenEvents.add(evtId);
          const type = event.type;
          const payload = event.payload;

          if (type === 'SessionTitleUpdated' && typeof payload.title === 'string') {
            setSessions(current => {
              const updated = current.map(session => session.id === payload.sessionId ? { ...session, title: payload.title as string } : session);
              try { window.localStorage.setItem('ohmyt_cached_sessions', JSON.stringify(updated)); } catch {}
              return updated;
            });
          } else if(type==='SteeringConsumed'){void loadMessages(targetId);
          } else if (type === 'TextReset') {
            setStreamingContent('');
          } else if (type === 'TextDelta' || type === 'model.delta') {
            setResponsePhase('answer');
            const delta = typeof payload.delta === 'string' ? payload.delta : '';
            setStreamingContent(prev => prev + delta);
          } else if (type === 'ReasoningDelta') {
            setResponsePhase('reasoning');
            if (typeof payload.delta === 'string') setStreamingReasoning(prev => prev + payload.delta);
          } else if (type === 'ToolCallStarted') {
            setResponsePhase('tools');
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
            if (selectedSessionRef.current === targetId) setIsSettingsOpen(false);
            setPendingPermission({
              runId:typeof payload.approvalRunId==='string'?payload.approvalRunId:runId,
              requestId: String(payload.requestId || ''),
              toolName: String(payload.toolName || ''),
              target: String(payload.target || ''),
              input: (payload.input && typeof payload.input === 'object') ? payload.input as Record<string, unknown> : {},
              scopeId: typeof payload.scopeId === 'string' ? payload.scopeId : undefined,
              projectId: typeof payload.projectId === 'string' ? payload.projectId : null,
              description: String(payload.description || '')
            });
          } else if (type === 'ToolCallCompleted') {
            setResponsePhase('waiting');
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
            setActiveTools(prev => [...prev, {
              id: String(payload.toolId || `blocked_${prev.length}`), name: toolName,
              input: { target: payload.target }, output: payload.reason, status: 'blocked'
            }]);
          } else if (type === 'MemoryUpdated') {
            api.getMemories().then(setMemories).catch(() => {});
          } else if (type === 'RunCompleted' || type === 'RunFailed' || type === 'RunAborted') {
            if (type === 'RunCompleted' && (selectedSessionRef.current !== targetId || settingsOpenRef.current || document.hidden)) {
              setUnseenCompletedSessions(previous => ({ ...previous, [targetId]: true }));
            }
            streamSubscriptions.current.get(targetId)?.();
            streamSubscriptions.current.delete(targetId);
            loadMessages(targetId, true);
            api.getSessions().then(setSessions).catch(() => {});
          }
        },
        (streamErr) => {
          console.warn('SSE stream error:', streamErr);
          if(sessionRunsRef.current[targetId]?.activeRunId!==runId)return;
          setIsStreaming(false);
        }
      );
      streamSubscriptions.current.set(targetId, unsubscribe);
    } catch (err) {
      alert(`Lỗi khởi động tác vụ: ${err instanceof Error ? err.message : String(err)}`);
      setIsStreaming(false);
      if (selectedSessionRef.current === targetId) setMessages(prev=>prev.filter(message=>message.id!==tempUserMsg.id));
      return false;
    }
  };

  const handleProjectChat = async (projectId: string) => {
    const session = await api.createSession('Đoạn chat mới', 'default-assistant', projectId);
    if (selectedModel) await api.setSessionModel(session.id, selectedModel);
    setSessions(current => [session, ...current]);
    handleSelectSession(session.id);
  };

  // Go home (LobeHub-style landing)
  const handleGoHome = () => {
    setActiveSessionId(null);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setSessionRoute(null);
    setMessages([]);

  };

  // Submit from home composer: create session then send
  const handleHomeSubmit = async (prompt: string, images?: ImageAttachment[]) => {
    try {
      let sess = await api.createSession('Đoạn chat mới');
      if (newChatApprovalMode !== 'ask') sess = await api.setSessionApprovalMode(sess.id, newChatApprovalMode);
      if (selectedModel) {
        try {
          await api.setSessionModel(sess.id, selectedModel);
        } catch (err) {
          console.error('Lỗi lưu model override:', err);
        }
      }
      const revealChat = () => {
      setSessions(current => {
        const nextSessions = [sess, ...current];
        try { window.localStorage.setItem('ohmyt_cached_sessions', JSON.stringify(nextSessions)); } catch {}
        return nextSessions;
      });
      setActiveSessionId(sess.id);
      setMessages([]);
      };
      // Capture only the conversation pane; sending never waits for the animation.
      const transitionDocument = document as Document & {
        startViewTransition?: (update: () => void) => {
          updateCallbackDone: Promise<void>;
          finished: Promise<void>;
        };
      };
      if (transitionDocument.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.classList.add('home-chat-transition');
        const transition = transitionDocument.startViewTransition(() => flushSync(revealChat));
        void transition.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('home-chat-transition'));
        await transition.updateCallbackDone.catch(() => {});
      } else {
        revealChat();
      }
      return await handleSendMessage(prompt, sess.id, images);
    } catch (err) {
      alert(`Không thể tạo phiên: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const handleRespondPermission = async (decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => {
    if (!pendingPermission || !activeRunId) return;

    const responseSession=activeSessionId,request=pendingPermission;
    try {
      await api.respondPermission(request.runId, request.requestId, decision);
      runSetters(responseSession).removePermission(request.requestId);
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
      className="app-shell h-screen w-screen flex flex-col overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--sidebar)',
        color: 'var(--text-primary)'
      }}
    >
      <TopBar
        sidebarOpen={isSettingsOpen ? !settingsNavCollapsed : sidebarOpen}
        onToggleSidebar={isSettingsOpen ? () => setSettingsNavCollapsed(prev => !prev) : handleToggleSidebar}
        canGoBack={activeSessionId !== null || isSettingsOpen}
        onGoBack={isSettingsOpen ? handleCloseSettings : handleGoHome}
        canGoForward={false}
        onGoForward={() => {}}
        onNewSession={() => { if (isSettingsOpen) handleCloseSettings(); handleGoHome(); }}
        activeSession={isSettingsOpen ? null : activeSession}
        onOpenSettings={(tab) => handleOpenSettings((tab as SettingsTab) || 'settings')}
        activeTheme={activeTheme}
        onToggleTheme={toggleQuickTheme}
        onRefresh={() => window.location.reload()}
        onRefreshMessages={activeSessionId ? () => loadMessages(activeSessionId) : undefined}
        onDeleteSession={handleDeleteSession}
        isStreaming={isStreaming}
      />

      <div className="workspace-layout flex-1 flex flex-row overflow-hidden min-h-0" hidden={isSettingsOpen} inert={isSettingsOpen || undefined}>
      {/* Column 1: Sidebar */}
      <Sidebar
        sessions={sessions}
        onCreateProjectChat={handleProjectChat}
        onRefreshSessions={async () => {
          const next = await api.getSessions();
          const ids = new Set(next.map(session => session.id));
          for (const id of Object.keys(sessionRunsRef.current)) {
            if (ids.has(id)) continue;
            streamSubscriptions.current.get(id)?.();
            streamSubscriptions.current.delete(id);
            delete sessionRunsRef.current[id];
          }
          setSessionRuns({ ...sessionRunsRef.current });
          setSessions(next);
          try { window.localStorage.setItem('ohmyt_cached_sessions', JSON.stringify(next)); } catch {}
        }}
        sessionActivity={Object.fromEntries(Object.entries(sessionRuns).filter(([,run]) => run.isStreaming).map(([id,run]) => [id, run.pendingPermission ? 'waiting' : 'running']))}
        unseenCompletedSessions={unseenCompletedSessions}
        activeSessionId={activeSessionId}
        isHome={activeSessionId === null}
        status={status}
        agentStatus={agentStatus}
        onGoHome={handleGoHome}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onOpenSettings={() => handleOpenSettings('settings')}
        onCollapse={handleToggleSidebar}
        hidden={!sidebarOpen}
      />

      <div className="workspace-content">
      {/* Column 2: Home or Chat Stage */}
      <main className="chat-themed-stage flex-1 min-w-0 flex flex-col h-full overflow-hidden relative" data-has-background={Boolean(chatBackgroundPaint(appearance)) && appearance.chatBackgroundOpacity > 0}>
        <div className="chat-background-layer" aria-hidden="true" style={{ backgroundImage: chatBackgroundPaint(appearance), opacity: appearance.chatBackgroundOpacity / 100 }} />
        {activeSession ? (
        (() => {
          const isBranchSplit = branch !== null && branch.branchId === activeSession.id;
          const chatStageElement = (
            <ChatStage
              approvalMode={activeSession?.approval_mode || 'ask'}
              onChangeApprovalMode={handleChangeApprovalMode}
              approvalModeSaving={approvalModeSaving}
              session={activeSession}
              sessions={sessions}
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              streamingReasoning={streamingReasoning}
              activityStartedAt={activityStartedAt}
              responsePhase={pendingPermission ? 'approval' : responsePhase}
              activeTools={activeTools}
              status={status}
              agentStatus={agentStatus}
              activeTheme={activeTheme}
              appearance={appearance}
              providers={providers}
              selectedModel={selectedModel}
              onSelectModel={handleSelectModel}
              onOpenProviders={() => handleOpenSettings('providers')}
              pendingPermission={pendingPermission}
              onRespondPermission={handleRespondPermission}
              onToggleTheme={toggleQuickTheme}
              onSendMessage={(prompt, images) => handleSendMessage(prompt, undefined, images)}
              onAbortRun={handleAbortRun}
              onDiscoveredRun={runId=>{if(activeSessionId&&sessionRunsRef.current[activeSessionId]?.activeRunId!==runId)void handleSendMessage('',activeSessionId,[],runId);}}
              onRefreshMessages={() => activeSessionId && loadMessages(activeSessionId)}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onRegenerateMessage={handleRegenerateMessage}
              onBranchMessage={handleBranchMessage}
              onForwardMessages={handleForwardMessages}
              branchMode={isBranchSplit && branch ? {
                includeContext: branch.includeContext,
                onToggleContext: handleBranchToggleContext,
                onClose: handleCloseBranch
              } : undefined}
              branchDividerIndex={isBranchSplit && branch ? branch.contextCount : undefined}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={handleToggleSidebar}
            />
          );

          if (isBranchSplit && branch) {
            return (
              <div className="branch-split">
                <BranchSourcePane
                  title={sessions.find(s => s.id === branch.sourceId)?.title || 'Chủ đề chính'}
                  messages={branchSourceMessages}
                  appearance={appearance}
                  activeTheme={activeTheme}
                />
                <div className="branch-main">
                  {chatStageElement}
                </div>
              </div>
            );
          }

          return chatStageElement;
        })()
        ) : sessionRoute ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'transparent' }} />
        ) : (
        <HomeView
          approvalMode={newChatApprovalMode}
          onChangeApprovalMode={handleChangeApprovalMode}
          mascot={appearance.mascot}
          sessions={sessions.filter(session => !session.archived_at)}
          providers={providers}
          selectedModel={selectedModel}
          status={status}
          onSelectModel={handleSelectModel}
          onSubmit={handleHomeSubmit}
          onSelectSession={handleSelectSession}
          onOpenProviders={() => handleOpenSettings('providers')}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={handleToggleSidebar}
        />
        )}
      </main>
      <BrowserPane key={activeSessionId ?? 'home'} sessionId={activeSessionId} />
      </div>
      </div>

      {/* Settings open from the sidebar without taking space from the chat. */}
      {isSettingsOpen && (
        <SettingsPage
          memories={memories}
          skills={skills}
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
          onRefreshSkills={refreshSkills}
          navCollapsed={settingsNavCollapsed}
          onToggleNav={() => setSettingsNavCollapsed(prev => !prev)}
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
