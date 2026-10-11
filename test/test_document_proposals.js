import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ToolRegistry } from "../server/tools.js";
import { PermissionEngine } from "../server/permissions.js";
import { AppDatabase } from "../server/db.js";
const db = new AppDatabase(":memory:");
try {
  const tools = new ToolRegistry(db);
  const tool = tools.get("document_propose");
  const ref = {
    grantId: randomUUID(),
    scope: "chat-a",
    path: "notes.md",
    version: "a".repeat(64),
  };
  const args = {
    reference: JSON.stringify(ref),
    content: "# Proposed",
    summary: "Change heading",
  };
  const proposal = await tool.execute(args, { sessionId: "chat-a" });
  assert.equal(proposal.content, "# Proposed");
  assert.equal(tool.readOnly, true);
  await assert.rejects(
    tool.execute(args, { sessionId: "chat-b" }),
    /scope mismatch/,
  );
  for (const path of ["../outside.md", "/outside.md", "file.xlsx"])
    await assert.rejects(
      tool.execute(
        { ...args, reference: JSON.stringify({ ...ref, path }) },
        { sessionId: "chat-a" },
      ),
    );
  const permissions = new PermissionEngine(db);
  const scope = { projectId: "p", scopeId: "project:p", approvalMode: "ask" };
  assert.equal(
    permissions.evaluate("document_propose", "", scope).action,
    "ALLOW",
  );
  db.setPolicy("document_propose:*", "DENY");
  assert.equal(
    permissions.evaluate("document_propose", "", scope).action,
    "DENY",
  );
  assert(tools.forWorkspace(process.cwd(), scope).get("document_propose"));
  assert(tools.forStandalone({ sessionId: "chat-a" }).get("document_propose"));
  console.log(
    "Document proposals: scoped read-only tool, path/type validation, project/standalone registration and permission denial passed",
  );
} finally {
  db.close();
}
