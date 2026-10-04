import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AIProvider, ModelDefinition } from '../types.ts';
import {
  Check, ChevronDown, Cloud, Database, Eye, Globe, Search,
  Sparkles, Wrench, X
} from 'lucide-react';
import { ModelIcon } from './ModelIcon.tsx';
import anthropicMark from '../assets/provider-icons/anthropic-mark.png';
import geminiMark from '../assets/provider-icons/gemini-sparkle.png';
import moonshotMark from '../assets/provider-icons/moonshot-mark.png';

interface ModelPickerProps {
  providers: AIProvider[];
  value: { providerId: string; modelId: string } | null;
  onChange: (v: { providerId: string; modelId: string }) => void;
  onOpenProviders?: () => void;
  minimal?: boolean;
}

export interface ModelOption {
  provider: AIProvider;
  model: ModelDefinition;
  key: string;
}

export function listModelOptions(providers: AIProvider[]): ModelOption[] {
  return providers
    .filter(provider => Boolean(provider.enabled))
    .flatMap(provider => (provider.models || [])
      .filter(model => Boolean(model.enabled))
      .map(model => ({ provider, model, key: `${provider.id}::${model.model_id}` })));
}

export function findModelOption(providers: AIProvider[], value: { providerId: string; modelId: string } | null): ModelOption | null {
  if (!value) return null;
  const options = listModelOptions(providers);
  return options.find(option => option.provider.id === value.providerId && option.model.model_id === value.modelId) || null;
}

export { providerMark, parseCapabilities, formatTokens, shortModelName };

function providerMark(provider: AIProvider, model?: ModelDefinition): { image?: string; symbol: string; tone: string } {
  const identity = `${provider.name} ${provider.id} ${model?.display_name || ''} ${model?.model_id || ''}`.toLowerCase();
  if (identity.includes('gemini')) return { image: geminiMark, symbol: 'G', tone: '#4285f4' };
  if (identity.includes('claude') || identity.includes('anthropic')) return { image: anthropicMark, symbol: 'A', tone: '#d97757' };
  if (identity.includes('moonshot') || identity.includes('kimi')) return { image: moonshotMark, symbol: 'K', tone: '#27272a' };
  switch (provider.type) {
    case 'anthropic': return { image: anthropicMark, symbol: 'A', tone: '#d97757' };
    case 'google': return { image: geminiMark, symbol: 'G', tone: '#4285f4' };
    case 'ollama': return { symbol: 'O', tone: '#18181b' };
    case 'openai': return { symbol: '◎', tone: '#161616' };
    case 'openai-compatible':
    case 'custom': return { symbol: 'API', tone: '#64748b' };
    default: return { symbol: provider.name.slice(0, 1).toUpperCase(), tone: '#71717a' };
  }
}

function parseCapabilities(model: ModelDefinition): Record<string, boolean> {
  try {
    const parsed = JSON.parse(model.capabilities_json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function formatTokens(value?: number | null): string {
  if (!value || value <= 0) return 'Chưa có dữ liệu';
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}M tokens`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}K tokens`;
  return `${value.toLocaleString('vi-VN')} tokens`;
}

function shortModelName(model: ModelDefinition): string {
  const label = model.display_name || model.model_id;
  return label.includes('/') ? label.split('/').filter(Boolean).at(-1) || label : label;
}

const capabilityRows = [
  { key: 'vision', label: 'Thị giác', detail: 'Nhận diện hình ảnh', icon: Eye },
  { key: 'tools', label: 'Gọi công cụ', detail: 'Sử dụng công cụ của agent', icon: Wrench },
  { key: 'reasoning', label: 'Lý luận', detail: 'Suy luận nhiều bước', icon: Sparkles },
  { key: 'embeddings', label: 'Embedding', detail: 'Biểu diễn văn bản thành vector', icon: Database },
  { key: 'streaming', label: 'Phản hồi trực tiếp', detail: 'Hiển thị câu trả lời theo luồng', icon: Cloud }
] as const;

export const ModelPicker: React.FC<ModelPickerProps> = ({ providers, value, onChange, onOpenProviders, minimal = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const options = useMemo<ModelOption[]>(() => listModelOptions(providers), [providers]);
  const selected = options.find(option => option.provider.id === value?.providerId && option.model.model_id === value?.modelId) || null;
  const mark = selected ? providerMark(selected.provider, selected.model) : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (option: ModelOption) => {
    onChange({ providerId: option.provider.id, modelId: option.model.model_id });
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div ref={rootRef} className={`model-picker-wrapper relative inline-flex items-center${open ? ' is-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`model-picker flex items-center gap-2 rounded-lg text-xs font-medium select-none${minimal ? ' is-minimal' : ''}`}
        aria-label={`Mô hình: ${selected ? shortModelName(selected.model) : 'Chọn mô hình'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        title={selected ? `${selected.provider.name} · ${selected.model.display_name}` : 'Chọn mô hình'}
      >
        {selected && (
          <span className="model-provider-mark" aria-hidden="true" style={{ background: 'transparent' }}>
            <ModelIcon provider={selected.provider} model={selected.model} size={15} />
          </span>
        )}
        <span className="model-picker-label truncate">{selected ? shortModelName(selected.model) : (options.length ? 'Chọn mô hình' : 'Chưa cấu hình model')}</span>
        {!minimal && selected && <span className="model-picker-provider truncate">{selected.provider.name}</span>}
        <ChevronDown size={14} className={`model-picker-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="model-picker-popover" role="dialog" aria-label="Chọn mô hình AI">
          <ModelBrowser
            providers={providers}
            value={value}
            autoFocusSearch
            onPick={choose}
            onOpenProviders={() => { setOpen(false); onOpenProviders?.(); }}
          />
        </div>
      )}
    </div>
  );
};

interface ModelBrowserProps {
  providers: AIProvider[];
  value: { providerId: string; modelId: string } | null;
  autoFocusSearch?: boolean;
  onPick: (option: ModelOption) => void;
  onOpenProviders?: () => void;
}

// Khung duyệt model 2 panel (list + chi tiết), dùng chung cho ModelPicker và popup composer.
export const ModelBrowser: React.FC<ModelBrowserProps> = ({ providers, value, autoFocusSearch = false, onPick, onOpenProviders }) => {
  const [query, setQuery] = useState('');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const options = useMemo<ModelOption[]>(() => listModelOptions(providers), [providers]);
  const selected = options.find(option => option.provider.id === value?.providerId && option.model.model_id === value?.modelId) || null;
  const filtered = options.filter(option => `${option.model.display_name} ${option.model.model_id} ${option.provider.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const preview = filtered.find(option => option.key === previewKey) || selected || filtered[0] || null;

  useEffect(() => {
    if (autoFocusSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [autoFocusSearch]);

  return (
    <>
      <div className="model-picker-browser">
        <label className="model-picker-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setPreviewKey(null);
            }}
            placeholder="Tìm kiếm mô hình..."
            aria-label="Tìm kiếm mô hình"
          />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Xóa nội dung tìm kiếm"><X size={14} /></button>}
        </label>

        <div className="model-picker-list" role="listbox" aria-label="Các mô hình khả dụng">
          {filtered.length === 0 ? (
            <div className="model-picker-empty">
              <span>{options.length ? 'Không tìm thấy mô hình phù hợp.' : 'Chưa có model nào được bật.'}</span>
              {!options.length && onOpenProviders && (
                <button type="button" onClick={onOpenProviders}>Mở cài đặt nhà cung cấp</button>
              )}
            </div>
          ) : filtered.map(option => {
            const providerMarkData = providerMark(option.provider, option.model);
            const active = option.key === selected?.key;
            const isPreview = option.key === preview?.key;
            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={active}
                className={`model-picker-option${isPreview ? ' is-preview' : ''}${active ? ' is-selected' : ''}`}
                onMouseEnter={() => setPreviewKey(option.key)}
                onFocus={() => setPreviewKey(option.key)}
                onClick={() => onPick(option)}
              >
                <span className="model-provider-mark" aria-hidden="true" style={{ background: 'transparent' }}>
                  <ModelIcon provider={option.provider} model={option.model} size={20} />
                </span>
                <span className="model-option-copy">
                  <span className="model-option-name">{shortModelName(option.model)}</span>
                  <span className="model-option-provider">{option.provider.name}</span>
                </span>
                {Boolean(parseCapabilities(option.model).vision) && <Eye size={14} className="model-option-capability" aria-label="Hỗ trợ hình ảnh" />}
                {active && <Check size={16} className="model-option-check" aria-label="Đang chọn" />}
              </button>
            );
          })}
        </div>
        <div className="model-picker-footer">
          <span>{filtered.length} mô hình khả dụng</span>
          {onOpenProviders && <button type="button" onClick={onOpenProviders}>Quản lý nhà cung cấp</button>}
        </div>
      </div>

      <aside className="model-picker-details" aria-live="polite">
        {preview ? (() => {
          const capabilities = parseCapabilities(preview.model);
          const detailMark = providerMark(preview.provider, preview.model);
          return (
            <>
              <div className="model-detail-heading">
                <span className="model-provider-mark model-provider-mark-large" aria-hidden="true" style={{ background: 'transparent' }}>
                  <ModelIcon provider={preview.provider} model={preview.model} size={34} />
                </span>
                <span className="min-w-0">
                  <strong>{shortModelName(preview.model)}</strong>
                  <small>{preview.provider.name} · {preview.model.model_id}</small>
                </span>
              </div>
              <div className="model-detail-section">
                <h3>Giới hạn ngữ cảnh</h3>
                <span>{formatTokens(preview.model.context_window)}</span>
              </div>
              <div className="model-detail-section">
                <h3>Đầu ra tối đa</h3>
                <span>{formatTokens(preview.model.max_output_tokens)}</span>
              </div>
              <div className="model-detail-section model-detail-capabilities">
                <h3>Khả năng</h3>
                {capabilityRows.filter(row => Boolean(capabilities[row.key])).map(({ key, label, detail, icon: Icon }) => (
                  <div key={key} className="model-capability-row">
                    <Icon size={15} aria-hidden="true" />
                    <span>{label}</span>
                    <small>{detail}</small>
                  </div>
                ))}
                {!capabilityRows.some(row => Boolean(capabilities[row.key])) && (
                  <p>Nhà cung cấp chưa khai báo khả năng của model này.</p>
                )}
              </div>
            </>
          );
        })() : (
          <div className="model-detail-empty">
            <Globe size={22} aria-hidden="true" />
            <span>Chọn một model để xem thông tin đã cấu hình.</span>
          </div>
        )}
      </aside>
    </>
  );
};
