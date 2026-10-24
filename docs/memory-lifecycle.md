# Memory lifecycle

Memories are SQLite rows with a full lifecycle: `save → (supersede)* → forget`, plus optional expiry. The `memories` table keeps superseded and forgotten rows for provenance — search simply filters them out, so nothing is silently rewritten or erased.

## Rules

- `memory_save` accepts `supersedes` (id of the memory being replaced) and `ttlDays` (1–3650). A superseding entry bumps `version` (previous version + 1) and marks the old row `superseded_by`/`superseded_at`. A memory can be superseded only once.
- `memory_forget` soft-deletes by id (`forgotten_at`): the row stays for audit, search never returns it. Scope rules match `memory_search`: project memories are project-private; personal (`standalone:*`) memories are shared across the assistant's chats and can be forgotten from any of them; a different assistant cannot forget another assistant's memory.
- `memory_search` returns only live entries: not superseded, not forgotten, not expired (`expires_at`). Results carry provenance (`source`, `version`, `createdAt`).
- Search is SQLite FTS5 — lexical, not semantic. Sub-lexical recall is out of scope until a benchmark justifies embeddings.

## Gates

- `memory_forget` is part of the project boundary whitelist and follows the same permission flow as the other memory tools.
- Tests: `test/core/test_memory_lifecycle.js` (lifecycle, lineage versions, expiry, soft forget, assistant/scope isolation, project gating) and `test/core/test_personal_memory.js` (cross-chat recall, persistence, boundaries).
