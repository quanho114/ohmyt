import { useEffect, useId, useMemo, useState } from 'react';
import { Copy, Check, Code, ChevronDown } from 'lucide-react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import type { Appearance } from '../appearance.ts';
// mermaid load lười trong effect (import top-level crash SSR vì chạm window).

for (const [name, grammar] of Object.entries({ javascript, typescript, json, python, bash, css, xml, sql, markdown })) hljs.registerLanguage(name, grammar);
const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', py: 'python', sh: 'bash', shell: 'bash', html: 'xml', svg: 'xml', md: 'markdown' };
let renderCounter = 0;
// ponytail: Mermaid global configuration serializes renders; isolated renderer instances if diagram throughput matters.
let renderQueue: Promise<unknown> = Promise.resolve();

function sanitizeDiagram(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG');
  doc.querySelectorAll('script,foreignObject,iframe,object,embed,image,use,a,animate,animateMotion,animateTransform,set').forEach(node => node.remove());
  for (const node of [doc.documentElement, ...doc.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) || /(?:javascript:|data:|https?:|\/\/|@import|expression\s*\()/i.test(value) || /url\s*\(\s*['"]?(?!#)/i.test(value)) node.removeAttribute(attribute.name);
    }
    if (node.localName === 'style' && /(?:@import|https?:|\/\/|javascript:|data:|expression\s*\(|url\s*\(\s*['"]?(?!#))/i.test(node.textContent || '')) node.remove();
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

interface ContentBlockProps {
  language: string;
  code: string;
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
  isStreaming?: boolean;
}

export function ContentBlock({ language, code, appearance, activeTheme, isStreaming = false }: ContentBlockProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [diagram, setDiagram] = useState<{ source: string; signature: string; svg: string } | null>(null);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const isMermaid = language.toLowerCase() === 'mermaid';
  const vi = appearance.locale === 'vi' || (appearance.locale === 'system' && typeof navigator !== 'undefined' && navigator.language.startsWith('vi'));
  const signature = `${appearance.mermaidTheme}:${activeTheme}:${appearance.accent}:${appearance.neutral}`;
  const highlighted = useMemo(() => {
    const normalized = aliases[language.toLowerCase()] || language.toLowerCase();
    return !isMermaid && hljs.getLanguage(normalized) ? hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value : null;
  }, [language, code, isMermaid]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!isMermaid || isStreaming) return;
    if (code.length > 32768 || /%%\s*\{|^\s*---/.test(code)) {
      setError(vi ? 'Sơ đồ quá lớn hoặc chứa cấu hình không được phép.' : 'Diagram is too large or contains unsupported configuration.');
      return;
    }
    const work = async () => {
      if (cancelled) return;
      const { default: mermaid } = await import('mermaid');
      const rootStyle = getComputedStyle(document.documentElement);
      mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
        maxTextSize: 32768, maxEdges: 500,
        theme: appearance.mermaidTheme === 'lobe' ? 'base' : appearance.mermaidTheme,
        flowchart: { htmlLabels: false },
        themeVariables: appearance.mermaidTheme === 'lobe' ? {
          darkMode: activeTheme === 'dark', primaryColor: rootStyle.getPropertyValue('--surface-secondary').trim(),
          primaryTextColor: rootStyle.getPropertyValue('--text-primary').trim(),
          primaryBorderColor: rootStyle.getPropertyValue('--border-strong').trim(),
          lineColor: rootStyle.getPropertyValue('--accent').trim(),
          textColor: rootStyle.getPropertyValue('--text-primary').trim(),
          background: rootStyle.getPropertyValue('--surface').trim()
        } : undefined
      });
      const container = document.createElement('div');
      try {
        const result = await mermaid.render(`diagram${id}${++renderCounter}`, code, container);
        const safeSvg = sanitizeDiagram(result.svg);
        if (!cancelled) setDiagram({ source: code, signature, svg: safeSvg });
      } finally { container.remove(); }
    };
    renderQueue = renderQueue.catch(() => undefined).then(work).catch(() => {
      if (!cancelled) setError(vi ? 'Không thể hiển thị sơ đồ. Bạn có thể xem và sao chép nguồn.' : 'Cannot display this diagram. You can read and copy its source.');
    });
    return () => { cancelled = true; };
  }, [isMermaid, isStreaming, code, signature, id, vi, appearance.mermaidTheme, activeTheme]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopyState('copied'); }
    catch { setCopyState('failed'); }
  };
  const currentDiagram = !error && !isStreaming && diagram?.source === code && diagram.signature === signature ? diagram.svg : null;
  return (
    <div className="content-block" data-content-block data-code-theme={appearance.codeTheme} data-color-mode={activeTheme}>
      <header className="content-block-header">
        <span><Code size={13} aria-hidden="true" />{language || 'text'}</span>
        <button type="button" className="control-button" onClick={copy} aria-label={vi ? 'Sao chép mã' : 'Copy code'}>
          {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
          {copyState === 'copied' ? (vi ? 'Đã sao chép' : 'Copied') : (vi ? 'Sao chép' : 'Copy')}
        </button>
      </header>
      {copyState === 'failed' && <p role="status" className="content-error">{vi ? 'Không thể sao chép vào clipboard.' : 'Could not copy to clipboard.'}</p>}
      {error && <p role="status" className="content-error">{error}</p>}
      {currentDiagram ? <>
        <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: currentDiagram }} />
        <details className="diagram-source"><summary><ChevronDown size={13} />{vi ? 'Nguồn sơ đồ' : 'Diagram source'}</summary><pre><code>{code}</code></pre></details>
      </> : <pre>{highlighted !== null ? <code dangerouslySetInnerHTML={{ __html: highlighted }} /> : <code>{code}</code>}</pre>}
    </div>
  );
}
