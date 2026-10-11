/** Plain text for conversation summaries, without rendering untrusted markup. */
export function topicPreview(source: string): string {
  return source
    .replace(/```[^\n]*\n[\s\S]*?(?:```|$)|~~~[^\n]*\n[\s\S]*?(?:~~~|$)/g, ' [Đoạn mã] ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<https?:\/\/([^>]+)>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/(^|\n)\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/g, ' ')
    .replace(/(`+)(.*?)\1/g, '$2')
    .replace(/\*\*([^]*?)\*\*|__([^]*?)__|~~([^]*?)~~/g, (_match, bold, underline, strike) => bold ?? underline ?? strike)
    .replace(/\*([^*\n]+)\*|\b_([^_\n]+)_\b/g, (_match, star, underscore) => star ?? underscore)
    .replace(/\s+/g, ' ')
    .trim();
}

export function topicDate(timestamp: number, now = new Date()): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Hôm nay';
  if (date.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
