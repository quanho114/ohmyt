import React from 'react';
import { createPortal } from 'react-dom';
import type { AIProvider } from '../types.ts';
import { ComposerPresets } from './ComposerPresets.tsx';
import { ModelBrowser, findModelOption, shortModelName } from './ModelPicker.tsx';
import { ModelIcon } from './ModelIcon.tsx';
import type { ComposerSuggestion } from './Composer.tsx';
import {
  Plus,
  Settings2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  ImageIcon,
  Target,
  FileText,
  Globe,
  Telescope
} from 'lucide-react';

export const EFFORT_OPTIONS = ['Tắt', 'Thấp', 'Trung bình', 'Cao', 'Cực cao', 'Tối đa'] as const;
export const EFFORT_STORAGE_KEY = 'ohmyt_effort';

export function loadEffort(): string {
  try {
    const saved = window.localStorage.getItem(EFFORT_STORAGE_KEY);
    if (saved && (EFFORT_OPTIONS as readonly string[]).includes(saved)) return saved;
  } catch {}
  return 'Trung bình';
}

interface ComposerAttachmentMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  disabled: boolean;
  isStreaming: boolean;
  sending: boolean;
  isHome: boolean;
  locale: 'vi' | 'en';
  sessionId?: string | null;
  suggestions: ComposerSuggestion[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenGoal: () => void;
  onPrependPrompt: (prompt: string) => void;
  onApplySuggestion: (suggestion: ComposerSuggestion) => void;
}

export const ComposerAttachmentMenu: React.FC<ComposerAttachmentMenuProps> = ({
  menuRef,
  fileInputRef,
  menuOpen,
  setMenuOpen,
  disabled,
  isStreaming,
  sending,
  isHome,
  locale,
  sessionId,
  suggestions,
  onFileSelect,
  onOpenGoal,
  onPrependPrompt,
  onApplySuggestion
}) => {
  const quickPrompts = [
    {
      icon: Globe,
      label: locale === 'en' ? 'Web Search' : 'Tìm kiếm web',
      prompt:
        locale === 'en'
          ? 'Search the web for the following topic, check reliable sources and cite links: '
          : 'Tìm kiếm trên web về chủ đề sau, kiểm tra nguồn đáng tin cậy và dẫn liên kết: '
    },
    {
      icon: Telescope,
      label: locale === 'en' ? 'Deep Research' : 'Nghiên cứu sâu',
      prompt:
        locale === 'en'
          ? 'Research the following topic in depth. Search multiple sources, compare evidence, identify uncertainty and cite links. Topic: '
          : 'Nghiên cứu sâu chủ đề sau. Tìm nhiều nguồn, đối chiếu bằng chứng, nêu điểm chưa chắc chắn và dẫn liên kết. Chủ đề: '
    }
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        disabled={disabled}
        aria-label="Tác vụ và đính kèm"
        aria-expanded={menuOpen}
        title="Tác vụ và đính kèm"
        className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Plus size={16} />
      </button>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        style={{ display: 'none' }}
        onChange={onFileSelect}
      />
      {menuOpen && (
        <div
          role="menu"
          className={`absolute ${isHome ? 'top-full mt-2' : 'bottom-full mb-2'} left-0 w-72 max-w-[80vw] rounded-xl p-1.5 z-40`}
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-composer)'
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              fileInputRef.current?.click();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left cursor-pointer hover:bg-[var(--surface-hover)]"
          >
            <span
              className="p-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
            >
              <ImageIcon size={15} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                Đính kèm ảnh
              </span>
              <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                PNG, JPG, WebP (hoặc Ctrl+V để dán)
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isStreaming || sending}
            className="composer-context-item"
            onClick={() => {
              setMenuOpen(false);
              window.dispatchEvent(new CustomEvent('ohmyt-document-pick', { detail: { scope: sessionId || 'home' } }));
            }}
          >
            <FileText size={15} />
            <span>{locale === 'en' ? 'Add document' : 'Thêm tài liệu'}</span>
          </button>
          {quickPrompts.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className="composer-context-item"
              onClick={() => onPrependPrompt(prompt)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
          {sessionId && (
            <button
              type="button"
              role="menuitem"
              aria-label="Goal"
              onClick={onOpenGoal}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left cursor-pointer hover:bg-[var(--surface-hover)]"
            >
              <span
                className="p-1.5 rounded-lg flex-shrink-0"
                style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
              >
                <Target size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Goal <span className="opacity-60">/goal</span>
                </span>
                <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {locale === 'en' ? 'Set a goal for this request' : 'Đặt mục tiêu cho yêu cầu này'}
                </span>
              </span>
            </button>
          )}
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              onClick={() => onApplySuggestion(s)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left cursor-pointer hover:bg-[var(--surface-hover)]"
            >
              {s.icon && (
                <span
                  className="p-1.5 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
                >
                  {s.icon}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {s.label}
                </span>
                <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {s.description || s.prompt}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface ComposerModelConfigProps {
  configRef: React.RefObject<HTMLDivElement | null>;
  providers: AIProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (v: { providerId: string; modelId: string }) => void;
  onOpenProviders?: () => void;
  configOpen: boolean;
  setConfigOpen: React.Dispatch<React.SetStateAction<boolean>>;
  configView: 'menu' | 'models';
  setConfigView: React.Dispatch<React.SetStateAction<'menu' | 'models'>>;
  effortOpen: boolean;
  setEffortOpen: React.Dispatch<React.SetStateAction<boolean>>;
  effort: string;
  onChangeEffort: (value: string) => void;
  compact: boolean;
  disabled: boolean;
  sending: boolean;
  isStreaming: boolean;
  isHome: boolean;
  locale: 'vi' | 'en';
  sessionId?: string | null;
}

export const ComposerModelConfig: React.FC<ComposerModelConfigProps> = ({
  configRef,
  providers,
  selectedModel,
  onSelectModel,
  onOpenProviders,
  configOpen,
  setConfigOpen,
  configView,
  setConfigView,
  effortOpen,
  setEffortOpen,
  effort,
  onChangeEffort,
  compact,
  disabled,
  sending,
  isStreaming,
  isHome,
  locale,
  sessionId
}) => {
  const selectedOption = findModelOption(providers, selectedModel);

  return (
    <div className="relative" ref={configRef}>
      <button
        type="button"
        onClick={() => {
          setConfigOpen((open) => !open);
          setConfigView('menu');
          setEffortOpen(false);
        }}
        disabled={disabled || sending}
        aria-label={
          selectedOption ? `Mô hình: ${shortModelName(selectedOption.model)}, nỗ lực ${effort}` : 'Chọn mô hình'
        }
        aria-expanded={configOpen}
        title={selectedOption ? `${shortModelName(selectedOption.model)} · ${effort}` : 'Cấu hình mô hình'}
        className="composer-model-pill"
      >
        {!selectedOption && compact && <Settings2 size={16} />}
        {selectedOption && (
          <span className="model-provider-mark" aria-hidden="true" style={{ background: 'transparent' }}>
            <ModelIcon provider={selectedOption.provider} model={selectedOption.model} size={15} />
          </span>
        )}
        <span className="composer-model-pill-name truncate">
          {selectedOption ? shortModelName(selectedOption.model) : 'Chọn mô hình'}
        </span>
        <span className="composer-model-pill-effort">{effort}</span>
        <ChevronDown
          size={14}
          className={`composer-model-pill-chevron${configOpen ? ' is-open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {configOpen && configView === 'menu' && (
        <div className={`composer-config-pop${isHome ? ' is-down' : ''}`} role="dialog" aria-label="Cấu hình mô hình">
          <ComposerPresets en={locale === 'en'} disabled={disabled || isStreaming} sessionId={sessionId} />
          <button type="button" className="composer-config-row" onClick={() => setConfigView('models')}>
            <span className="composer-config-label">Mô hình</span>
            <span className="composer-config-value">
              {selectedOption && (
                <span className="model-provider-mark" aria-hidden="true" style={{ background: 'transparent' }}>
                  <ModelIcon provider={selectedOption.provider} model={selectedOption.model} size={16} />
                </span>
              )}
              <span className="truncate">{selectedOption ? shortModelName(selectedOption.model) : 'Chọn mô hình'}</span>
            </span>
            <ChevronRight size={14} className="composer-config-arrow" aria-hidden="true" />
          </button>
          <div
            className="composer-config-row lobe-actions-has-sub submenu-left"
            role="menuitem"
            tabIndex={0}
            onMouseEnter={() => setEffortOpen(true)}
            onMouseLeave={() => setEffortOpen(false)}
            onClick={() => setEffortOpen((open) => !open)}
          >
            <span className="composer-config-label">Nỗ lực Lý luận</span>
            <span className="composer-config-value">
              <span>{effort}</span>
            </span>
            <ChevronRight size={14} className="composer-config-arrow" aria-hidden="true" />
            {effortOpen && (
              <div role="menu" aria-label="Nỗ lực lý luận" className="lobe-actions-submenu">
                <div className="lobe-actions-submenu-list">
                  {EFFORT_OPTIONS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="menuitemradio"
                      aria-checked={effort === level}
                      className="lobe-actions-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeEffort(level);
                      }}
                    >
                      <span className="lobe-actions-label">{level}</span>
                      {effort === level && <Check size={14} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {configOpen &&
        configView === 'models' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="composer-model-modal-overlay"
            onClick={() => {
              setConfigOpen(false);
              setConfigView('menu');
            }}
          >
            <div
              className="composer-model-modal"
              role="dialog"
              aria-label="Chọn mô hình AI"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="composer-config-browser-head">
                <button
                  type="button"
                  aria-label="Quay lại"
                  onClick={() => setConfigView('menu')}
                  className="p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="font-semibold text-sm">Chọn mô hình</span>
                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={() => {
                    setConfigOpen(false);
                    setConfigView('menu');
                  }}
                  className="p-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer text-[var(--text-secondary)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="composer-config-browser-body flex-1 min-h-0">
                <ModelBrowser
                  providers={providers}
                  value={selectedModel}
                  autoFocusSearch
                  onPick={(option) => {
                    onSelectModel({ providerId: option.provider.id, modelId: option.model.model_id });
                    setConfigOpen(false);
                    setConfigView('menu');
                  }}
                  onOpenProviders={() => {
                    setConfigOpen(false);
                    setConfigView('menu');
                    onOpenProviders?.();
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
