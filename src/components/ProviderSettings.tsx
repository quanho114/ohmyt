import React, { useState } from 'react';
import { AIProvider, ModelDefinition } from '../types.ts';
import { api } from '../api.ts';
import {
  Search,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Layers,
  Zap,
  ChevronRight
} from 'lucide-react';

interface ProviderSettingsProps {
  providers: AIProvider[];
  onRefresh: () => void;
}

function parseCaps(m: ModelDefinition): Record<string, boolean> {
  try {
    return JSON.parse(m.capabilities_json || '{}');
  } catch {
    return {};
  }
}

function providerDescription(p: AIProvider): string {
  try {
    const cfg = JSON.parse(p.config_json || '{}');
    return typeof cfg.description === 'string' ? cfg.description : '';
  } catch {
    return '';
  }
}

const CAP_LABELS: Array<[string, string]> = [
  ['tools', 'Tools'],
  ['vision', 'Vision'],
  ['json', 'JSON'],
  ['reasoning', 'Reasoning'],
  ['embeddings', 'Embed']
];

const CATALOG_PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    type: 'anthropic',
    defaultBase: 'https://api.anthropic.com',
    description: 'Anthropic phát triển các mô hình ngôn ngữ tiên tiến như Claude 3.5 Sonnet, Claude 3 Opus...',
    badge: 'Claude'
  },
  {
    id: 'google',
    name: 'Google Gemini',
    type: 'google',
    defaultBase: 'https://generativelanguage.googleapis.com',
    description: 'Dòng Gemini của Google là AI đa năng tiên tiến nhất, hỗ trợ multimodal và context window siêu lớn.',
    badge: 'Gemini'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    defaultBase: 'https://api.openai.com/v1',
    description: 'OpenAI là phòng nghiên cứu AI hàng đầu với các mô hình GPT-4o, o1, o3-mini tiên tiến.',
    badge: 'GPT-4o'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    defaultBase: 'https://api.deepseek.com/v1',
    description: 'DeepSeek tập trung vào nghiên cứu và ứng dụng AI với DeepSeek V3 và DeepSeek R1 reasoning.',
    badge: 'V3 / R1'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    type: 'ollama',
    defaultBase: 'http://localhost:11434',
    description: 'Chạy các mô hình mã nguồn mở cục bộ ngay trên máy cá nhân, bảo mật và riêng tư 100%.',
    badge: 'Local Engine'
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    type: 'openai-compatible',
    defaultBase: 'https://api.moonshot.cn/v1',
    description: 'Kimi Code từ Moonshot AI cung cấp quyền truy cập vào các mô hình Kimi bao gồm K2.5.',
    badge: 'Kimi'
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    type: 'custom',
    defaultBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    description: 'Amazon Bedrock cung cấp các mô hình nền tảng từ AI21, Anthropic, Cohere, Meta qua AWS.',
    badge: 'AWS'
  },
  {
    id: 'xinference',
    name: 'Xinference',
    type: 'openai-compatible',
    defaultBase: 'http://localhost:9997/v1',
    description: 'Xorbits Inference là nền tảng mã nguồn mở giúp đơn giản hóa việc chạy và tích hợp AI nội bộ.',
    badge: 'Self-hosted'
  }
];

const BrandLogo: React.FC<{ type: string; name?: string; size?: number }> = ({ type, name = '', size = 22 }) => {
  const lower = (type + ' ' + name).toLowerCase();

  if (lower.includes('anthropic') || lower.includes('claude')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (lower.includes('google') || lower.includes('gemini')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" fill="url(#gemini-grad-icon)" />
          <defs>
            <linearGradient id="gemini-grad-icon" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4285F4" />
              <stop offset="0.5" stopColor="#9B72CB" />
              <stop offset="1" stopColor="#D96570" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  if (lower.includes('openai') || lower.includes('chatgpt')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-zinc-500/10 border border-zinc-500/20 flex items-center justify-center flex-shrink-0 text-zinc-900 dark:text-zinc-100">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.28 9.37a5.98 5.98 0 0 0-.52-4.93 6.06 6.06 0 0 0-6.44-2.82 5.97 5.97 0 0 0-4.47-2 6.06 6.06 0 0 0-5.77 4.2A5.98 5.98 0 0 0 2 8.7a6.06 6.06 0 0 0 .66 7.02 5.98 5.98 0 0 0 .52 4.93 6.06 6.06 0 0 0 6.44 2.82 5.97 5.97 0 0 0 4.47 2 6.06 6.06 0 0 0 5.77-4.2 5.98 5.98 0 0 0 3.09-4.88 6.06 6.06 0 0 0-.67-7.02ZM13 20.93a4.5 4.5 0 0 1-2.92-1.07l.15-.08 4.84-2.8a.78.78 0 0 0 .39-.68v-6.84l2.17 1.25a.08.08 0 0 1 .04.06v5.67a4.52 4.52 0 0 1-4.67 4.49ZM4.42 17.5a4.5 4.5 0 0 1-.58-3.07l.15.09 4.84 2.8a.78.78 0 0 0 .78 0l5.92-3.42v2.5a.08.08 0 0 1-.03.07l-4.91 2.84a4.52 4.52 0 0 1-6.17-1.81ZM3.47 8.35a4.5 4.5 0 0 1 2.34-1.99v5.77a.78.78 0 0 0 .39.68l5.92 3.42-2.17 1.25a.08.08 0 0 1-.08 0l-4.9-2.83a4.52 4.52 0 0 1-1.5-6.3ZM18.9 12.35l-5.92-3.42 2.17-1.25a.08.08 0 0 1 .08 0l4.9 2.83a4.52 4.52 0 0 1 1.5 6.3 4.5 4.5 0 0 1-2.34 2v-5.78a.78.78 0 0 0-.39-.68ZM20.16 6.5a4.5 4.5 0 0 1 .58 3.07l-.15-.09-4.84-2.8a.78.78 0 0 0-.78 0L9.05 10.1V7.6a.08.08 0 0 1 .03-.07l4.91-2.84a4.52 4.52 0 0 1 6.17 1.81ZM10.5 3.07a4.5 4.5 0 0 1 2.92 1.07l-.15.08-4.84 2.8a.78.78 0 0 0-.39.68v6.84l-2.17-1.25a.08.08 0 0 1-.04-.06V7.56a4.52 4.52 0 0 1 4.67-4.49ZM12 13.8l-2.87-1.66 2.87-1.66 2.87 1.66L12 13.8Z" />
        </svg>
      </div>
    );
  }

  if (lower.includes('deepseek')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center flex-shrink-0">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M3 13C6 7 11 4 18 6C15 10 17 15 21 17C15 20 7 19 3 13Z" fill="#2563EB" />
        </svg>
      </div>
    );
  }

  if (lower.includes('ollama')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-zinc-800/10 dark:bg-zinc-200/10 border border-zinc-500/20 flex items-center justify-center flex-shrink-0 text-zinc-900 dark:text-zinc-100">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a5 5 0 0 0-5 5v3H5a2 2 0 0 0-2 2v6a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-6a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5Zm-2 8V7a2 2 0 1 1 4 0v3h-4Z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0">
      {name.slice(0, 2).toUpperCase() || 'AI'}
    </div>
  );
};

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({ providers, onRefresh }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [pType, setPType] = useState('openai-compatible');
  const [pName, setPName] = useState('My Local Server');
  const [pBase, setPBase] = useState('http://localhost:1234');
  const [pKey, setPKey] = useState('');
  const [pId, setPId] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pLogo, setPLogo] = useState('');
  const [pFormat, setPFormat] = useState('openai');

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [newModelId, setNewModelId] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [detecting, setDetecting] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [detailBase, setDetailBase] = useState('');
  const [detailKey, setDetailKey] = useState('');
  const [detailMsg, setDetailMsg] = useState('');
  const [showKey, setShowKey] = useState(false);

  const selected = providers.find((p) => p.id === selectedId) || null;

  const openDetail = (p: AIProvider) => {
    setSelectedId(p.id);
    setDetailBase(p.base_url || '');
    setDetailKey('');
    setDetailMsg('');
    setModelSearch('');
    setShowKey(false);
  };

  const openCatalogItem = (cat: typeof CATALOG_PROVIDERS[0]) => {
    const existing = providers.find((p) => p.id === cat.id || p.name.toLowerCase().includes(cat.id));
    if (existing) {
      openDetail(existing);
    } else {
      setPType(cat.type);
      setPName(cat.name);
      setPBase(cat.defaultBase);
      setPKey('');
      setPId(cat.id);
      setPDesc(cat.description);
      setPLogo('');
      setPFormat('openai');
      setShowAdd(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const name = pName.trim();
    const baseURL = pBase.trim();
    const isCustom = pType === 'custom';
    const slug = pId.trim().toLowerCase();

    if (isCustom && !slug) {
      setFormError('Vui lòng nhập ID nhà cung cấp (vd: my-provider).');
      return;
    }
    if (!name) {
      setFormError('Vui lòng nhập tên provider.');
      return;
    }
    if (!baseURL) {
      setFormError('Vui lòng nhập Base URL (vd: http://localhost:1234).');
      return;
    }

    try {
      const created = await api.createProvider({
        ...(isCustom ? { id: slug } : {}),
        name,
        type: pType,
        baseURL,
        apiKey: pKey.trim() || undefined,
        ...(isCustom ? { config: { requestFormat: pFormat, description: pDesc.trim(), logo: pLogo.trim() } } : {})
      });
      setShowAdd(false);
      setPKey('');
      setDetecting(true);
      try {
        const t = await api.testProvider(created.id);
        setTestResult((prev) => ({
          ...prev,
          [created.id]: t.connected
            ? `Connected • ${t.latencyMs}ms • ${t.modelsDiscovered} models`
            : `Saved, nhưng kết nối thất bại: ${t.code || ''} ${t.message || ''}`
        }));
      } catch {
        setTestResult((prev) => ({
          ...prev,
          [created.id]: 'Saved, nhưng chưa detect được models. Bấm Test Connection để thử lại.'
        }));
      } finally {
        setDetecting(false);
      }
      onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const r = await api.testProvider(id);
      setTestResult((prev) => ({
        ...prev,
        [id]: r.connected ? `Connected • ${r.latencyMs}ms • ${r.modelsDiscovered} models` : `Failed: ${r.code || ''} ${r.message || ''}`
      }));
    } catch (err) {
      setTestResult((prev) => ({ ...prev, [id]: `Failed: ${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setTestingId(null);
      onRefresh();
    }
  };

  const handleAddModel = async (providerId: string) => {
    const modelId = (newModelId[providerId] || '').trim();
    if (!modelId) return;
    setActionError('');
    try {
      await api.addModel(providerId, { modelId });
      setNewModelId((prev) => ({ ...prev, [providerId]: '' }));
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleModel = async (providerId: string, m: ModelDefinition) => {
    setActionError('');
    try {
      await api.updateModel(providerId, m.id, { enabled: !m.enabled });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteModel = async (providerId: string, m: ModelDefinition) => {
    if (!confirm(`Xóa model ${m.display_name}?`)) return;
    setActionError('');
    try {
      await api.deleteModel(providerId, m.id);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleEnabled = async (p: AIProvider) => {
    setActionError('');
    try {
      await api.updateProvider(p.id, { enabled: !p.enabled });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Xóa provider ${name}?`)) return;
    setActionError('');
    try {
      await api.deleteProvider(id);
      if (selectedId === id) setSelectedId(null);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveDetail = async () => {
    if (!selected) return;
    setDetailMsg('');
    try {
      const patch: { baseURL?: string; apiKey?: string } = {};
      if (detailBase.trim() && detailBase.trim() !== (selected.base_url || '')) patch.baseURL = detailBase.trim();
      if (detailKey.trim()) patch.apiKey = detailKey.trim();
      if (Object.keys(patch).length === 0) {
        setDetailMsg('Chưa có gì thay đổi.');
        return;
      }
      await api.updateProvider(selected.id, patch);
      setDetailKey('');
      setDetailMsg('Đã lưu.');
      onRefresh();
    } catch (err) {
      setDetailMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const enabledProviders = providers.filter((p) => p.enabled);
  const disabledProviders = providers.filter((p) => !p.enabled);

  // Filter providers for sidebar
  const qSide = sidebarSearch.trim().toLowerCase();
  const filteredEnabled = enabledProviders.filter((p) => !qSide || p.name.toLowerCase().includes(qSide));
  const filteredDisabled = disabledProviders.filter((p) => !qSide || p.name.toLowerCase().includes(qSide));

  // Catalog items that are not yet added in providers
  const unconfiguredCatalog = CATALOG_PROVIDERS.filter(
    (cat) => !providers.some((p) => p.id === cat.id || p.name.toLowerCase().includes(cat.id))
  );

  return (
    <div className="flex-1 flex flex-row h-full min-h-0 overflow-hidden select-none">
      {/* 1. LOBEHUB SUB-SIDEBAR (List of Providers) */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col h-full border-r border-[var(--border)]"
        style={{ backgroundColor: 'var(--sidebar)' }}
      >
        {/* Search & Add Bar */}
        <div className="p-3 space-y-2 border-b border-[var(--border)]">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 opacity-40 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm kiếm nhà cung cấp..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full text-xs rounded-lg py-1.5 pl-8 pr-2.5 focus:outline-none"
              style={{
                backgroundColor: 'var(--input-background)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setPType('openai-compatible');
              setPName('');
              setPBase('');
              setPKey('');
              setPId('');
              setPDesc('');
              setPLogo('');
              setShowAdd(true);
            }}
            aria-label="+ Add Provider"
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-xs"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)'
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>Thêm nhà cung cấp</span>
          </button>
        </div>

        {/* Providers Tree / List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Tất cả (All view) */}
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              selectedId === null ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
            }`}
            style={{ color: 'var(--text-primary)' }}
          >
            <div className="flex items-center gap-2">
              <Layers size={14} className="opacity-60" />
              <span>Tất cả nhà cung cấp</span>
            </div>
            <span className="text-[10px] font-mono-code opacity-60 px-1.5 py-0.2 rounded bg-[var(--surface)]">
              {providers.length}
            </span>
          </button>

          {/* Đã bật Group */}
          {filteredEnabled.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50 flex items-center justify-between">
                <span>Đã bật</span>
                <span>{filteredEnabled.length}</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {filteredEnabled.map((p) => {
                  const isSel = selectedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openDetail(p)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isSel ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BrandLogo type={p.type} name={p.name} size={16} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Đã tắt Group */}
          {filteredDisabled.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50 flex items-center justify-between">
                <span>Đã tắt</span>
                <span>{filteredDisabled.length}</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {filteredDisabled.map((p) => {
                  const isSel = selectedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openDetail(p)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer opacity-70 hover:opacity-100 ${
                        isSel ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BrandLogo type={p.type} name={p.name} size={16} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto p-6 lg:p-8" style={{ backgroundColor: 'var(--surface)' }}>
        {actionError && (
          <div className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2" style={{ backgroundColor: 'var(--danger)', color: 'var(--danger-contrast)' }}>
            <AlertCircle size={15} />
            <span>{actionError}</span>
          </div>
        )}

        {detecting && (
          <div className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2 bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Loader2 size={15} className="animate-spin" />
            <span>Đang tự động phát hiện models từ endpoint...</span>
          </div>
        )}

        {/* VIEW 1: DETAIL VIEW OF SINGLE PROVIDER */}
        {selected ? (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex items-center gap-1.5 text-xs font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ArrowLeft size={14} />
                <span>Tất cả nhà cung cấp</span>
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: selected.enabled ? 'var(--success)' : 'var(--text-tertiary)' }}>
                  {selected.enabled ? 'Đang bật' : 'Đã tắt'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(selected.enabled)}
                  onClick={() => handleToggleEnabled(selected)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center p-0.5 cursor-pointer ${
                    selected.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
                      selected.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Provider Card Header */}
            <div
              className="p-5 rounded-2xl border border-[var(--border)] flex items-center justify-between gap-4"
              style={{ backgroundColor: 'var(--surface-secondary)' }}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <BrandLogo type={selected.type} name={selected.name} size={28} />
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selected.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {selected.type}
                    </span>
                    <span className="text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {(selected.models || []).length} mô hình khả dụng
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTest(selected.id)}
                disabled={testingId === selected.id}
                className="px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] flex items-center gap-1.5 transition-all shadow-xs"
                style={{ color: 'var(--text-primary)' }}
              >
                {testingId === selected.id ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                <span>Test Connection</span>
              </button>
            </div>

            {testResult[selected.id] && (
              <div
                className={`p-3 rounded-xl text-xs font-mono-code flex items-center gap-2 ${
                  testResult[selected.id].includes('Connected') ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                }`}
              >
                {testResult[selected.id].includes('Connected') ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{testResult[selected.id]}</span>
              </div>
            )}

            {/* Connection Credentials Card */}
            <div className="p-5 rounded-2xl border border-[var(--border)] space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60" style={{ color: 'var(--text-tertiary)' }}>
                Cấu hình kết nối API
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Endpoint URL (Base URL)
                  </label>
                  <input
                    type="text"
                    value={detailBase}
                    onChange={(e) => setDetailBase(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full text-xs font-mono-code rounded-lg px-3 py-2 focus:outline-none"
                    style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    API Key
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={detailKey}
                      onChange={(e) => setDetailKey(e.target.value)}
                      placeholder={selected.api_key_ref ? '•••••••••••••••• (Đã lưu key)' : 'Nhập API key...'}
                      className="w-full text-xs font-mono-code rounded-lg py-2 pl-3 pr-9 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 p-1 opacity-50 hover:opacity-100 cursor-pointer"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {detailMsg && (
                  <div className="text-xs" style={{ color: detailMsg.includes('Đã lưu') ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {detailMsg}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSaveDetail}
                    className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shadow-xs transition-all"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                  >
                    Lưu cấu hình
                  </button>
                </div>
              </div>
            </div>

            {/* Model Management Card */}
            <div className="p-5 rounded-2xl border border-[var(--border)] space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Danh sách mô hình ({selected.models?.length ?? 0})
                  </h4>
                  <p className="text-xs opacity-60 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Bật hoặc tắt từng model để hiển thị trong thanh chọn model của chat
                  </p>
                </div>

                <div className="relative flex items-center w-56">
                  <Search size={12} className="absolute left-2.5 opacity-40 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Tìm model..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full text-xs rounded-lg py-1 pl-7 pr-2.5 focus:outline-none"
                    style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Add custom model input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Thêm mã mô hình (vd: gpt-4o, claude-3-5-sonnet)..."
                  value={newModelId[selected.id] || ''}
                  onChange={(e) => setNewModelId({ ...newModelId, [selected.id]: e.target.value })}
                  className="flex-1 text-xs font-mono-code rounded-lg px-3 py-1.5 focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => handleAddModel(selected.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  + Thêm model
                </button>
              </div>

              {/* Models List */}
              <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
                {(() => {
                  const q = modelSearch.trim().toLowerCase();
                  const models = (selected.models || []).filter(
                    (m) => !q || m.display_name.toLowerCase().includes(q) || m.model_id.toLowerCase().includes(q)
                  );

                  if (models.length === 0) {
                    return (
                      <div className="p-6 text-center text-xs opacity-50" style={{ color: 'var(--text-tertiary)' }}>
                        {modelSearch ? 'Không tìm thấy mô hình phù hợp' : 'Chưa có mô hình nào. Bấm Test Connection để tự động nhận diện.'}
                      </div>
                    );
                  }

                  return models.map((m) => {
                    const caps = parseCaps(m);
                    return (
                      <div
                        key={m.id}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-[var(--surface-hover)] transition-colors"
                        style={{ backgroundColor: 'var(--surface)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                              {m.display_name}
                            </span>
                            <span className="text-[10px] font-mono-code opacity-50" style={{ color: 'var(--text-tertiary)' }}>
                              {m.model_id}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {CAP_LABELS.map(([key, label]) => {
                              const active = Boolean(caps[key]);
                              return (
                                <span
                                  key={key}
                                  className={`text-[9px] font-mono-code px-1.5 py-0.2 rounded ${
                                    active ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'opacity-30'
                                  }`}
                                  style={{ border: '1px solid var(--border-subtle)' }}
                                >
                                  {label}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(m.enabled)}
                            onClick={() => handleToggleModel(selected.id, m)}
                            className={`w-8 h-5 rounded-full transition-colors flex items-center p-0.5 cursor-pointer ${
                              m.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                                m.enabled ? 'translate-x-3' : 'translate-x-0'
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteModel(selected.id, m)}
                            className="p-1 rounded opacity-40 hover:opacity-100 hover:text-red-500 transition-all cursor-pointer"
                            title="Xóa model"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => handleDelete(selected.id, selected.name)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer text-red-600 border border-red-200 dark:border-red-950/40 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
              >
                Xóa nhà cung cấp này
              </button>
            </div>
          </div>
        ) : (
          /* VIEW 2: LOBEHUB CARDS GRID (ALL PROVIDERS) */
          <div className="max-w-6xl space-y-8">
            {/* Header info */}
            <div>
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Nhà Cung Cấp Mô Hình AI
              </h2>
              <p className="text-xs opacity-70 mt-1" style={{ color: 'var(--text-secondary)' }}>
                Kết nối các nhà cung cấp AI đám mây hoặc chạy trực tiếp cục bộ bằng Ollama và máy chủ nội bộ.
              </p>
            </div>

            {/* SECTION 1: ĐÃ BẬT (ACTIVE PROVIDERS) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  Đã bật
                </span>
                <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                  {enabledProviders.length}
                </span>
              </div>

              {enabledProviders.length === 0 ? (
                <div
                  className="p-6 rounded-2xl border border-[var(--border)] text-center text-xs opacity-60"
                  style={{ backgroundColor: 'var(--surface-secondary)' }}
                >
                  Chưa có nhà cung cấp nào được bật. Hãy bật một provider bên dưới để bắt đầu trò chuyện.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {enabledProviders.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => openDetail(p)}
                      className="group relative p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-all cursor-pointer overflow-hidden shadow-xs hover:shadow-sm"
                      style={{ backgroundColor: 'var(--surface)' }}
                    >
                      {/* LobeHub Gradient Aura */}
                      <div className="absolute top-0 right-0 w-32 h-16 bg-gradient-to-l from-blue-500/10 via-purple-500/10 to-transparent pointer-events-none rounded-tr-2xl" />

                      <div className="flex items-start justify-between gap-3 relative z-10">
                        <div className="flex items-center gap-3 min-w-0">
                          <BrandLogo type={p.type} name={p.name} size={22} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {p.name}
                              </span>
                              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                            </div>
                            <span className="text-[10px] font-mono-code opacity-60" style={{ color: 'var(--text-secondary)' }}>
                              {(p.models || []).length} mô hình khả dụng
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={true}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleEnabled(p);
                          }}
                          className="w-9 h-5 rounded-full transition-colors flex items-center p-0.5 bg-emerald-500 cursor-pointer flex-shrink-0"
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform translate-x-4" />
                        </button>
                      </div>

                      <p className="text-[11.5px] leading-relaxed mt-2.5 line-clamp-2 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                        {providerDescription(p) || `${p.name} đang hoạt động với ${p.base_url || 'cấu hình mặc định'}.`}
                      </p>

                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-[11px]">
                        <span className="font-mono-code text-[10px] opacity-60" style={{ color: 'var(--text-tertiary)' }}>
                          {p.api_key_ref ? 'Key đã lưu' : 'Local / No key required'}
                        </span>
                        <span className="font-medium text-blue-500 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                          Cấu hình <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: ĐÃ TẮT & KHÁM PHÁ CATALOG (3-COLUMN GRID LIKE LOBEHUB) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  Khám phá & Đã tắt
                </span>
                <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 font-semibold">
                  {disabledProviders.length + unconfiguredCatalog.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* 1. Existing Disabled Providers in DB */}
                {disabledProviders.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => openDetail(p)}
                    className="group p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-all cursor-pointer shadow-xs hover:shadow-sm"
                    style={{ backgroundColor: 'var(--surface)', opacity: 0.85 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandLogo type={p.type} name={p.name} size={20} />
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {p.name}
                        </span>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={false}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleEnabled(p);
                        }}
                        className="w-9 h-5 rounded-full transition-colors flex items-center p-0.5 bg-zinc-300 dark:bg-zinc-700 cursor-pointer flex-shrink-0"
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform translate-x-0" />
                      </button>
                    </div>

                    <p className="text-[11.5px] leading-relaxed mt-2.5 line-clamp-2 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {providerDescription(p) || `Nhà cung cấp ${p.name} hiện đang tắt.`}
                    </p>

                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-[10px] opacity-60">
                      <span>{(p.models || []).length} models</span>
                      <span className="group-hover:text-[var(--text-primary)]">Bấm để cấu hình</span>
                    </div>
                  </div>
                ))}

                {/* 2. Well-Known Catalog Providers (Ready to connect) */}
                {unconfiguredCatalog.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => openCatalogItem(cat)}
                    className="group p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-all cursor-pointer shadow-xs hover:shadow-sm"
                    style={{ backgroundColor: 'var(--surface)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandLogo type={cat.type} name={cat.name} size={20} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              {cat.name}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded font-medium bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-tertiary)] flex-shrink-0">
                        {cat.badge}
                      </span>
                    </div>

                    <p className="text-[11.5px] leading-relaxed mt-2.5 line-clamp-2 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {cat.description}
                    </p>

                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-[11px]">
                      <span className="text-[10px] opacity-50" style={{ color: 'var(--text-tertiary)' }}>
                        Chưa cấu hình
                      </span>
                      <span className="text-blue-500 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                        Thiết lập <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ADD PROVIDER MODAL */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-auto">
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Thêm nhà cung cấp AI mới</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="p-1 rounded-lg opacity-60 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1 opacity-70">Loại nhà cung cấp</label>
                <select
                  value={pType}
                  onChange={(e) => setPType(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="openai-compatible">OpenAI Compatible (Tương thích OpenAI)</option>
                  <option value="ollama">Ollama (Local Engine)</option>
                  <option value="google">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI Official</option>
                  <option value="custom">Custom (Tùy chỉnh nâng cao)</option>
                </select>
              </div>

              {pType === 'custom' && (
                <>
                  <div>
                    <label className="block font-medium mb-1 opacity-70">ID định danh (slug)</label>
                    <input
                      value={pId}
                      onChange={(e) => setPId(e.target.value)}
                      placeholder="vd: my-local-ai"
                      className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1 opacity-70">Mô tả</label>
                    <input
                      value={pDesc}
                      onChange={(e) => setPDesc(e.target.value)}
                      placeholder="Mô tả về server hoặc model này"
                      className="w-full rounded-lg px-3 py-2 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1 opacity-70">Định dạng request</label>
                    <select
                      value={pFormat}
                      onChange={(e) => setPFormat(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    >
                      <option value="openai">OpenAI Compatible format</option>
                      <option value="anthropic">Anthropic format</option>
                      <option value="google">Google Gemini format</option>
                      <option value="ollama">Ollama format</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block font-medium mb-1 opacity-70">Tên hiển thị</label>
                <input
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Tên nhà cung cấp (vd: My Server)"
                  className="w-full rounded-lg px-3 py-2 focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block font-medium mb-1 opacity-70">Base URL</label>
                <input
                  value={pBase}
                  onChange={(e) => setPBase(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block font-medium mb-1 opacity-70">API Key (tùy chọn cho local)</label>
                <input
                  type="password"
                  value={pKey}
                  onChange={(e) => setPKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {formError && (
                <div className="p-2.5 rounded-lg text-xs" style={{ backgroundColor: 'var(--danger)', color: 'var(--danger-contrast)' }}>
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={detecting}
                  className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shadow-xs"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                >
                  {detecting ? 'Đang lưu...' : 'Thêm nhà cung cấp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
