import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PermissionRequest } from '../types.ts';
import { ShieldAlert, Terminal, Check, CheckCheck, X } from 'lucide-react';

interface PermissionModalProps {
  request: PermissionRequest | null;
  onRespond: (decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ request, onRespond }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (request && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [request]);
  if (!request) return null;
  const target = request.target || JSON.stringify(request.input);
  const shellCommand = request.toolName === 'shell_exec' || request.toolName === 'shell_host';
  const safeReadOnlyCommand = shellCommand
    && /^(?:git (?:status|diff|log)(?: --[\w-]+)*|ls|dir|pwd|npm --version|node --version)$/i.test(target.trim());
  const externalOrDestructive = /\b(delete|remove|rm\s|git push|upload|credential|password)\b/i.test(target);
  const sensitive = request.toolName === 'fs_write'
    || externalOrDestructive
    || (shellCommand && !safeReadOnlyCommand);
  const risk = /\b(git push|upload|credential|password)\b/i.test(target)
    ? 'Thao tác này có thể gửi thay đổi hoặc thông tin ra ngoài thiết bị.'
    : shellCommand && !safeReadOnlyCommand
      ? 'Lệnh có thể thay đổi tệp hoặc trạng thái hệ thống.'
      : request.toolName === 'fs_write'
        ? 'Tệp đích sẽ được tạo hoặc thay đổi.'
        : '';

  return createPortal(
      <dialog
        ref={dialogRef}
        onCancel={(event) => { event.preventDefault(); onRespond('DENY'); }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-title"
        className="permission-dialog"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          border: `1px solid ${sensitive ? 'var(--warning)' : 'var(--border)'}`
        }}
      >
        {/* Header */}
        <div
          className="permission-header p-4 flex items-center gap-3"
          style={{
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--surface)'
          }}
        >
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: sensitive ? 'color-mix(in srgb, var(--warning) 12%, transparent)' : 'var(--control-background)', color: sensitive ? 'var(--warning)' : 'var(--text-secondary)' }}
          >
            {sensitive ? <ShieldAlert size={16} /> : <Terminal size={16} />}
          </div>
          <div>
            <h3 id="permission-title" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Yêu cầu cấp quyền
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {shellCommand ? 'Agent muốn chạy lệnh sau. Bạn có cho phép không?' : 'Xem nội dung thao tác trước khi cấp quyền cho agent.'}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="permission-body p-4 space-y-3 text-xs">
          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Công cụ:</div>
            <div
              className="flex items-center gap-2 p-2 rounded-lg font-mono-code font-semibold"
              style={{
                backgroundColor: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <Terminal size={14} style={{ color: sensitive ? 'var(--warning)' : 'var(--text-secondary)' }} />
              <span>{request.toolName}</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Mục tiêu / Lệnh:</div>
            <pre
              className="permission-command p-2.5 rounded-lg font-mono-code text-xs select-text"
              style={{
                backgroundColor: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              {target}
            </pre>
          </div>

          {risk && (
            <div className="rounded-md px-2.5 py-2 text-[11px]" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)', color: 'var(--text-primary)' }}>
              <span className="font-medium" style={{ color: 'var(--warning)' }}>Lưu ý: </span>{risk}
            </div>
          )}

          <details>
            <summary style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}>Xem tham số đầy đủ</summary>
            <pre
              className="permission-command p-2.5 rounded-lg font-mono-code text-[11px]"
              style={{
                backgroundColor: 'var(--code-background)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              {JSON.stringify(request.input, null, 2)}
            </pre>
          </details>
        </div>

        {/* Actions Footer */}
        <div
          className="permission-footer flex items-center justify-end gap-2 p-3"
          style={{
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface)'
          }}
        >
          <button
            type="button"
            autoFocus
            onClick={() => onRespond('DENY')}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            <X size={13} />
            <span>Từ chối</span>
          </button>

          <button
            type="button"
            onClick={() => onRespond('ALLOW_ONCE')}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
              border: '1px solid var(--accent)'
            }}
          >
            <Check size={13} />
            <span>Cho phép 1 lần</span>
          </button>

          <button
            type="button"
            onClick={() => onRespond('ALLOW_ALWAYS')}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: 'transparent', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <CheckCheck size={13} />
            <span>{request.projectId ? 'Cho phép trong project này' : request.scopeId ? 'Cho phép trong chat này' : 'Luôn cho phép'}</span>
          </button>
        </div>
      </dialog>,
    document.body
  );
};
