import { codeThemeStyle } from '../codeThemes.ts';
import { copyToClipboard } from '../clipboard.ts';
import { useEffect, useId, useMemo, useState } from 'react';
import { Copy, Check, Code, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
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
import mermaid from 'mermaid';
import { mermaidThemeConfig, mermaidThemeBackground } from '../mermaidThemes.ts';
import type { Appearance } from '../appearance.ts';
import { resolveLocale } from '../appearance.ts';
import { settingsText } from '../settingsLocale.ts';

for (const [name, grammar] of Object.entries({ javascript, typescript, json, python, bash, css, xml, sql, markdown })) hljs.registerLanguage(name, grammar);
const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', py: 'python', sh: 'bash', shell: 'bash', html: 'xml', svg: 'xml', md: 'markdown' };
let renderCounter = 0;
// ponytail: Mermaid global configuration serializes renders; isolated renderer instances if diagram throughput matters.
let renderQueue: Promise<unknown> = Promise.resolve();

function sanitizeDiagram(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG');
  const allowedElements: Record<string, true> = { svg: true, g: true, defs: true, style: true, path: true, rect: true, circle: true, ellipse: true, line: true, polyline: true, polygon: true, text: true, tspan: true, marker: true, title: true, desc: true, clipPath: true, linearGradient: true, radialGradient: true, stop: true };
  const unsafeResource = /(?:\\|@|javascript:|data:|https?:|\/\/|expression\s*\()/i;
  // Resource URLs may only reference markers/clip paths inside this SVG.
  for (const node of [doc.documentElement, ...doc.querySelectorAll('*')]) {
    if (node.namespaceURI !== 'http://www.w3.org/2000/svg' || !Object.hasOwn(allowedElements, node.localName)) { node.remove(); continue; }
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name === 'xmlns' || name === 'xmlns:xlink') continue;
      const value = attribute.value;
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && !/^#[\w:.-]+$/.test(value)) || unsafeResource.test(value) || [...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(match => !/^\s*['"]?#[\w:.-]+['"]?\s*$/.test(match[1]))) node.removeAttribute(attribute.name);
    }
    if (node.localName === 'style') {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(node.textContent || '');
      node.textContent = [...sheet.cssRules].filter(rule => rule instanceof CSSStyleRule && !unsafeResource.test(rule.cssText) && [...rule.cssText.matchAll(/url\s*\(([^)]*)\)/gi)].every(match => /^\s*['"]?#[\w:.-]+['"]?\s*$/.test(match[1]))).map(rule => rule.cssText).join('\n');
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function diagramColors() {
  const style = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot resolve diagram palette');
  const color = (token: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = style.getPropertyValue(token).trim();
    context.fillRect(0, 0, 1, 1);
    return `#${[...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('')}`;
  };
  return { primaryColor: color('--surface-secondary'), primaryTextColor: color('--text-primary'), primaryBorderColor: color('--border-strong'), lineColor: color('--accent'), textColor: color('--text-primary'), background: color('--surface') };
}

interface ContentBlockProps {
  language: string;
  code: string;
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
  isStreaming?: boolean;
  preview?: boolean;
}

export function ContentBlock({ language, code, appearance, activeTheme, isStreaming = false, preview = false }: ContentBlockProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [diagram, setDiagram] = useState<{ source: string; signature: string; svg: string } | null>(null);
  const [error, setError] = useState('');
  const [copyResult, setCopyResult] = useState<{ source: string; status: 'copied' | 'failed' } | null>(null);
  const copyState = copyResult?.source === code ? copyResult.status : 'idle';
  const isMermaid = language.toLowerCase() === 'mermaid';
  const [expanded, setExpanded] = useState(false);
  const lineCount = code.split('\n').length;
  const locale = resolveLocale(appearance.locale, typeof navigator === 'undefined' ? 'en' : navigator.language);
  const t = (key: Parameters<typeof settingsText>[1]) => settingsText(locale, key);
  const signature = `${appearance.mermaidTheme}:${activeTheme}:${appearance.accent}:${appearance.neutral}`;
  const highlighted = useMemo(() => {
    const languageId = language.toLowerCase();
    const normalized = Object.hasOwn(aliases, languageId) ? aliases[languageId] : languageId;
    return !isMermaid && hljs.getLanguage(normalized) ? hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value : null;
  }, [language, code, isMermaid]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!isMermaid || isStreaming) return;
    // Metadata accepts YAML keys/aliases; reject the entire resource-capable construct before measurement.
    if (new TextEncoder().encode(code).length > 32768 || /%%\s*\{|^\s*---|@\s*\{|<[a-z!/?]|\b(?:https?:|data:|javascript:|ftp:)|\/\/|url\s*\(|^\s*click\s|\\|\b(?:img|image|icon)\s*['"]?\s*:|\b(?:properties|details)\s/im.test(code)) {
      setError(settingsText(locale, 'Sơ đồ quá lớn hoặc chứa cấu hình không được phép.'));
      return;
    }
    const work = async () => {
      if (cancelled) return;
      const colors = diagramColors();
      const themeConfig = mermaidThemeConfig(appearance.mermaidTheme);
      mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
        maxTextSize: 32768, maxEdges: 500,
        theme: themeConfig.theme,
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        sequence: { mirrorActors: !preview },
        themeVariables: appearance.mermaidTheme === 'lobe' ? {
          darkMode: activeTheme === 'dark', ...colors,
          actorBkg: colors.primaryColor, actorBorder: colors.primaryBorderColor, actorTextColor: colors.textColor,
          signalColor: colors.lineColor, signalTextColor: colors.textColor,
          labelBoxBkgColor: colors.primaryColor, labelBoxBorderColor: colors.primaryBorderColor, labelTextColor: colors.textColor,
          loopTextColor: colors.textColor, noteBkgColor: colors.primaryColor, noteTextColor: colors.textColor
        } : themeConfig.themeVariables
      });
      const container = document.createElement('div');
      // Mermaid draw routines query document IDs and measure SVG; detached nodes cannot render.
      container.className = 'mermaid-measure';
      container.setAttribute('aria-hidden', 'true');
      document.body.append(container);
      try {
        const result = await mermaid.render(`diagram${id}${++renderCounter}`, code, container);
        const safeSvg = sanitizeDiagram(result.svg);
        if (!cancelled) setDiagram({ source: code, signature, svg: safeSvg });
      } finally { container.remove(); }
    };
    renderQueue = renderQueue.catch(() => undefined).then(work).catch(() => {
      if (!cancelled) setError(settingsText(locale, 'Không thể hiển thị sơ đồ. Bạn có thể xem và sao chép nguồn.'));
    });
    return () => { cancelled = true; };
  }, [isMermaid, isStreaming, code, signature, id, locale, appearance.mermaidTheme, activeTheme, preview]);

  const copy = async () => {
    try { await copyToClipboard(code); setCopyResult({ source: code, status: 'copied' }); }
    catch { setCopyResult({ source: code, status: 'failed' }); }
  };
  const currentDiagram = !error && !isStreaming && diagram?.source === code && diagram.signature === signature ? diagram.svg : null;
  return (
    <div className={`content-block${preview ? ' content-block-preview' : ''}${!isMermaid ? ' code-editor-block' : ''}${expanded ? ' is-expanded' : ''}`} style={!isMermaid ? codeThemeStyle(appearance.codeTheme) : undefined} data-content-block data-code-palette={!isMermaid && !!codeThemeStyle(appearance.codeTheme) ? true : undefined} data-code-theme={appearance.codeTheme} data-color-mode={activeTheme}>
      {!preview && <header className="content-block-header">
        <span><Code size={13} aria-hidden="true" />{language || 'text'}{!isMermaid && <small className="code-line-count">{lineCount} {t('dòng')}</small>}</span>
        <div className="code-header-actions">
          {!isMermaid && <button type="button" className="control-button" aria-expanded={expanded} aria-label={t(expanded ? 'Thu gọn mã' : 'Mở rộng mã')} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}{t(expanded ? 'Thu gọn mã' : 'Mở rộng mã')}</button>}
        <button type="button" className="control-button" onClick={copy} aria-label={t('Sao chép mã')}>
          {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
          {copyState === 'copied' ? t('Đã sao chép') : t('Sao chép')}
        </button>
        </div>
      </header>}
      {copyState === 'failed' && <p role="status" className="content-error">{t('Không thể sao chép vào clipboard.')}</p>}
      {error && <p role="status" className="content-error">{error}</p>}
      {currentDiagram ? <>
        <div className="mermaid-diagram" role="img" aria-label={t('Xem trước Mermaid')} style={{ background: mermaidThemeBackground(appearance.mermaidTheme) }} dangerouslySetInnerHTML={{ __html: currentDiagram }} />
        <details className="diagram-source"><summary><ChevronDown size={13} />{t('Nguồn sơ đồ')}</summary><pre><code>{code}</code></pre></details>
      </> : preview && !error ? <div className="mermaid-loading" role="status">{t('Đang vẽ sơ đồ…')}</div> : <div className="code-scroll-area" tabIndex={0} role="region" aria-label={language || 'Code'}>
        {!isMermaid && <div className="code-line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>}
        <pre>{highlighted !== null ? <code dangerouslySetInnerHTML={{ __html: highlighted }} /> : <code>{code}</code>}</pre></div>}
    </div>
  );
}
