// Display-only repair for common sentence starts in prose. Keep technical tokens intact.
export function spaceProseSentences(text: string): string {
  return text.replace(/\S+/gu, token => {
    if (/[\/@\\:]/u.test(token) || /^(?:\.{1,2}|[A-Z](?:\.[A-Z])+\.?)$/u.test(token)) return token;
    return token.replace(/([\p{L}\p{N}])[.!?](?=(?:Tôi|Tui|Mình|Tác|Bạn|Đây|Đó|Ngoài|Trong|Vì|Nếu|Nhưng|Kết|Theo|Có|Không|The|This|That|We|You|It)(?:[.!?,;:]|$))/gu,
      match => match + ' ');
  });
}
