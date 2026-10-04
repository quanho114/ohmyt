import { Session, Message, MemoryItem, SkillItem, PolicyItem, SystemStatus, Agent, AIProvider, ModelDefinition, Statistics } from './types.ts';
import { ResponseLanguage } from './appearance.ts';

const runtime = (window as any).electronAPI?.runtime;
const API_BASE = runtime?.apiBase || '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(runtime?.token ? { Authorization: `Bearer ${runtime.token}` } : {}),
      ...options?.headers
    }
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let message = `Lỗi mạng (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error) message = parsed.error;
    } catch {}
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Status
  getStatus: () => request<SystemStatus>('/status'),
  getNetwork: () => request<{ port: number; addresses: string[] }>('/network'),
  updateLlmConfig: (config: { provider?: string; endpoint?: string; apiKey?: string; model?: string }) =>
    request<{ success: boolean; health: { available: boolean; error?: string } }>('/llm/config', {
      method: 'POST',
      body: JSON.stringify(config)
    }),

  getStatistics: (month: string) => request<Statistics>(`/statistics?month=${encodeURIComponent(month)}&offset=${new Date().getTimezoneOffset()}`),

  // Agents
  getAgents: () => request<Agent[]>('/agents'),

  // Sessions
  getSessions: () => request<Session[]>('/sessions'),
  createSession: (title = 'Đoạn chat mới', agentId = 'default-assistant') =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, agentId })
    }),
  renameSession: (id: string, title: string) =>
    request<Session>(`/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title })
    }),
  deleteSession: (id: string) =>
    request<{ success: boolean; id: string }>(`/sessions/${id}`, {
      method: 'DELETE'
    }),

  // Messages
  getMessages: (sessionId: string) => request<Message[]>(`/sessions/${sessionId}/messages`),
  deleteMessage: (sessionId: string, messageId: string) =>
    request<{ success: boolean; id: string }>(`/sessions/${sessionId}/messages/${messageId}`, {
      method: 'DELETE'
    }),
  truncateMessages: (sessionId: string, afterId: string | null) =>
    request<{ success: boolean; deleted: number }>(`/sessions/${sessionId}/messages/truncate`, {
      method: 'POST',
      body: JSON.stringify({ afterId })
    }),
  branchSession: (sourceSessionId: string, anchorId: string | null, opts?: { title?: string; includeContext?: boolean }) =>
    request<{ session: Session; copied: number }>('/sessions/branch', {
      method: 'POST',
      body: JSON.stringify({ sourceSessionId, anchorId, title: opts?.title, includeContext: opts?.includeContext })
    }),
  forwardMessages: (targetSessionId: string, msgs: Array<{ sender: string; content: string }>, note?: string) =>
    request<{ success: boolean; inserted: number }>('/sessions/forward', {
      method: 'POST',
      body: JSON.stringify({ targetSessionId, messages: msgs, note })
    }),

  // Runs
  startRun: (sessionId: string, prompt: string, responseLanguage?: ResponseLanguage) =>
    request<{ runId: string; sessionId: string; status: string }>('/runs', {
      method: 'POST',
      body: JSON.stringify({ sessionId, prompt, responseLanguage })
    }),

  // Permissions
  respondPermission: (runId: string, requestId: string, decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') =>
    request<{ success: boolean }>(`/runs/${runId}/permission`, {
      method: 'POST',
      body: JSON.stringify({ requestId, decision })
    }),

  // Abort / Take Control
  abortRun: (runId: string, reason = 'Kích hoạt Take Control') =>
    request<{ success: boolean; runId: string; aborted: boolean }>(`/runs/${runId}/abort`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  // Memories
  getMemories: (query?: string) =>
    request<MemoryItem[]>(query ? `/memories?q=${encodeURIComponent(query)}` : '/memories'),
  deleteMemory: (id: string) =>
    request<{ success: boolean; id: string }>(`/memories/${id}`, {
      method: 'DELETE'
    }),

  // Skills
  getSkills: () => request<SkillItem[]>('/skills'),
  createSkill: (data: Partial<SkillItem> & { instructions: string }) =>
    request<SkillItem>('/skills', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateSkill: (id: string, patch: Partial<SkillItem>) =>
    request<SkillItem>(`/skills/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
  deleteSkill: (id: string) =>
    request<{ success: boolean; id: string }>(`/skills/${id}`, {
      method: 'DELETE'
    }),
  importSkillFromUrl: (url: string) =>
    request<SkillItem>('/skills/import-url', {
      method: 'POST',
      body: JSON.stringify({ url })
    }),
  importSkillFromGitHub: (repoUrl: string) =>
    request<SkillItem>('/skills/import-github', {
      method: 'POST',
      body: JSON.stringify({ repoUrl })
    }),
  uploadSkill: (data: { filename: string; content: string; isBase64?: boolean }) =>
    request<SkillItem>('/skills/upload', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Policies
  getPolicies: () => request<PolicyItem[]>('/policies'),
  setPolicy: (pattern: string, action: 'ALLOW' | 'ASK' | 'DENY') =>
    request<PolicyItem[]>('/policies', {
      method: 'POST',
      body: JSON.stringify({ pattern, action })
    }),

  // Providers & Models (P0)
  getProviders: () => request<AIProvider[]>('/providers'),
  createProvider: (b: { id?: string; name: string; type: string; baseURL: string; apiKey?: string; config?: object }) =>
    request<AIProvider>('/providers', { method: 'POST', body: JSON.stringify(b) }),
  updateProvider: (id: string, b: { name?: string; type?: string; baseURL?: string; apiKey?: string; config?: object; enabled?: boolean }) =>
    request<AIProvider>(`/providers/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteProvider: (id: string) =>
    request<{ success: boolean }>(`/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string) =>
    request<{ connected: boolean; latencyMs: number; modelsDiscovered: number; code?: string; message?: string }>(`/providers/${id}/test`, { method: 'POST' }),
  getAllModels: () => request<ModelDefinition[]>('/models'),
  listModels: (providerId: string) => request<ModelDefinition[]>(`/providers/${providerId}/models`),
  addModel: (providerId: string, b: { modelId: string; displayName?: string; capabilities?: object; contextWindow?: number; maxOutputTokens?: number }) =>
    request<ModelDefinition>(`/providers/${providerId}/models`, { method: 'POST', body: JSON.stringify(b) }),
  updateModel: (providerId: string, modelRowId: string, b: { display_name?: string; capabilities?: object; context_window?: number | null; max_output_tokens?: number | null; enabled?: boolean }) =>
    request<ModelDefinition>(`/providers/${providerId}/models/${modelRowId}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteModel: (providerId: string, modelRowId: string) =>
    request<{ success: boolean }>(`/providers/${providerId}/models/${modelRowId}`, { method: 'DELETE' }),
  getSessionModel: (sessionId: string) => request<{ override: { providerId: string; modelId: string } | null }>(`/sessions/${sessionId}/model`),
  setSessionModel: (sessionId: string, override: { providerId: string; modelId: string } | null) =>
    request<{ override: { providerId: string; modelId: string } | null }>(`/sessions/${sessionId}/model`, { method: 'PATCH', body: JSON.stringify({ override }) }),

  // SSE Stream
  subscribeRunStream: (
    runId: string,
    onEvent: (event: { eventId?: string; sequence?: number; type: string; payload: Record<string, unknown> }) => void,
    onError: (err: Error) => void
  ) => {
    const es = new EventSource(`${API_BASE}/runs/${runId}/stream${runtime?.token ? `?token=${encodeURIComponent(runtime.token)}` : ''}`);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as { type: string; payload: Record<string, unknown> };
        onEvent(parsed);
      } catch (err) {
        console.error('Lỗi phân tích SSE:', err);
      }
    };

    es.onerror = () => {
      es.close();
      onError(new Error('Mất kết nối SSE stream'));
    };

    return () => {
      es.close();
    };
  }
};
