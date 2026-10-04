import React from 'react';

type AvatarStatus = 'idle' | 'running' | 'waiting_approval' | 'paused' | 'error';

interface AvatarProps {
  kind: 'assistant' | 'user';
  status?: AvatarStatus;
  initials?: string;
  size?: 28 | 30 | 32 | 48;
  showStatusDot?: boolean;
}

const statusColor: Record<AvatarStatus, string> = {
  idle: 'var(--text-tertiary)',
  running: 'var(--success)',
  waiting_approval: 'var(--warning)',
  paused: 'var(--info)',
  error: 'var(--danger)'
};

const statusLabel: Record<AvatarStatus, string> = {
  idle: 'Sẵn sàng',
  running: 'Đang chạy',
  waiting_approval: 'Đang chờ phê duyệt',
  paused: 'Đã tạm dừng',
  error: 'Có lỗi'
};

export const Avatar: React.FC<AvatarProps> = ({ kind, status = 'idle', initials = 'U', size = 28, showStatusDot = true }) => {
  const assistant = kind === 'assistant';

  return (
    <span
      className="relative inline-flex flex-shrink-0 items-center justify-center font-mono-code font-semibold shadow-xs select-none"
      role="img"
      aria-label={assistant ? `ohmyt · ${statusLabel[status]}` : 'Bạn'}
      title={assistant ? `ohmyt · ${statusLabel[status]}` : 'Bạn'}
      style={{
        width: size,
        height: size,
        borderRadius: assistant ? Math.round(size * 0.28) : '50%',
        background: assistant ? 'linear-gradient(135deg, #18181b 0%, #27272a 100%)' : 'var(--surface-secondary)',
        border: assistant ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid var(--border)',
        color: assistant ? '#f4f4f5' : 'var(--text-secondary)',
        fontSize: assistant ? (size >= 48 ? 16 : size >= 30 ? 11 : 10) : 11,
        letterSpacing: assistant ? '-0.03em' : 'normal'
      }}
    >
      {assistant ? (
        <span className="flex items-center justify-center font-bold tracking-tight">
          OT
        </span>
      ) : (
        initials.slice(0, 2).toUpperCase()
      )}
      {assistant && showStatusDot && (
        <span
          aria-hidden="true"
          className={`absolute -right-0.5 -bottom-0.5 rounded-full ${status === 'running' ? 'animate-pulse' : ''}`}
          style={{
            width: size >= 48 ? 9 : 7,
            height: size >= 48 ? 9 : 7,
            backgroundColor: statusColor[status],
            boxShadow: '0 0 0 1.5px var(--background)'
          }}
        />
      )}
    </span>
  );
};
