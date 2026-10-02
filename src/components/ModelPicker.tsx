import React from 'react';
import { AIProvider } from '../types.ts';
import { ChevronDown } from 'lucide-react';

interface ModelPickerProps {
  providers: AIProvider[];
  value: { providerId: string; modelId: string } | null;
  onChange: (v: { providerId: string; modelId: string }) => void;
}

function groupLabel(type: string): string {
  if (type === 'ollama') return 'LOCAL';
  if (type === 'openai-compatible' || type === 'custom') return 'CUSTOM';
  return 'CLOUD';
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ providers, value, onChange }) => {
  const groups: Record<string, Array<{ p: AIProvider; mId: string; mName: string }>> = {};
  let currentDisplay = value ? value.modelId : 'Chọn model';
  let isLocal = false;
  let boundary = 'Local';

  for (const p of providers) {
    const g = groupLabel(p.type);
    if (!groups[g]) groups[g] = [];
    for (const m of p.models || []) {
      if (!m.enabled) continue;
      groups[g].push({ p, mId: m.model_id, mName: m.display_name });
      if (value && value.providerId === p.id && value.modelId === m.model_id) {
        currentDisplay = m.display_name;
        isLocal = p.type === 'ollama';
        boundary = isLocal ? 'Local' : (p.type === 'openai-compatible' || p.type === 'custom') ? 'Custom' : 'Cloud';
      }
    }
  }

  const currentKey = value ? `${value.providerId}::${value.modelId}` : '';

  return (
    <div className="model-picker-wrapper relative inline-flex items-center">
      <div
        className="model-picker flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all select-none hover:bg-[var(--surface-hover)]"
        style={{
          backgroundColor: 'var(--surface-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)'
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: isLocal ? 'var(--success)' : 'var(--warning)' }}
        />
        <span className="truncate max-w-[170px]" title={currentDisplay}>
          {currentDisplay}
        </span>
        <span
          className="text-[10px] px-1 py-0.5 rounded font-mono-code opacity-75"
          style={{ backgroundColor: 'var(--surface-active)', color: 'var(--text-secondary)' }}
        >
          {boundary}
        </span>
        <ChevronDown size={12} className="opacity-50 flex-shrink-0 ml-0.5" />
      </div>

      <select
        value={currentKey}
        onChange={(e) => {
          const [providerId, ...rest] = e.target.value.split('::');
          const modelId = rest.join('::');
          if (providerId && modelId) onChange({ providerId, modelId });
        }}
        aria-label="Chọn model"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        title="Chọn model"
      >
        {!value && <option value="">Chọn model</option>}
        {Object.entries(groups).map(([g, items]) => (
          <optgroup key={g} label={g}>
            {items.map((it) => (
              <option key={`${it.p.id}::${it.mId}`} value={`${it.p.id}::${it.mId}`}>
                {it.p.name} / {it.mName}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};
