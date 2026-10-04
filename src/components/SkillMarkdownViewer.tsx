import { ContentBlock } from './ContentBlock.tsx';
import type { Appearance } from '../appearance.ts';

interface SkillMarkdownViewerProps {
  markdown: string;
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
}

export function SkillMarkdownViewer({ markdown, appearance, activeTheme }: SkillMarkdownViewerProps) {
  if (!markdown || !markdown.trim()) {
    return <div className="text-sm italic text-tertiary">Chưa có hướng dẫn hoặc quy trình cụ thể cho kỹ năng này.</div>;
  }

  const formatInlineMarkdown = (line: string) => {
    const tokens = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/gi);
    return tokens.map((token, i) => {
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code
            key={i}
            className="message-inline-code px-1.5 py-0.5 rounded font-mono-code text-xs"
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
        return (
          <strong key={i} className="font-semibold text-primary">
            {token.slice(2, -2)}
          </strong>
        );
      }
      const linkMatch = token.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/i);
      if (linkMatch) {
        return (
          <a
            key={i}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:opacity-80"
          >
            {linkMatch[1]}
          </a>
        );
      }
      return <span key={i}>{token}</span>;
    });
  };

  const codeBlockRegex = /```([a-zA-Z0-9_\-]+)?[ \t]*\r?\n([\s\S]*?)```/g;
  type ContentPart = { type: 'code'; language: string; code: string } | { type: 'text'; content: string };
  const parts: ContentPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: markdown.substring(lastIndex, match.index) });
    }
    parts.push({
      type: 'code',
      language: match[1] || 'text',
      code: match[2] || ''
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    parts.push({ type: 'text', content: markdown.substring(lastIndex) });
  }

  return (
    <div className="skill-markdown-viewer space-y-3 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          return (
            <div key={idx} className="my-3.5">
              <ContentBlock
                language={part.language}
                code={part.code}
                appearance={appearance}
                activeTheme={activeTheme}
                isStreaming={false}
              />
            </div>
          );
        }

        const lines = part.content.split('\n');
        return (
          <div key={idx} className="space-y-2">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1.5" />;

              if (trimmed.startsWith('# ')) {
                return (
                  <h2 key={lIdx} className="text-[17px] font-bold text-[var(--text-primary)] mt-6 mb-2 tracking-tight">
                    {formatInlineMarkdown(trimmed.substring(2))}
                  </h2>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lIdx} className="text-[15px] font-semibold text-[var(--text-primary)] mt-5 mb-1.5 tracking-tight">
                    {formatInlineMarkdown(trimmed.substring(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lIdx} className="text-[14px] font-semibold text-[var(--text-primary)] mt-4 mb-1">
                    {formatInlineMarkdown(trimmed.substring(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote
                    key={lIdx}
                    className="border-l-2 border-[var(--accent)] pl-3.5 py-1 my-2 italic text-[var(--text-secondary)] bg-[var(--surface-secondary)]/50 rounded-r"
                  >
                    {formatInlineMarkdown(trimmed.substring(2))}
                  </blockquote>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2.5 pl-2 leading-relaxed">
                    <span className="text-[var(--text-tertiary)] select-none leading-none mt-1.5">•</span>
                    <span className="flex-1">{formatInlineMarkdown(trimmed.substring(2))}</span>
                  </div>
                );
              }
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-2 leading-relaxed">
                    <span className="font-mono-code text-xs text-[var(--text-tertiary)] mt-0.5 select-none">{numMatch[1]}.</span>
                    <span className="flex-1">{formatInlineMarkdown(numMatch[2])}</span>
                  </div>
                );
              }

              // Tag lines like <artifacts_guides>
              if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
                return (
                  <div key={lIdx} className="font-mono-code text-xs text-[var(--text-tertiary)] py-0.5">
                    {trimmed}
                  </div>
                );
              }

              return <p key={lIdx} className="leading-relaxed text-[var(--text-secondary)]">{formatInlineMarkdown(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}
