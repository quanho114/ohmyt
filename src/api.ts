import {waitDocumentContext} from './documents/contextSync.ts';
import type {TaskWorkflowId} from '../shared/task_workflow.js';
import {assertUserInputRuntime,isMissingUserInputEndpoint,RuntimeOutdatedError} from './runtimeCompatibility.ts';
import type { TaskOutcome, ImageAttachment } from './types.ts';
import { ApprovalMode, ChromeStatus, ChromeTab, Project, Session, Message, MemoryItem, SkillItem, PolicyItem, SystemStatus, Agent, AIProvider, ModelDefinition, Statistics, SttLanguage, SttResult, SttStatus } from './types.ts';
import { ResponseLanguage } from './appearance.ts';

export interface UserInputQuestion { id:string; question:string; options?:string[]; }
export interface UserInputRequest { id:string;runId:string;sessionId:string;kind:'questions'|'project';questions:UserInputQuestion[]; }
export interface ProjectContinuation {projectId:string;prompt:string;workflowId?:TaskWorkflowId|null;}

const runtime = typeof window === 'undefined' ? undefined : (window as any).electronAPI?.runtime;
const API_BASE = runtime?.apiBase || '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(runtime?.token ? { Authorization: `Bearer ${runtime.token}` } : {}),
      ...options?.headers
    }
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Chưa kết nối được với dịch vụ sky. Hãy khởi động lại ứng dụng hoặc kiểm tra dịch vụ sky có đang chạy không, rồi thử lại.');
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let message = `Lỗi mạng (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error) message = parsed.error;
    } catch {}
    if(res.status===404 && endpoint==='/document-context') {
      message='Dịch vụ tài liệu cần được cập nhật. Khởi động lại sky để Agent nhận được file đang mở.';
    }
    if (res.status === 404 && endpoint.endsWith('/approval-mode') && message.startsWith('Endpoint not found:')) {
      message = 'Dịch vụ đang chạy bản cũ. Khởi động lại sky để dùng tính năng đổi quyền; tải lại trang chưa đủ.';
    }
    if(isMissingUserInputEndpoint(res.status,endpoint,message))throw new RuntimeOutdatedError();
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export type WebSearchProvider = 'duckduckgo';
export interface BrowserFile { fileId: string; name: string; mime: string; kind: string; bytes: number; sha256: string; createdAt: number; }
export interface BrowserUseConfig { enabled: boolean; domains: string[]; mode: string; installed: boolean; desktop: boolean; }
export interface WebSearchConfig { provider: WebSearchProvider; }

export interface AgentPreset {id:string;version:1;name?:string;revision:number;readonly?:boolean;budgets?:Record<string,number>;plugins?:string[];model?:{providerId:string;modelId:string}}
export interface ConnectorItem {revision:number;id:string;name?:string;transport:'http'|'stdio';url?:string;command?:string;args?:string[];scopeId:string;hasToken?:boolean;state:string;tools?:{name:string;description?:string}[]}
export interface ArtifactItem {artifactId:string;version:number;sessionId:string;scopeId:string;title:string;mime:string;content:string}
export interface ExtensionItem {availability?:{available:boolean;reason?:string};id:string;name:string;source:string;builtin:boolean;description:string;enabled:boolean;state:string;revision:number;readonly:boolean;dependencies:string[];capabilities:string[];config:Record<string,unknown>;configSchema:{properties?:Record<string,{type?:string;title?:string;enum?:unknown[]}>}|null}
export interface InboxMessage {id:string;sessionId:string;kind:'queued'|'steering';content:string;status:string}
export interface ContextUsage {source?:string;estimatedInput?:number;output?:number|null;modelLimit?:number;breakdown?:{system:number;tools:number;messages:number;estimator:string};used:number;limit:number;reserved?:number;accuracy?:string;providerId?:string;modelId?:string}
export interface RunControls {contextUsage?:ContextUsage|null;messages:InboxMessage[];activeRunId:string|null;state:string}
export interface Goal {version:1;id:string;sessionId:string;revision:number;objective:string;steps:{id:string;text:string;status:'pending'|'in_progress'|'done'}[];limits:{rounds:number;requests:number;tools:number};phase:'active'|'paused'|'blocked'|'review_required'|'completed'|'cancelled';autoContinue:boolean;roundsStarted:number;reason:string|null;currentRound:{runId:string;round:number;status:string}|null;evidenceRefs:string[];usage:{used:{requests:number;tools:number}};runtime?:{activation:'armed'|'disarmed';running:boolean}}

export const api = {
  requireUserInputRuntime:async()=>assertUserInputRuntime(await request<{userInputVersion?:number}>('/harness')),
  getGoal:(sessionId:string)=>request<{goal:Goal|null}>(`/sessions/${encodeURIComponent(sessionId)}/goal`),
  goalCommand:(sessionId:string,input:string,expectedRevision:number)=>request<{goal:Goal|null}>(`/sessions/${encodeURIComponent(sessionId)}/goal/command`,{method:'POST',body:JSON.stringify({input,expectedRevision})}),
  createGoal:(sessionId:string,body:{objective:string;steps:{text:string}[];maxRounds:number;expectedRevision:number})=>request<{goal:Goal}>(`/sessions/${encodeURIComponent(sessionId)}/goal`,{method:'POST',body:JSON.stringify(body)}),
  editGoal:(sessionId:string,body:{objective:string;steps:{text:string}[];expectedRevision:number})=>request<{goal:Goal}>(`/sessions/${encodeURIComponent(sessionId)}/goal`,{method:'PATCH',body:JSON.stringify(body)}),
  controlGoal:(sessionId:string,action:'start'|'pause'|'cancel'|'confirm',expectedRevision:number,autoContinue?:boolean)=>request<{goal:Goal}>(`/sessions/${encodeURIComponent(sessionId)}/goal`,{method:'PATCH',body:JSON.stringify({action,expectedRevision,autoContinue})}),
  setDocumentContext: async (sessionId:string,data:{key?:string;text?:string|null;clear?:boolean}) => {
    const result=await request<{ok:boolean}>("/document-context",{method:"POST",body:JSON.stringify({sessionId,...data})});
    const key=`ohmyt-context:${sessionId}`;
    const snapshots:Record<string,string>=data.clear?{}:JSON.parse(sessionStorage.getItem(key)||'{}');
    if(data.key){delete snapshots[data.key];if(typeof data.text==='string')snapshots[data.key]=data.text;}
    sessionStorage.setItem(key,JSON.stringify(snapshots));
    return result;
  },
  getSessionEvents:(sessionId:string,afterSeq=0)=>request<{events:import('./harness/conversationReducer.ts').SemanticEvent[];latestSeq:number;revision:number}>(`/sessions/${encodeURIComponent(sessionId)}/events?afterSeq=${afterSeq}`),
  getPresets:(sessionId?:string|null)=>request<{presets:AgentPreset[];selectedId:string}>(`/agent-presets${sessionId?'?sessionId='+encodeURIComponent(sessionId):''}`),
  savePreset:(profile:Omit<AgentPreset,'revision'>,expectedRevision:number)=>request<AgentPreset>('/agent-presets',{method:'PUT',body:JSON.stringify({profile,expectedRevision})}),
  selectPreset:(selectedId:string,sessionId?:string|null)=>request<AgentPreset>('/agent-presets',{method:'PUT',body:JSON.stringify({selectedId,sessionId})}),
  getSubagents:(runId:string)=>request<{children:{id:string;task:string;state:string;outcome?:TaskOutcome|null}[]}>(`/runs/${encodeURIComponent(runId)}/subagents`),
  getSubagentResult:(runId:string,id:string)=>request<{messages:{sender:string;content:string}[]}>(`/runs/${encodeURIComponent(runId)}/subagents/${encodeURIComponent(id)}/result`),
  cancelSubagent:(runId:string,id:string)=>request(`/runs/${encodeURIComponent(runId)}/subagents/${encodeURIComponent(id)}/cancel`,{method:'POST'}),

  getConnectors:()=>request<{connectors:ConnectorItem[]}>('/connectors'),
  saveConnector:(config:Omit<ConnectorItem,'state'|'revision'|'hasToken'|'tools'>&{token?:string;expectedRevision?:number})=>request<ConnectorItem>('/connectors',{method:'PUT',body:JSON.stringify(config)}),
  connectorAction:(id:string,action:'test'|'connect'|'disconnect')=>request<{connected?:boolean;error?:string;toolCount?:number}>(`/connectors/${encodeURIComponent(id)}/${action}`,{method:'POST'}),

  getArtifact:(id:string,sessionId:string)=>request<ArtifactItem>(`/artifacts/${encodeURIComponent(id)}?sessionId=${encodeURIComponent(sessionId)}`),
  getDiagnostics:(runId:string)=>request(`/runs/${encodeURIComponent(runId)}/diagnostics`),

  getExtensions:()=>request<{extensions:ExtensionItem[]}>('/extensions'),
  updateExtension:(id:string,body:{enabled:boolean;config:Record<string,unknown>;expectedVersion:number})=>request<ExtensionItem>(`/extensions/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)}),
  getRunControls:(sessionId:string)=>request<RunControls>(`/sessions/${encodeURIComponent(sessionId)}/inbox`),
  enqueueMessage:(sessionId:string,kind:'queued'|'steering',content:string)=>request<InboxMessage>(`/sessions/${encodeURIComponent(sessionId)}/inbox`,{method:'POST',body:JSON.stringify({clientMessageId:crypto.randomUUID(),kind,content})}),
  editPendingMessage:(sessionId:string,id:string,content:string)=>request<InboxMessage>(`/sessions/${encodeURIComponent(sessionId)}/inbox/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({content})}),
  setPendingMode:(sessionId:string,id:string,kind:'queued'|'steering')=>request<InboxMessage>(`/sessions/${encodeURIComponent(sessionId)}/inbox/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({kind})}),
  cancelPendingMessage:(sessionId:string,id:string)=>request(`/sessions/${encodeURIComponent(sessionId)}/inbox/${encodeURIComponent(id)}`,{method:'DELETE'}),
  controlRun:(runId:string,action:'pause'|'resume')=>request<{runId:string;state:string}>(`/runs/${encodeURIComponent(runId)}/${action}`,{method:'POST'}),

  getBrowserFiles: (sessionId: string) => request<{files: BrowserFile[]}>(`/browser-use/files?sessionId=${encodeURIComponent(sessionId)}`),
  uploadBrowserFile: async (sessionId: string, file: File) => {
    if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('File phải nhỏ hơn hoặc bằng 25 MB và không rỗng.');
    return request<BrowserFile>(`/browser-use/files?sessionId=${encodeURIComponent(sessionId)}`, { method: 'POST', body: await file.arrayBuffer(), headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-File-Type': file.type || 'application/octet-stream' } });
  },
  removeBrowserFile: (sessionId: string, fileId: string) => request(`/browser-use/files/${encodeURIComponent(fileId)}?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  downloadBrowserFile: async (sessionId: string, file: BrowserFile) => {
    const response = await fetch(`${API_BASE}/browser-use/files/${encodeURIComponent(file.fileId)}/content?sessionId=${encodeURIComponent(sessionId)}`, { headers: runtime?.token ? { Authorization: `Bearer ${runtime.token}` } : {} });
    if (!response.ok) throw new Error('Không tải được file. File có thể đã bị xóa hoặc không thuộc chat này.');
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');link.href = objectUrl;link.download = file.name;link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  },
  getBrowserRuns: (sessionId:string) => request<{runs:{runId:string;state:string;authentication:boolean}[]}>(`/browser-use/runs?sessionId=${encodeURIComponent(sessionId)}`),
  controlBrowserRun: (sessionId:string,runId:string,action:'pause'|'resume'|'authentication') => request(`/browser-use/runs/${encodeURIComponent(runId)}/control?sessionId=${encodeURIComponent(sessionId)}`,{method:'POST',body:JSON.stringify({action})}),
  getBrowserUseConfig: () => request<BrowserUseConfig>('/browser-use/config'),
  saveBrowserUseConfig: (config: { enabled: boolean; domains: string[] }) => request<BrowserUseConfig>('/browser-use/config', { method: 'PUT', body: JSON.stringify(config) }),
  getWebSearchConfig: () => request<WebSearchConfig>('/web-search/config'),
  saveWebSearchConfig: (config: { provider: WebSearchProvider }) => request<WebSearchConfig>('/web-search/config', { method: 'PUT', body: JSON.stringify(config) }),
  testWebSearch: (provider: WebSearchProvider) => request<{ connected: boolean; latencyMs?: number; resultsCount?: number; message?: string }>('/web-search/test', { method: 'POST', body: JSON.stringify({ provider }) }),

  getChromeStatus: (sessionId: string) => request<ChromeStatus>(`/chrome/status?sessionId=${encodeURIComponent(sessionId)}`),
  createChromePairing: () => request<{ connection: string; expiresAt: number }>('/chrome/pairing', { method: 'POST' }),
  getChromeTabs: () => request<ChromeTab[]>('/chrome/tabs'),
  shareChromeTabs: (sessionId: string, tabIds: number[]) => request<ChromeStatus>('/chrome/share', { method: 'POST', body: JSON.stringify({ sessionId, tabIds }) }),
  disconnectChrome: () => request<{ success: boolean }>('/chrome/disconnect', { method: 'POST' }),
  getSttStatus: () => request<SttStatus>('/stt/status'),
  ensureSttModel: (language: SttLanguage) => request<SttStatus>('/stt/ensure', { method: 'POST', body: JSON.stringify({ language }) }),
  transcribeStt: async (audio: Blob, language: SttLanguage): Promise<SttResult> => {
    const response = await fetch(`${API_BASE}/stt/transcribe?language=${encodeURIComponent(language)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
        ...(runtime?.token ? { Authorization: `Bearer ${runtime.token}` } : {}),
      },
      body: audio,
    });
    if (response.status === 503) {
      let progress = '';
      try {
        const body = await response.json();
        if (typeof body.progress === 'number') progress = String(Math.round(body.progress * 100));
      } catch {}
      throw new Error(`STT_DOWNLOADING:${progress}`);
    }
    if (!response.ok) {
      let message = `Lỗi mạng (HTTP ${response.status})`;
      try {
        const parsed = await response.json();
        if (parsed.error) message = parsed.error;
      } catch {}
      throw new Error(message);
    }
    return response.json() as Promise<SttResult>;
  },
  downloadChromeExtension: async () => {
    const response = await fetch(`${API_BASE}/chrome/extension`, { headers: runtime?.token ? { Authorization: `Bearer ${runtime.token}` } : {} });
    if (!response.ok) throw new Error('Chưa tải được tiện ích. Khởi động lại sky và thử lại.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = 'sky-chrome.zip'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  getProjectPermissions: (id: string) => request<Array<{scope_id: string; pattern: string; action: string}>>(`/projects/${encodeURIComponent(id)}/permissions`),
  revokeProjectPermission: (id: string, pattern: string) => request<{success:boolean}>(`/projects/${encodeURIComponent(id)}/permissions`, {method:'DELETE',body:JSON.stringify({pattern})}),
  assignMemoryProject: (id: string, projectId: string | null) => request<{success:boolean}>(`/memories/${encodeURIComponent(id)}/scope`, {method:'PATCH',body:JSON.stringify({projectId})}),
  getProjects: () => request<Project[]>('/projects'),
  removeProject: (id: string) => request<{ success: boolean }>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateProject: (id: string, values: { name?: string; pinned?: boolean; section?: string | null }) => request<Project>(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(values) }),
  archiveProjectChats: (id: string, archived: boolean) => request<{ success: boolean; count: number }>(`/projects/${encodeURIComponent(id)}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
  archiveSession: (id: string, archived: boolean) => request<{ success: boolean }>(`/sessions/${encodeURIComponent(id)}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) }),
  addProject: (path: string) => request<Project>('/projects', { method: 'POST', body: JSON.stringify({ path }) }),
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
  createSession: (title = 'Đoạn chat mới', agentId = 'default-assistant', projectId: string | null = null) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, agentId, projectId })
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
  forwardMessages: (targetSessionId: string, msgs: Array<{ sender: string; content: string }>, note?: string, sourceSessionId?: string) =>
    request<{ success: boolean; inserted: number }>('/sessions/forward', {
      method: 'POST',
      body: JSON.stringify({ targetSessionId, messages: msgs, note, sourceSessionId })
    }),

  // Runs
  setSessionApprovalMode: (id: string, mode: ApprovalMode) => request<Session>(`/sessions/${encodeURIComponent(id)}/approval-mode`, { method: 'PUT', body: JSON.stringify({ mode }) }),
  startRun: async (sessionId: string, prompt: string, responseLanguage?: ResponseLanguage, images?: ImageAttachment[], workflowId?: TaskWorkflowId) => {
    if(workflowId)await api.requireUserInputRuntime();
    await waitDocumentContext(sessionId);
    return request<{ runId: string; sessionId: string; status: string }>('/runs', {
      method: 'POST',
      body: JSON.stringify({ sessionId, prompt, responseLanguage, images, workflowId, documentSnapshots: Object.entries(JSON.parse(sessionStorage.getItem(`ohmyt-context:${sessionId}`)||'{}')).map(([key,text])=>({key,text})) })
    });},

  // Permissions
  getUserInputs: (sessionId:string)=>request<{requests:UserInputRequest[]}>(`/sessions/${encodeURIComponent(sessionId)}/user-input`),
  answerUserInput: (item:UserInputRequest,answer:{answers?:{id:string;answer:string}[];text?:string;projectId?:string})=>request<{ok:true;continuation?:ProjectContinuation}>(`/runs/${encodeURIComponent(item.runId)}/user-input/${encodeURIComponent(item.id)}`,{method:'POST',body:JSON.stringify(answer)}),
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
      // EventSource reconnects transient failures and the server replays the run.
      // The chat deduplicates replayed event IDs. Only a permanently closed
      // source is terminal; closing here would suppress native recovery.
      if (es.readyState === EventSource.CLOSED) onError(new Error('Mất kết nối SSE stream'));
    };

    return () => {
      es.close();
    };
  }
};
