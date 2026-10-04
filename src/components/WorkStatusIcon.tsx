import type { CSSProperties } from 'react';

export type WorkState = 'thinking' | 'searching' | 'reading' | 'writing' | 'browsing' | 'terminal' | 'memory' | 'approval' | 'responding' | 'completed' | 'error' | 'stopped';

export function toolWorkState(name: string): WorkState {
  switch (name) {
    case 'web_search': return 'searching';
    case 'fs_read': return 'reading';
    case 'fs_write': return 'writing';
    case 'fs_list': return 'browsing';
    case 'shell_exec': return 'terminal';
    case 'memory_save': case 'memory_search': return 'memory';
    default: return 'terminal';
  }
}

/** Small, theme-aware status glyphs. Motion describes work; labels provide meaning. */
export function WorkStatusIcon({ state, animated = true, size = 24, className = '', surface = size >= 20 }: {
  state: WorkState; animated?: boolean; size?: number; className?: string; surface?: boolean;
}) {
  return <span className={`work-status-icon ${className}`} data-state={state} data-motion={animated} data-surface={surface}
    aria-hidden="true" style={{ width: size, height: size } as CSSProperties}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {state === 'thinking' && <g fill="currentColor" stroke="none">
        {[[-1,-1], [1,-1], [1,1], [-1,1]].map(([x,y], index) => <circle key={index} className="work-thought-dot" cx={12 + x * 4.5} cy={12 + y * 4.5} r="2.5"
          style={{ '--move-x': `${-x * 2}px`, '--move-y': `${-y * 2}px`, animationDelay: `${index * -200}ms` } as CSSProperties} />)}
        <path className="work-thought-center" d="m12 10 2 2-2 2-2-2Z" />
      </g>}
      {state === 'searching' && <>
        <circle className="work-surface" cx="10.5" cy="10.5" r="6.5" /><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15 15 4.5 4.5" />
        <path className="work-scan" d="M7.5 10.5a3 3 0 0 1 3-3" />
      </>}
      {state === 'reading' && <>
        <path className="work-paper-fill" d="M13.5 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5L13.5 4Z" />
        <path d="M13 4v4a1.5 1.5 0 0 0 1.5 1.5H19M8.5 13h7M8.5 16h4.5" /><path className="work-page-scan" d="M8.5 12h7" />
      </>}
      {state === 'writing' && <>
        <path d="M5 20h10" />
        <g className="work-pen"><path d="m7 13 9-9a2 2 0 0 1 3 3l-9 9-4 1 1-4ZM14.5 5.5l3 3" /></g>
      </>}
      {state === 'browsing' && <>
        <path d="M3.5 8V6a2 2 0 0 1 2-2H10l2.5 3H18a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5V8Z" />
        <path d="M4 10h16" opacity=".45" /><path className="work-folder-line" d="M8 15h4" />
      </>}
      {state === 'terminal' && <>
        <rect className="work-surface" x="3" y="5" width="18" height="14" rx="3.5" /><rect x="3" y="5" width="18" height="14" rx="3.5" /><path d="m7 9 3 3-3 3" />
        <path className="work-cursor" d="M13 15h4" />
      </>}
      {state === 'memory' && <>
        
        <rect className="work-paper-fill" x="7" y="7" width="10" height="10" rx="2.5" /><path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" /><circle className="work-memory-line" cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </>}
      {state === 'approval' && <>
        <path d="M8 10V7a4 4 0 0 1 8 0v3M6 10h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
        <path className="work-pending" d="M12 14v2" />
      </>}
      {state === 'responding' && <>
        <path d="M7 4h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H9l-5 2V8a4 4 0 0 1 3-4Z" />
        <path d="M8 9h8" /><path className="work-response-line" d="M8 14h5" />
      </>}
      {state === 'completed' && <><circle className="work-surface" cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="8.5" opacity=".35" /><path className="work-check" d="m8 12 2.75 2.75L16 9.5" /></>}
      {state === 'error' && <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5" /><circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" /></>}
      {state === 'stopped' && <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 8.5v7M14.5 8.5v7" /></>}
    </svg>
  </span>;
}
