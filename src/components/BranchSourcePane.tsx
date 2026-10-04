import React from 'react';
import type { Message } from '../types.ts';
import { ChatMessage } from './ChatMessage.tsx';
import { PanelLeft } from 'lucide-react';
import type { Appearance } from '../appearance.ts';

interface BranchSourcePaneProps {
  title: string;
  messages: Message[];
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
}

// Pane trái của split-view chủ đề phụ: xem lại chủ đề chính (read-only).
export const BranchSourcePane: React.FC<BranchSourcePaneProps> = ({
  title,
  messages,
  appearance,
  activeTheme
}) => {
  return (
    <section
      className="branch-source"
      aria-label="Chủ đề chính"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      <header
        className="branch-source-head"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <PanelLeft size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span className="branch-source-title" style={{ color: 'var(--text-primary)' }}>
          {title}
        </span>
        <span className="branch-source-more" style={{ color: 'var(--text-tertiary)' }}>···</span>
      </header>
      <div className="chat-scroller branch-source-feed">
        <div className="conversation-width conversation-feed">
          {messages.map(msg => (
            <ChatMessage
              key={msg.id}
              message={msg}
              appearance={appearance}
              activeTheme={activeTheme}
              actionsDisabled
            />
          ))}
        </div>
      </div>
    </section>
  );
};
