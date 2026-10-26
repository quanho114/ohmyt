// Display adapter for old denial messages. Never execute the embedded source.
export function legacyToolError(text: string) {
  const prefix = 'Lỗi: Chính sách hệ thống từ chối thực thi công cụ "html_preview" với mục tiêu: "';
  if (!text.startsWith(prefix)) return null;
  const end = /" \(Policy: [^\r\n)]*\)/g;
  end.lastIndex = prefix.length;
  let match: RegExpExecArray | null;
  while ((match = end.exec(text))) {
    const source = text.slice(prefix.length, match.index);
    if (!/^\s*(?:<!doctype html\b|<html\b)/i.test(source)) continue;
    return { tool: 'html_preview', source, after: text.slice(end.lastIndex) };
  }
  return null;
}
