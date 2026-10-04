export interface Agent {
  id: string;
  name: string;
  avatar: string;
  system_prompt: string;
  model_provider: string;
  model_name: string;
  temperature: number;
  created_at: number;
}

export interface Session {
  id: string;
  agent_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  agent_name?: string;
  agent_avatar?: string;
  last_message?: string;
}

export interface Message {
  id: string;
  session_id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  metadata?: string | null;
  created_at: number;
}

export interface ToolCallItem {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  durationMs?: number;
  status: 'running' | 'completed' | 'blocked' | 'error';
}

export interface RunEventPayload {
  runId: string;
  [key: string]: unknown;
}

export interface MemoryItem {
  id: string;
  agent_id: string;
  category: string;
  content: string;
  created_at: number;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  version: string;
  requiredTools: string[];
  instructions: string;
  enabled?: boolean;
  author?: string;
  builtin?: boolean;
  icon?: string;
}

export interface PolicyItem {
  id: string;
  pattern: string;
  action: 'ALLOW' | 'ASK' | 'DENY';
}

export interface SystemStatus {
  status: string;
  engine: string;
  db: string;
  llm: {
    provider: string;
    endpoint: string;
    model: string;
    available: boolean;
  };
  toolsCount: number;
  skillsCount: number;
  timestamp: number;
}

export interface Statistics {
  month: string;
  today: string;
  firstActivity: number | null;
  totals: { agents: number; sessions: number; messages: number; runs: number; tokens: null };
  previous: { runs: number; messages: number };
  activity: {
    daily: Array<{ date: string; runs: number; messages: number }>;
    peakRuns: number;
    peakMessages: number;
    currentStreak: number;
    longestStreak: number;
    longestRunMs: number | null;
  };
  rankings: { agents: Array<{ name: string; count: number }>; conversations: Array<{ name: string; count: number }> };
  monthly: {
    daily: Array<{ date: string; runs: number; messages: number }>;
    runs: number;
    messages: number;
    activeModels: number;
    todayCost: null;
    monthCost: null;
    tokens: null;
  };
}

export interface PermissionRequest {
  runId: string;
  requestId: string;
  toolName: string;
  target: string;
  input: Record<string, unknown>;
  description: string;
}

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'google' | 'openai-compatible' | 'custom';

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderType;
  base_url?: string;
  api_key_ref?: string;
  config_json?: string;
  enabled: number;
  models: ModelDefinition[];
}

export interface ModelDefinition {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  capabilities_json: string;
  context_window?: number | null;
  max_output_tokens?: number | null;
  enabled: number;
}

export interface ResponseActivityData {
  phase?: 'waiting' | 'reasoning' | 'tools' | 'answer' | 'approval';
  reasoning: string;
  tools: ToolCallItem[];
  startedAt: number;
  durationMs?: number;
  status?: 'completed' | 'warnings' | 'error' | 'aborted';
}
