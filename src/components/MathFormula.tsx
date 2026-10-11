import katex from 'katex';
import 'katex/dist/katex.min.css';

export function MathFormula({ source, display = false }: { source: string; display?: boolean }) {
  try {
    if (source.length > 16384) throw new Error('Formula too large');
    const html = katex.renderToString(source, {
      displayMode: display, throwOnError: true, trust: false,
      strict: 'ignore', maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml',
    });
    const Tag = display ? 'div' : 'span';
    return <Tag className={display ? 'message-math-display' : 'message-math-inline'} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <code className="message-math-fallback">{source}</code>;
  }
}
