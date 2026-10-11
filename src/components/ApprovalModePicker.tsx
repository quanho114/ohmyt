import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, UserCheck, ScanLine, Unlock } from 'lucide-react';
import type { ApprovalMode } from '../types.ts';

const options = [
  { value: 'ask' as const, Icon: UserCheck, label: 'Bạn duyệt trước', description: 'Hỏi bạn trước khi dùng mạng, chạy lệnh trên máy hoặc thao tác ngoài project.' },
  { value: 'auto' as const, Icon: ScanLine, label: 'Để AI xét duyệt', description: 'AI xét từng quyền. Việc có rủi ro cao hoặc chưa rõ vẫn hỏi bạn.' },
  { value: 'full' as const, Icon: Unlock, label: 'Không cần duyệt', description: 'Dùng tệp và mạng không chờ bạn duyệt. Vẫn giữ các quy tắc cấm của hệ thống.' }
];

export function ApprovalModePicker({ mode, onChange, disabled = false }: { mode: ApprovalMode; onChange: (mode: ApprovalMode) => Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmFull, setConfirmFull] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = options.find(option => option.value === mode) || options[0];
  const closeConfirmation = () => {
    if (saving) return;
    setConfirmFull(false);
    setError('');
    trigger.current?.focus();
  };
  useEffect(() => {
    if (confirmFull) dialog.current?.showModal();
  }, [confirmFull]);
  const saveMode = async (value: ApprovalMode) => {
    if (saving || disabled) return;
    setSaving(true); setError('');
    try { await onChange(value); setOpen(false); setConfirmFull(false); trigger.current?.focus(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được chế độ phê duyệt'); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="approval-picker" ref={root} data-full={mode === 'full'} onKeyDown={event => {
    if (event.key === 'Escape' && !confirmFull) { setOpen(false); trigger.current?.focus(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') || []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="approval-picker-trigger" disabled={disabled || saving} aria-haspopup="menu" aria-expanded={open} title={disabled ? 'Dừng tác vụ trước khi đổi quyền' : selected.description} onClick={() => { setError(''); setOpen(value => !value); }}><selected.Icon size={15} strokeWidth={1.7} aria-hidden="true" /><span>{selected.label}</span></button>
    {open && <div className="approval-picker-menu" role="menu" aria-label="Chế độ phê duyệt">
      <p className="approval-picker-caption">Cách cấp quyền cho chat này</p>
      {options.map(({ value, label, description, Icon }) => <button key={value} type="button" role="menuitemradio" data-mode={value} aria-checked={mode === value} disabled={saving || disabled} onClick={() => {
        if (value === mode) { setOpen(false); trigger.current?.focus(); return; }
        if (value === 'full') { setError(''); setOpen(false); setConfirmFull(true); return; }
        void saveMode(value);
      }}><Icon className="approval-option-icon" size={18} strokeWidth={1.7} aria-hidden="true" /><span className="approval-option-copy"><span className="approval-option-label">{label}</span><span className="approval-option-description">{description}</span></span><span className="approval-option-check" aria-hidden="true">{mode === value && <Check size={15} strokeWidth={1.8} />}</span></button>)}
      {error && <p role="alert" className="approval-picker-error">{error}</p>}
      {error.startsWith('Dịch vụ đang chạy bản cũ.') && window.electronAPI?.restart && <button type="button" onClick={() => window.electronAPI?.restart?.()}>Khởi động lại ohmyt</button>}
    </div>}
    {confirmFull && createPortal(<dialog ref={dialog} className="approval-confirm-dialog" aria-labelledby="approval-confirm-title" aria-describedby="approval-confirm-description" onCancel={event => { event.preventDefault(); closeConfirmation(); }}>
      <Unlock size={24} className="approval-confirm-icon" aria-hidden="true" />
      <h2 id="approval-confirm-title">Bật chế độ không cần duyệt?</h2>
      <p id="approval-confirm-description">Trong chat này, ohmyt có thể dùng mạng, chạy lệnh và đọc hoặc sửa tệp trên máy qua các công cụ được cấp, mà không hỏi bạn trước mỗi thao tác.</p>
      <p>Bạn có thể đổi lại bất cứ lúc nào khi tác vụ đã dừng. Các quy tắc cấm của hệ thống vẫn áp dụng.</p>
      {error && <p role="alert" className="approval-picker-error">{error}</p>}
      <div className="approval-confirm-actions">
        <button type="button" autoFocus disabled={saving} onClick={closeConfirmation}>Hủy</button>
        <button type="button" className="approval-confirm-enable" disabled={saving || disabled} onClick={() => void saveMode('full')}>{saving ? 'Đang bật…' : 'Bật không cần duyệt'}</button>
      </div>
    </dialog>, document.body)}
  </div>;
}
