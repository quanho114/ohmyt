export interface DocumentProposal {
  kind: "document-proposal";
  reference: { grantId: string; scope: string; path: string; version: string };
  content: string;
  summary: string;
}
export function parseDocumentProposal(value: unknown): DocumentProposal | null {
  try {
    if (typeof value === "string") value = JSON.parse(value);
    if (!value || typeof value !== "object") return null;
    const p = value as DocumentProposal;
    if (
      p.kind !== "document-proposal" ||
      typeof p.content !== "string" ||
      p.content.length > 2 * 1024 * 1024 ||
      typeof p.summary !== "string" ||
      !p.reference ||
      !["grantId", "scope", "path", "version"].every(
        (k) =>
          typeof (p.reference as unknown as Record<string, unknown>)[k] ===
          "string",
      )
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
