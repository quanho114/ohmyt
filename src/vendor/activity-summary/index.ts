/** Adapted from DeepSeek ReasoningRow.tsx (MIT) and Codex streaming.rs
 * (Apache-2.0). See README.md and the adjacent licenses. Display-only. */
export function reasoningPreview(text: string, running: boolean): string {
  // DeepSeek: advance the preview only after a paragraph's first line completes.
  let summary = '';
  if (running) {
    let paragraphStart = 0;
    const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
    while (true) {
      const next = separator.exec(text);
      const end = next === null ? text.length : next.index + next[0].indexOf('\n');
      const newline = text.indexOf('\n', paragraphStart);
      if (newline !== -1 && newline <= end) {
        const candidate = text.slice(paragraphStart, newline).trim();
        if (candidate) summary = candidate;
      }
      if (next === null) break;
      paragraphStart = next.index + next[0].length;
    }
  } else summary = text.split('\n', 1)[0].trim();
  // Codex: strip heading decoration before using a reasoning line as status.
  // Keep uncompleted text out of the live preview to avoid a per-token ticker.
  summary = summary.replace(/^#+\s*/, '').replaceAll('**', '').trim();
  if (summary.startsWith('<!--')) return '';
  return summary;
}
