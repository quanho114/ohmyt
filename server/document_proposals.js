export function registerDocumentProposals(registry) {
  registry.register({
    name: "document_propose",
    readOnly: true,
    exclusive: true,
    scopes: ["project", "standalone"],
    description:
      "Propose a complete replacement of a Markdown document from an explicit Document snapshot Reference. This tool does not read or write files. The user reviews before/after in the document sidebar and approves a protected save or saves a copy. Copy the exact Reference JSON from the user context; never invent a grant or version.",
    parameters: {
      type: "object",
      properties: {
        reference: {
          type: "string",
          description: "Exact JSON Reference from the Document snapshot",
        },
        content: {
          type: "string",
          description: "Complete proposed Markdown content",
        },
        summary: {
          type: "string",
          description: "Short description of changes",
        },
      },
      required: ["reference", "content", "summary"],
      additionalProperties: false,
    },
    execute: async ({ reference, content, summary }, context = {}) => {
      if (typeof reference !== "string" || reference.length > 4000)
        throw Error("Invalid document reference");
      const ref = JSON.parse(reference);
      if (
        !ref ||
        typeof ref !== "object" ||
        Array.isArray(ref) ||
        typeof ref.scope !== "string" ||
        ref.scope !== (context.sessionId || context.scope?.sessionId)
      )
        throw Error("Document proposal scope mismatch");
      if (
        typeof ref.grantId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(ref.grantId) ||
        typeof ref.path !== "string" ||
        ref.path.length > 1000 ||
        !ref.path.toLowerCase().endsWith(".md") ||
        ref.path.startsWith("/") ||
        ref.path.split(/[\\/]/).includes("..") ||
        typeof ref.version !== "string" ||
        !/^[a-f0-9]{64}$/.test(ref.version)
      )
        throw Error("Invalid Markdown reference");
      if (
        typeof content !== "string" ||
        Buffer.byteLength(content) > 2 * 1024 * 1024 ||
        typeof summary !== "string" ||
        summary.length > 1000
      )
        throw Error("Proposal exceeds document limits");
      return {
        kind: "document-proposal",
        reference: {
          grantId: ref.grantId,
          scope: ref.scope,
          path: ref.path,
          version: ref.version,
        },
        content,
        summary,
      };
    },
  });
}
