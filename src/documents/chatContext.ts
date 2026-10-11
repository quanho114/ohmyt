export interface ChatDocumentContext {
  key: string;
  name: string;
  text: string;
}
const start = "\n\n<ohmyt-document-context>\n";
const end = "\n</ohmyt-document-context>";
export function documentPrompt(
  prompt: string,
  contexts: ChatDocumentContext[],
) {
  if (!contexts.length) return prompt;
  return (
    (prompt || "Phân tích tài liệu đính kèm.") +
    start +
    contexts.map((c) => c.text).join("\n\n") +
    end
  );
}
export function visibleDocumentPrompt(prompt: string): {
  text: string;
  names: string[];
} {
  const index = prompt.indexOf(start);
  if (index < 0 || !prompt.endsWith(end)) return { text: prompt, names: [] };
  const body = prompt.slice(index + start.length, -end.length);
  const names: string[] = [];
  for (const match of body.matchAll(/^Reference: (\{[^\n]+\})$/gm)) {
    try {
      const ref = JSON.parse(match[1]);
      if (
        typeof ref.path !== "string" ||
        typeof ref.grantId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(ref.grantId) ||
        !/^[a-f0-9]{64}$/.test(ref.version)
      )
        return { text: prompt, names: [] };
      names.push(ref.path.split("/").pop() || ref.path);
    } catch {
      return { text: prompt, names: [] };
    }
  }
  return names.length
    ? { text: prompt.slice(0, index), names }
    : { text: prompt, names: [] };
}
