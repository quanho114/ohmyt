export type TableAlignment = 'left' | 'center' | 'right' | undefined;

// Split only unescaped pipes; keep inline Markdown for the cell renderer.
export function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let separators = 0;
  const text = line.trim();
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\' && index + 1 < text.length) {
      const next = text[++index];
      cell += next === '|' ? '|' : char + next;
    } else if (char === '|') {
      cells.push(cell.trim());
      cell = '';
      separators++;
    } else cell += char;
  }
  if (!separators) return [];
  cells.push(cell.trim());
  if (text.startsWith('|')) cells.shift();
  if (text.endsWith('|') && cell === '') cells.pop();
  return cells;
}

export function readMarkdownTable(lines: string[], start: number) {
  const header = tableCells(lines[start] || '');
  const delimiter = tableCells(lines[start + 1] || '');
  if (!header.length || header.length !== delimiter.length || !delimiter.every(cell => /^:?-{3,}:?$/.test(cell))) return null;
  const alignments: TableAlignment[] = delimiter.map(cell => cell.endsWith(':') ? cell.startsWith(':') ? 'center' : 'right' : cell.startsWith(':') ? 'left' : undefined);
  const rows: string[][] = [];
  let end = start + 2;
  while (end < lines.length) {
    const cells = tableCells(lines[end]);
    if (!cells.length) break;
    rows.push(header.map((_, column) => cells[column] || ''));
    end++;
  }
  return {header, alignments, rows, end};
}
