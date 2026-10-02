import React from 'react';
import { PermissionRequest } from '../types.ts';
import { ShieldAlert, Terminal, Check, CheckCheck, X } from 'lucide-react';

interface PermissionModalProps {
  request: PermissionRequest | null;
  onRespond: (decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ request, onRespond }) => {
  if (!request) return null;
  const target = request.target || JSON.stringify(request.input);
  const safeReadOnlyCommand = request.toolName === 'shell_exec'
    && /^(?:git (?:status|diff|log)(?: --[\w-]+)*|ls|dir|pwd|npm --version|node --version)$/i.test(target.trim());
  const externalOrDestructive = /\b(delete|remove|rm\s|git push|upload|credential|password)\b/i.test(target);
  const sensitive = request.toolName === 'fs_write'
    || externalOrDestructive
    || (request.toolName === 'shell_exec' && !safeReadOnlyCommand);
  const risk = /\b(git push|upload|credential|password)\b/i.test(target)
    ? 'Thao tác này có thể gửi thay đổi hoặc thông tin ra ngoài thiết bị.'
    : request.toolName === 'shell_exec' && !safeReadOnlyCommand
      ? 'Lệnh có thể thay đổi tệp hoặc trạng thái hệ thống.'
      : request.toolName === 'fs_write'
        ? 'Tệp đích sẽ được tạo hoặc thay đổi.'
        : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" style={{ backgroundColor: 'var(--overlay)' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-title"
        className="permission-dialog flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          border: `1px solid ${sensitive ? 'var(--warning)' : 'var(--border)'}`
        }}
      >
        {/* Header */}
        <div
          className="p-4 flex items-center gap-3"
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
              {request.description || 'Agent cần sự cho phép của bạn trước khi thực hiện hành động này.'}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 overflow-y-auto text-xs">
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
            <div
              className="p-2.5 rounded-lg font-mono-code text-xs break-all select-text"
              style={{
                backgroundColor: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              {target}
            </div>
          </div>

          {risk && (
            <div className="rounded-md px-2.5 py-2 text-[11px]" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)', color: 'var(--text-primary)' }}>
              <span className="font-medium" style={{ color: 'var(--warning)' }}>Lưu ý: </span>{risk}
            </div>
          )}

          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Tham số:</div>
            <pre
              className="p-2.5 rounded-lg font-mono-code text-[11px] overflow-x-auto max-h-36"
              style={{
                backgroundColor: 'var(--code-background)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              {JSON.stringify(request.input, null, 2)}
            </pre>
          </div>
        </div>

        {/* Actions Footer */}
        <div
          className="flex flex-shrink-0 items-center justify-end gap-2 p-3"
          style={{
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface)'
          }}
        >
          <button
            type="button"
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
            <span>Luôn cho phép</span>
          </button>
        </div>
      </div>
    </div>
  );
};
