import type { ToolCallItem } from './types.ts';

export interface HtmlArtifact { name: string; content: string }
export function htmlArtifacts(content: string, tools: ToolCallItem[] = []): HtmlArtifact[] {
  const files = new Map<string, HtmlArtifact>();
  for (const tool of tools) {
    if (!['fs_write', 'html_preview'].includes(tool.name) || tool.status !== 'completed') continue;
    const name = tool.name === 'html_preview' ? tool.input.name : tool.input.path;
    const html = tool.input.content;
    if (typeof name === 'string' && /\.html?$/i.test(name) && typeof html === 'string') {
      files.set(name, { name: name.split(/[\\/]/).pop() || 'preview.html', content: html });
    }
  }
  if (!files.size) {
    const blocks = /(?:^|\n)[ \t]*(`{3,}|~{3,})(html?)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*(?=\r?\n|$)/gi;
    let match;
    while ((match = blocks.exec(content))) {
      if (!/<(?:!doctype|html|body|canvas|div|svg|main)\b/i.test(match[3])) continue;
      const name = files.size ? `preview-${files.size + 1}.html` : 'preview.html';
      files.set(name, { name, content: match[3] });
    }
  }
  return [...files.values()].slice(0, 8);
}
