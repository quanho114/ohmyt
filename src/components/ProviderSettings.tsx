import React, { useEffect, useRef, useState } from 'react';
import type { AIProvider, ModelDefinition } from '../types.ts';
import type { SettingsLocale } from '../appearance.ts';
import type { SettingsTextKey } from '../settingsLocale.ts';
import { normalizeSearch, settingsText } from '../settingsLocale.ts';
import { api } from '../api.ts';
import { BrandLogo, CAP_LABELS, CATALOG_PROVIDERS, parseCaps } from './providerCatalog.tsx';
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
  locale: SettingsLocale;
}

type ProviderNotice = { key?: SettingsTextKey; raw?: string; success?: boolean };
type ConnectionResult = { connected: boolean; latencyMs: number; modelsDiscovered: number; code?: string; message?: string; saved?: boolean; discoveryFailed?: boolean };

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({ providers, onRefresh, locale }) => {
  const t = (key: SettingsTextKey) => settingsText(locale, key);
  const addSectionRef = useRef<HTMLElement>(null);
  const addOpenerRef = useRef<HTMLElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
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
  const [testResult, setTestResult] = useState<Record<string, ConnectionResult>>({});
  const [newModelId, setNewModelId] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ProviderNotice | null>(null);
  const [actionError, setActionError] = useState('');
  const [detecting, setDetecting] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [detailBase, setDetailBase] = useState('');
  const [detailKey, setDetailKey] = useState('');
  const [detailMsg, setDetailMsg] = useState<ProviderNotice | null>(null);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (showAdd) {
      addSectionRef.current?.querySelector<HTMLSelectElement>('select')?.focus();
      addSectionRef.current?.scrollIntoView({ block: 'nearest' });
    } else if (addOpenerRef.current) {
      const opener = addOpenerRef.current.isConnected ? addOpenerRef.current : addButtonRef.current;
      opener?.focus();
      addOpenerRef.current = null;
    }
  }, [showAdd]);

  const selected = providers.find((p) => p.id === selectedId) || null;

  const openDetail = (p: AIProvider) => {
    setSelectedId(p.id);
    setDetailBase(p.base_url || '');
    setDetailKey('');
    setDetailMsg(null);
    setModelSearch('');
    setShowKey(false);
  };

  const openCatalogItem = (cat: typeof CATALOG_PROVIDERS[0]) => {
    const existing = providers.find((p) => p.id === cat.id || p.name.toLowerCase().includes(cat.id));
    if (existing) {
      openDetail(existing);
    } else {
      addOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPType(cat.type);
      setPName(cat.name);
      setPBase(cat.defaultBase);
      setPKey('');
      setPId(cat.id);
      setPDesc(t(cat.description));
      setPLogo('');
      setPFormat('openai');
      setFormError(null);
      setShowAdd(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const name = pName.trim();
    const baseURL = pBase.trim();
    const isCustom = pType === 'custom';
    const slug = pId.trim().toLowerCase();

    if (isCustom && !slug) {
      setFormError({ key: 'Vui lòng nhập ID nhà cung cấp (vd: my-provider).' });
      return;
    }
    if (!name) {
      setFormError({ key: 'Vui lòng nhập tên provider.' });
      return;
    }
    if (!baseURL) {
      setFormError({ key: 'Vui lòng nhập Base URL (vd: http://localhost:1234).' });
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
        const result = await api.testProvider(created.id);
        setTestResult(prev => ({ ...prev, [created.id]: { ...result, saved: true } }));
      } catch {
        setTestResult(prev => ({ ...prev, [created.id]: { connected: false, latencyMs: 0, modelsDiscovered: 0, saved: true, discoveryFailed: true } }));
      } finally {
        setDetecting(false);
      }
      onRefresh();
    } catch (err) {
      setFormError({ raw: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await api.testProvider(id);
      setTestResult(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResult(prev => ({ ...prev, [id]: { connected: false, latencyMs: 0, modelsDiscovered: 0, message: err instanceof Error ? err.message : String(err) } }));
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
    if (!confirm(`${t('Xóa mô hình này?')} ${m.display_name}`)) return;
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
    if (!confirm(`${t('Xóa nhà cung cấp này?')} ${name}`)) return;
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
    setDetailMsg(null);
    try {
      const patch: { baseURL?: string; apiKey?: string } = {};
      if (detailBase.trim() && detailBase.trim() !== (selected.base_url || '')) patch.baseURL = detailBase.trim();
      if (detailKey.trim()) patch.apiKey = detailKey.trim();
      if (Object.keys(patch).length === 0) {
        setDetailMsg({ key: 'Chưa có gì thay đổi.' });
        return;
      }
      await api.updateProvider(selected.id, patch);
      setDetailKey('');
      setDetailMsg({ key: 'Đã lưu.', success: true });
      onRefresh();
    } catch (err) {
      setDetailMsg({ raw: err instanceof Error ? err.message : String(err) });
    }
  };

  const enabledProviders = providers.filter((p) => p.enabled);
  const disabledProviders = providers.filter((p) => !p.enabled);

  // Filter providers for sidebar
  const qSide = normalizeSearch(sidebarSearch);
  const filteredEnabled = enabledProviders.filter(p => normalizeSearch(p.name).includes(qSide));
  const filteredDisabled = disabledProviders.filter(p => normalizeSearch(p.name).includes(qSide));

  // Catalog items that are not yet added in providers
  const unconfiguredCatalog = CATALOG_PROVIDERS.filter(
    (cat) => !providers.some((p) => p.id === cat.id || p.name.toLowerCase().includes(cat.id))
  );
  const selectedTest = selected ? testResult[selected.id] : undefined;

  return (
    <div className={`provider-settings flex-1 flex flex-row h-full min-h-0 overflow-hidden select-none ${!selected ? 'provider-overview-layout' : ''}`}>
      {/* Provider navigation and add action */}
      <aside
        className="provider-sidebar w-60 flex-shrink-0 flex flex-col h-full border-r border-[var(--border)]"
        style={{ backgroundColor: 'var(--sidebar)' }}
      >
        {/* Search & Add Bar */}
        <div className="p-3 space-y-2 border-b border-[var(--border)]">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 opacity-40 pointer-events-none" />
            <input
              type="text"
              placeholder={t('Tìm kiếm nhà cung cấp...')}
              aria-label={t('Tìm kiếm nhà cung cấp...')}
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
            ref={addButtonRef}
            type="button"
            onClick={() => {
              addOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setPType('openai-compatible');
              setPName('');
              setPBase('');
              setPKey('');
              setPId('');
              setPDesc('');
              setPLogo('');
              setPFormat('openai');
              setFormError(null);
              setShowAdd(true);
            }}
            aria-label={t('Thêm nhà cung cấp')}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-xs"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)'
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>{t('Thêm nhà cung cấp')}</span>
          </button>
        </div>

        {/* Providers Tree / List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Tất cả (All view) */}
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            aria-pressed={selectedId === null}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              selectedId === null ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
            }`}
            style={{ color: 'var(--text-primary)' }}
          >
            <div className="flex items-center gap-2">
              <Layers size={14} className="opacity-60" />
              <span>{t('Tất cả nhà cung cấp')}</span>
            </div>
            <span className="text-[10px] font-mono-code opacity-60 px-1.5 py-0.2 rounded bg-[var(--surface)]">
              {providers.length}
            </span>
          </button>

          {/* Đã bật Group */}
          {filteredEnabled.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50 flex items-center justify-between">
                <span>{t('Đã bật')}</span>
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
                      aria-pressed={isSel}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isSel ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BrandLogo id={p.id} type={p.type} name={p.name} size={16} />
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
                <span>{t('Đã tắt')}</span>
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
                      aria-pressed={isSel}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer opacity-70 hover:opacity-100 ${
                        isSel ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BrandLogo id={p.id} type={p.type} name={p.name} size={16} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {qSide && !filteredEnabled.length && !filteredDisabled.length && <p className="p-3 text-xs" role="status" style={{ color: 'var(--text-secondary)' }}>{t('Không tìm thấy nhà cung cấp phù hợp.')}</p>}
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <div className="provider-main flex-1 min-w-0 h-full overflow-y-auto p-6 lg:p-8" style={{ backgroundColor: 'var(--surface)' }}>
        {actionError && (
          <div role="alert" className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2" style={{ backgroundColor: 'var(--danger)', color: 'var(--danger-contrast)' }}>
            <AlertCircle size={15} />
            <span>{actionError}</span>
          </div>
        )}

        {detecting && (
          <div role="status" className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2 bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Loader2 size={15} className="animate-spin" />
            <span>{t('Đang tự động phát hiện models từ endpoint...')}</span>
          </div>
        )}

      {showAdd && (
        <section ref={addSectionRef} aria-labelledby="provider-add-title" className="provider-add w-full max-w-lg rounded-2xl border border-[var(--border)] p-6 space-y-4 select-auto" onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('select')) { event.preventDefault(); event.stopPropagation(); setShowAdd(false); } }}
            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
          >
            <div className="flex items-center justify-between">
              <h3 id="provider-add-title" className="text-base font-semibold">{t('Thêm nhà cung cấp AI mới')}</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                aria-label={t('Đóng')}
                className="p-1 rounded-lg opacity-60 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label htmlFor="provider-add-type" className="block font-medium mb-1 opacity-70">{t('Loại nhà cung cấp')}</label>
                <select
                  id="provider-add-type"
                  value={pType}
                  onChange={(e) => setPType(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="openai-compatible">{t('Tương thích OpenAI')}</option>
                  <option value="ollama">{t('Ollama (máy cục bộ)')}</option>
                  <option value="google">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">{t('OpenAI chính thức')}</option>
                  <option value="custom">{t('Tùy chỉnh nâng cao')}</option>
                </select>
              </div>

              {pType === 'custom' && (
                <>
                  <div>
                    <label htmlFor="provider-add-id" className="block font-medium mb-1 opacity-70">{t('ID định danh (slug)')}</label>
                    <input
                      id="provider-add-id"
                      value={pId}
                      onChange={(e) => setPId(e.target.value)}
                      placeholder={t('vd: my-local-ai')}
                      className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="provider-add-description" className="block font-medium mb-1 opacity-70">{t('Mô tả')}</label>
                    <input
                      id="provider-add-description"
                      value={pDesc}
                      onChange={(e) => setPDesc(e.target.value)}
                      placeholder={t('Mô tả về server hoặc model này')}
                      className="w-full rounded-lg px-3 py-2 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="provider-add-format" className="block font-medium mb-1 opacity-70">{t('Định dạng request')}</label>
                    <select
                      id="provider-add-format"
                      value={pFormat}
                      onChange={(e) => setPFormat(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    >
                      <option value="openai">{t('Định dạng OpenAI')}</option>
                      <option value="anthropic">{t('Định dạng Anthropic')}</option>
                      <option value="google">{t('Định dạng Google Gemini')}</option>
                      <option value="ollama">{t('Định dạng Ollama')}</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="provider-add-name" className="block font-medium mb-1 opacity-70">{t('Tên hiển thị')}</label>
                <input
                  id="provider-add-name"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder={t('Tên nhà cung cấp (vd: My Server)')}
                  className="w-full rounded-lg px-3 py-2 focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label htmlFor="provider-add-base" className="block font-medium mb-1 opacity-70">Base URL</label>
                <input
                  id="provider-add-base"
                  value={pBase}
                  onChange={(e) => setPBase(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label htmlFor="provider-add-key" className="block font-medium mb-1 opacity-70">{t('API Key (tùy chọn cho local)')}</label>
                <input
                  id="provider-add-key"
                  type="password"
                  value={pKey}
                  onChange={(e) => setPKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {formError && (
                <div role="alert" className="p-2.5 rounded-lg text-xs" style={{ backgroundColor: 'var(--danger)', color: 'var(--danger-contrast)' }}>
                  {formError.key ? t(formError.key) : formError.raw}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                >
                  {t('Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={detecting}
                  className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shadow-xs"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                >
                  {t(detecting ? 'Đang lưu...' : 'Thêm nhà cung cấp')}
                </button>
              </div>
            </form>
        </section>
      )}
        {/* VIEW 1: DETAIL VIEW OF SINGLE PROVIDER */}
        {!showAdd && (selected ? (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex items-center gap-1.5 text-xs font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ArrowLeft size={14} />
                <span>{t('Tất cả nhà cung cấp')}</span>
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: selected.enabled ? 'var(--success)' : 'var(--text-tertiary)' }}>
                  {t(selected.enabled ? 'Đã bật' : 'Đã tắt')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(selected.enabled)}
                  aria-label={`${t('Đã bật')}: ${selected.name}`}
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
                <BrandLogo id={selected.id} type={selected.type} name={selected.name} size={28} />
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selected.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {selected.type}
                    </span>
                    <span className="text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {(selected.models || []).length} {t('mô hình khả dụng')}
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
                <span>{t('Kiểm tra kết nối')}</span>
              </button>
            </div>

            {selectedTest && (
              <div role="status" className={`p-3 rounded-xl text-xs font-mono-code flex items-center gap-2 ${selectedTest.connected ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                {selectedTest.connected ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{selectedTest.discoveryFailed ? t('Đã lưu, nhưng chưa phát hiện được mô hình. Hãy kiểm tra kết nối để thử lại.') : selectedTest.connected ? `${t('Đã kết nối')} • ${selectedTest.latencyMs} ms • ${selectedTest.modelsDiscovered} ${t('mô hình')}` : `${t(selectedTest.saved ? 'Đã lưu, nhưng kết nối thất bại' : 'Kết nối thất bại')}: ${selectedTest.code || ''} ${selectedTest.message || ''}`}</span>
              </div>
            )}

            {/* Connection Credentials Card */}
            <div className="p-5 rounded-2xl border border-[var(--border)] space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60" style={{ color: 'var(--text-tertiary)' }}>
                {t('Cấu hình kết nối API')}
              </h4>

              <div className="space-y-3">
                <div>
                  <label htmlFor="provider-detail-base" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Endpoint URL (Base URL)
                  </label>
                  <input
                    id="provider-detail-base"
                    type="text"
                    value={detailBase}
                    onChange={(e) => setDetailBase(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full text-xs font-mono-code rounded-lg px-3 py-2 focus:outline-none"
                    style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label htmlFor="provider-detail-key" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    API Key
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="provider-detail-key"
                      type={showKey ? 'text' : 'password'}
                      value={detailKey}
                      onChange={(e) => setDetailKey(e.target.value)}
                      placeholder={t(selected.api_key_ref ? '•••••••••••••••• (Đã lưu key)' : 'Nhập API key...')}
                      className="w-full text-xs font-mono-code rounded-lg py-2 pl-3 pr-9 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      aria-label={t(showKey ? 'Ẩn API key' : 'Hiện API key')}
                      className="absolute right-2.5 p-1 opacity-50 hover:opacity-100 cursor-pointer"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {detailMsg && (
                  <div role={detailMsg.raw ? 'alert' : 'status'} className="text-xs" style={{ color: detailMsg.success ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {detailMsg.key ? t(detailMsg.key) : detailMsg.raw}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSaveDetail}
                    className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shadow-xs transition-all"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                  >
                    {t('Lưu cấu hình')}
                  </button>
                </div>
              </div>
            </div>

            {/* Model Management Card */}
            <div className="p-5 rounded-2xl border border-[var(--border)] space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
              <div className="provider-model-heading flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('Danh sách mô hình')} ({selected.models?.length ?? 0})
                  </h4>
                  <p className="text-xs opacity-60 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {t('Bật hoặc tắt từng model để hiển thị trong thanh chọn model của chat')}
                  </p>
                </div>

                <div className="relative flex items-center w-56">
                  <Search size={12} className="absolute left-2.5 opacity-40 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={t('Tìm model...')}
                    aria-label={t('Tìm model...')}
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
                  placeholder={t('Thêm mã mô hình (vd: gpt-4o, claude-3-5-sonnet)...')}
                  aria-label={t('Thêm model')}
                  value={newModelId[selected.id] || ''}
                  onChange={(e) => setNewModelId({ ...newModelId, [selected.id]: e.target.value })}
                  className="min-w-0 flex-1 text-xs font-mono-code rounded-lg px-3 py-1.5 focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => handleAddModel(selected.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  + {t('Thêm model')}
                </button>
              </div>

              {/* Models List */}
              <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
                {(() => {
                  const q = normalizeSearch(modelSearch);
                  const models = (selected.models || []).filter(m => normalizeSearch(`${m.display_name} ${m.model_id}`).includes(q));

                  if (models.length === 0) {
                    return (
                      <div className="p-6 text-center text-xs opacity-50" style={{ color: 'var(--text-tertiary)' }}>
                        {t(modelSearch ? 'Không tìm thấy mô hình phù hợp' : 'Chưa có mô hình nào. Bấm kiểm tra kết nối để tự động nhận diện.')}
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
                                  {label === 'JSON' ? label : t(label)}
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
                            aria-label={`${t('Đã bật')}: ${m.display_name}`}
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
                            title={t('Xóa model')}
                            aria-label={`${t('Xóa model')}: ${m.display_name}`}
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
                {t('Xóa nhà cung cấp này')}
              </button>
            </div>
          </div>
        ) : (
          <div className="provider-overview">
            <header className="provider-overview-heading">
              <h2>Nhà cung cấp AI</h2>
              <p>Quản lý kết nối và chọn mô hình cho cuộc trò chuyện của bạn.</p>
            </header>
            <section aria-labelledby="provider-connected-title" className="provider-overview-section">
              <h3 id="provider-connected-title">Đã thêm <span>{filteredEnabled.length + filteredDisabled.length}</span></h3>
              {!filteredEnabled.length && !filteredDisabled.length && <p className="provider-overview-empty" role="status">
                {qSide ? 'Không tìm thấy nhà cung cấp phù hợp.' : 'Bạn chưa thêm nhà cung cấp nào. Chọn bên dưới để bắt đầu.'}
              </p>}
              {[...filteredEnabled, ...filteredDisabled].map(p => (
                <div key={p.id} className="provider-connection-row">
                  <button type="button" className="provider-row-link" onClick={() => openDetail(p)} aria-label={`${t('Cấu hình')}: ${p.name}`}>
                    <BrandLogo id={p.id} type={p.type} name={p.name} size={24} />
                    <span className="provider-row-copy"><strong>{p.name}</strong><span>{(p.models || []).length} {t('mô hình')}<span aria-hidden="true"> · </span>{p.enabled ? 'Đã bật' : 'Đã tắt'}</span></span>
                  </button>
                  <div className="provider-row-actions">
                    <button type="button" className="provider-row-configure" onClick={() => openDetail(p)}>{t('Cấu hình')}<ChevronRight size={14} /></button>
                    <button type="button" role="switch" aria-checked={Boolean(p.enabled)} aria-label={`${t('Đã bật')}: ${p.name}`} className="provider-overview-switch" onClick={() => handleToggleEnabled(p)}><span /></button>
                  </div>
                </div>
              ))}
            </section>
            <section aria-labelledby="provider-discover-title" className="provider-overview-section">
              <h3 id="provider-discover-title">Thêm kết nối</h3>
              <p className="provider-section-description">Chọn dịch vụ bạn có tài khoản hoặc kết nối mô hình chạy trên máy.</p>
              <div className="provider-catalog-list">
                {unconfiguredCatalog.filter(cat => normalizeSearch(`${cat.name} ${cat.badge} ${cat.type}`).includes(qSide)).map(cat => (
                  <button key={cat.id} type="button" className="provider-catalog-row" onClick={() => openCatalogItem(cat)} aria-label={`${t('Thiết lập')}: ${cat.name}`}>
                    <BrandLogo id={cat.id} type={cat.type} name={cat.name} size={22} />
                    <span className="provider-row-copy"><strong>{cat.name}</strong><span>{cat.badge === 'Máy cục bộ' || cat.badge === 'Tự lưu trữ' ? t(cat.badge) : cat.badge}</span></span>
                    <Plus size={16} className="provider-catalog-add" />
                  </button>
                ))}
              </div>
              {qSide && !unconfiguredCatalog.some(cat => normalizeSearch(`${cat.name} ${cat.badge} ${cat.type}`).includes(qSide)) && <p className="provider-overview-empty" role="status">Không tìm thấy kết nối mới phù hợp.</p>}
            </section>
          </div>
        ))}
      </div>
    </div>
  );
};
