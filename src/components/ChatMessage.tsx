import React, { useState } from 'react';
import { Message, ToolCallItem } from '../types.ts';
import { ToolCallCard } from './ToolCallCard.tsx';
import { Avatar } from './Avatar.tsx';
import { Copy, Check } from 'lucide-react';
import type { Appearance } from '../appearance.ts';
import { ContentBlock } from './ContentBlock.tsx';
interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  tools?: ToolCallItem[];
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  tools = [],
  appearance,
  activeTheme
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.sender === 'user';

  const copyText = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render markdown elements
  const renderFormattedContent = (text: string) => {
    const codeBlockRegex = /```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g;
    type ContentPart = { type: 'code'; language: string; code: string } | { type: 'text'; content: string };
    const parts: ContentPart[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      parts.push({
        type: 'code',
        language: match[1] || 'text',
        code: match[2] || ''
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return parts.map((part, idx) => {
      if (part.type === 'code') {
        return <ContentBlock key={idx} language={part.language} code={part.code} appearance={appearance} activeTheme={activeTheme} isStreaming={isStreaming} />;
      }

      const lines = part.content.split('\n');
      return (
        <div key={idx} className="space-y-1 my-1">
          {lines.map((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={lIdx} className="h-2" />;

            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2">
                  <span className="mt-1" style={{ color: 'var(--text-tertiary)' }}>•</span>
                  <span>{formatInlineMarkdown(trimmed.substring(2))}</span>
                </div>
              );
            }

            const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
            if (numMatch) {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2">
                  <span className="font-mono-code text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{numMatch[1]}.</span>
                  <span>{formatInlineMarkdown(numMatch[2])}</span>
                </div>
              );
            }

            if (trimmed.startsWith('### ')) {
              return <h4 key={lIdx} className="font-semibold text-xs mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>{formatInlineMarkdown(trimmed.substring(4))}</h4>;
            }
            if (trimmed.startsWith('## ')) {
              return <h3 key={lIdx} className="font-semibold text-sm mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>{formatInlineMarkdown(trimmed.substring(3))}</h3>;
            }
            if (trimmed.startsWith('# ')) {
              return <h2 key={lIdx} className="font-bold text-base mt-4 mb-1" style={{ color: 'var(--text-primary)' }}>{formatInlineMarkdown(trimmed.substring(2))}</h2>;
            }

            return <p key={lIdx} className="leading-relaxed">{formatInlineMarkdown(line)}</p>;
          })}
        </div>
      );
    });
  };

  const formatInlineMarkdown = (line: string) => {
    const tokens = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
    return tokens.map((token, i) => {
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded font-mono-code text-[11px]"
            style={{
              backgroundColor: 'var(--control-background)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      if (token.startsWith('**') && token.endsWith('**')) {
        return <strong key={i} className="font-semibold" style={{ color: 'var(--text-primary)' }}>{token.slice(2, -2)}</strong>;
      }
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        return <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--info)', textDecoration: 'underline', textUnderlineOffset: 2 }}>{link[1]}</a>;
      }
      return token;
    });
  };

  if (isUser) {
    return (
      <div
        className="group message-row message-row-user"
        role="group"
        aria-label="Tin nhắn của bạn"
      >
        <div className="message-body message-body-user">
          <div className="message-content select-text text-[13.5px] leading-relaxed break-words whitespace-pre-wrap font-normal">
            {message.content}
          </div>
          <div className="message-meta flex items-center justify-end gap-1.5 mt-1 -mb-0.5">
            <span className="text-[10px] font-mono-code opacity-75" style={{ color: 'var(--text-secondary)' }}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              type="button"
              onClick={copyText}
              aria-label="Sao chép tin nhắn"
              className="rounded p-0.5 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              title="Sao chép tin nhắn"
            >
              {copied ? <Check size={11} style={{ color: 'var(--success)' }} /> : <Copy size={11} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group message-row message-row-assistant flex items-start gap-3"
      role="group"
      aria-label="Trả lời của ohmyt"
    >
      <div className="flex-shrink-0 pt-0.5">
        <Avatar kind="assistant" size={28} status={isStreaming ? 'running' : 'idle'} />
      </div>

      <div className="message-body flex-1 min-w-0">
        <div className="message-meta flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            ohmyt
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono-code font-medium opacity-80"
            style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            Local-First
          </span>
          <span className="text-[10px] font-mono-code ml-auto opacity-60" style={{ color: 'var(--text-tertiary)' }}>
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            type="button"
            onClick={copyText}
            aria-label="Sao chép tin nhắn"
            className="rounded p-1 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 hover:bg-[var(--surface-hover)] cursor-pointer"
            style={{ color: 'var(--text-tertiary)' }}
            title="Sao chép tin nhắn"
          >
            {copied ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
          </button>
        </div>

        {/* Content */}
        <div className="message-content select-text text-[13.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          {renderFormattedContent(message.content)}

          {isStreaming && (
            <span
              className="inline-block w-1.5 h-3.5 ml-1 translate-y-0.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent)' }}
            />
          )}
        </div>

        {/* Inline tool calls */}
        {tools.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {tools.map(tool => (
              <ToolCallCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

