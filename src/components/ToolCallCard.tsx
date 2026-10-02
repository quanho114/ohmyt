import React, { useState } from 'react';
import { ToolCallItem } from '../types.ts';
import { FileText, Folder, Terminal, Globe, Database, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface ToolCallCardProps {
  tool: ToolCallItem;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  let toolIcon = <Terminal size={14} style={{ color: 'var(--text-secondary)' }} />;
  if (tool.name === 'fs_read' || tool.name === 'fs_write') {
    toolIcon = <FileText size={14} style={{ color: 'var(--text-secondary)' }} />;
  } else if (tool.name === 'fs_list') {
    toolIcon = <Folder size={14} style={{ color: 'var(--text-secondary)' }} />;
  } else if (tool.name === 'shell_exec') {
    toolIcon = <Terminal size={14} style={{ color: 'var(--warning)' }} />;
  } else if (tool.name === 'web_search') {
    toolIcon = <Globe size={14} style={{ color: 'var(--info)' }} />;
  } else if (tool.name === 'memory_save' || tool.name === 'memory_search') {
    toolIcon = <Database size={14} style={{ color: 'var(--text-secondary)' }} />;
  }

  let targetSummary = JSON.stringify(tool.input);
  if (typeof tool.input.path === 'string') {
    targetSummary = tool.input.path;
  } else if (typeof tool.input.command === 'string') {
    targetSummary = tool.input.command;
  } else if (typeof tool.input.query === 'string') {
    targetSummary = `"${tool.input.query}"`;
  } else if (typeof tool.input.content === 'string') {
    targetSummary = tool.input.content.length > 40 ? tool.input.content.substring(0, 40) + '...' : tool.input.content;
  }

  const copyPayload = () => {
    const data = JSON.stringify({ input: tool.input, output: tool.output }, null, 2);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="tool-call-card my-2 w-full overflow-hidden text-xs rounded-xl shadow-xs transition-all"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)'
      }}
    >
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Thu gọn' : 'Mở'} chi tiết ${tool.name}`}
        className="tool-card-toggle flex w-full items-center justify-between gap-2 px-3 py-2 text-left cursor-pointer transition-colors hover:bg-[var(--surface-hover)]"
        style={{ backgroundColor: 'var(--surface-secondary)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="p-1 rounded-md flex-shrink-0"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)'
            }}
          >
            {toolIcon}
          </div>
          <span className="font-mono-code font-semibold tracking-tight text-[12px]" style={{ color: 'var(--text-primary)' }}>
            {tool.name}
          </span>
          <span
            className="font-mono-code truncate max-w-[260px]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {targetSummary}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {tool.status === 'running' && (
            <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 size={13} className="animate-spin" />
              <span className="text-[11px]">Đang thực thi</span>
            </div>
          )}

          {tool.status === 'completed' && (
            <div className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={13} aria-hidden="true" />
              <span className="text-[11px]">Hoàn tất</span>
              {tool.durationMs !== undefined && (
                <span className="text-[11px] font-mono-code" style={{ color: 'var(--text-tertiary)' }}>
                  {tool.durationMs}ms
                </span>
              )}
            </div>
          )}

          {(tool.status === 'error' || tool.status === 'blocked') && (
            <div className="flex items-center gap-1" style={{ color: 'var(--danger)' }}>
              <AlertCircle size={13} aria-hidden="true" />
              <span className="text-[11px]">{tool.status === 'blocked' ? 'Bị chặn' : 'Lỗi'}</span>
            </div>
          )}

          <div style={{ color: 'var(--text-tertiary)' }} className="ml-1">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>
      </button>

      {/* Expandable details */}
      {expanded && (
        <div
          className="p-3 font-mono-code text-[11px] space-y-2"
          style={{
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--code-background)'
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-1" style={{ color: 'var(--text-secondary)' }}>
              <span>Tham số (Input):</span>
              <button
                type="button"
                onClick={() => {
                  copyPayload();
                }}
                aria-label="Sao chép nội dung công cụ"
                className="flex items-center gap-1 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}
              >
                {copied ? <Check size={11} style={{ color: 'var(--success)' }} /> : <Copy size={11} />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
              </button>
            </div>
            <pre
              className="p-2 rounded overflow-x-auto"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>

          {tool.output !== undefined && (
            <div>
              <div className="mb-1" style={{ color: 'var(--text-secondary)' }}>Kết quả (Output):</div>
              <pre
                className="p-2 rounded overflow-x-auto max-h-48 overflow-y-auto"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                {typeof tool.output === 'string'
                  ? tool.output
                  : JSON.stringify(tool.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
