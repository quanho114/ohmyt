# Harness integration in ohmyt

Updated 2026-10-09. Architectural reference: [DeepSeek research](deepseek-harness-research.md). Implementation follows the [full plan](../superpowers/plans/2026-10-09-harness-full.md); verification and limits are in [validation](harness-full-validation.md).

This is an ohmyt implementation using real `@deepseek-ai/cordis@4.0.4`. It does not import the DSH application or promise binary compatibility with DSH plugins. Existing browser, model providers, approval policy, SQLite and React surfaces remain integrated.

| Layer | Implemented behavior |
|---|---|
| Host and agents | Effect-owned plugin lifecycle, validated manifests, driver registration, per-session admission, cancellation and drain |
| Semantic sessions | Durable typed events, monotonic session sequence, projections, paginated replay, deletion revision, legacy transcript migration |
| Requests | Attempt records, bounded retries only before any model output, verified canonical assistant/tool protocol |
| Tools | AJV schemas, policy and approval before execution, immutable actual execution receipt, read-only observers; opt-in parallel reads with resource conflicts |
| Context | Tokenizer registry with estimated default, bounded request fitting, settled-turn summaries, current turn including steering preserved |
| Controls | Durable queue and steering, edit/cancel, pause/resume at safe boundaries, rediscover active runs |
| Profiles | Validated YAML, revision checks, global/project/session layering, inherited child configuration and plugin selection |
| UI | Existing Settings list/detail, presets, connector forms, composer controls, pending messages, child activity, artifact pane, diagnostics, trusted contribution slots |
| Children | In-process child agents, narrower capabilities, shared request budget, bounded depth/concurrency, parent drain and lineage |
| MCP | Official SDK stdio and HTTP; guarded fixed-origin egress, bounded catalog including resources, explicit connect/disconnect and encrypted token references |
| PTC | Linux x64 bubblewrap/prlimit/seccomp process isolation; no host network/home/project access; approved sequential tool RPC |

## Persistence and recovery

Semantic events and projections are authoritative for new turns; legacy `harness_turns` snapshots remain for compatibility. Tool intent is written before execution. A durable completed receipt restores known results; a missing receipt becomes an explicit unknown outcome on restart. Recovery never replays mutations. Startup closes interrupted runs.

Message/session deletion cascades anchored semantic records, artifacts and child sessions, including steering text in compatibility snapshots. Session sequence never rewinds; deletion revision forces clients to refresh their projection. Whole-chat deletion aborts and drains active work first; message truncation requires an idle session.

Before first semantic migration of a populated file DB, the session store creates `<dbPath>.before-harness-v1.backup` using `VACUUM INTO` and restrictive permissions. This backup precedes semantic migration, but other additive application schema initialization has already run. Preserve a separate pre-upgrade copy of the complete data directory for application rollback. Do not downgrade schema destructively; legacy snapshot read compatibility alone does not guarantee an old binary supports all new UI/config data.

## Extension boundaries

Local plugins are trusted application code. Their metadata cannot grant authorization. Core policy services and connector-owned plugins cannot be disabled through general Settings. Only idle runtime changes are allowed; revision conflicts require reloading. Registered driver/provider factories must honor cancellation, persistence and cleanup contracts. Arbitrary DSH client bundles, external subagent providers and OAuth flows are not implemented.

MCP reconnect is explicit after app restart. Stdio commands are executed directly without a shell. Remote content is untrusted tool output. HTML/SVG documents in the artifact pane use a script-disabled sandbox; interactive previews retain the existing separate preview workflow.

## Operational limits

The default tokenizer is an estimate, not exact provider token accounting. Summarization is one bounded request; oversized older history can fall back to explicit omission rather than an unbounded summarization chain. Partial model responses are not retried. Model budgets are shared with child, summary and approval requests.

PTC requires Linux x64, bubblewrap, prlimit and a native Node executable; Electron itself cannot fit the isolated address-space limit. Failed platform/probe checks expose an unavailable state. VM contexts are not the security boundary. PTC limits include 30-second wall/CPU timeout, 64 MiB Node heap, 2 GiB address space, 1 MiB output and 20 sequential tool calls.

See validation for reproducible checks, live-model results and remaining release gates.
