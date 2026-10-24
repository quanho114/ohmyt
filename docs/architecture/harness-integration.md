# Harness integration in ohmyt

Updated 2026-10-09. Architectural reference: [DeepSeek research](../reports/deepseek-harness-research.md). Implementation follows the [full plan](../superpowers/plans/2026-10-09-harness-full.md); verification and limits are in [validation](../reports/harness-full-validation.md).

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

Resuming a durable goal derives a recovery handoff from the semantic log of the round that ended before it: tool intents left without a result (crash) and results recorded as unknown (abort mid-body) are listed in the next round's pinned goal context with an explicit never-replay warning. The handoff is derived per resumed round, covers both restart recovery and resuming a blocked goal, and clean round chains inject nothing. `test_goal_recovery_handoff.js` covers the restart path, the named unresolved action and the clean-chain negative.

Tool completion notifications include canonical `executionStatus` alongside the compatibility `success` boolean. Saved and live chat activity preserve `unknown` outcomes, including cancellation after a durable body-start event, and warn the user to inspect external state before retrying. Older activity with `TOOL_OUTCOME_UNKNOWN` is rendered the same way. Child-list responses include their existing task outcome separately from run status, so a finished child can still be partial, blocked or unverified.

An unknown result also fences the canonical invocation service for the rest of
that run, including PTC RPCs whose JavaScript catches the error. The actual body
boundary rechecks the fence after approval/middleware waits and before consuming
budget. Already-running bodies are drained; they are not rolled back. Final task
outcomes and host verifiers include all canonical results, including nested RPCs,
so a successful program wrapper cannot erase an unresolved child call. Host-shell
timeouts and signal interruption after launch return `TOOL_OUTCOME_UNKNOWN` with
their observed process output instead of an ordinary retryable tool failure.
Regression: `node test/harness/test_harness_uncertainty_fence.js`.

Oversized tool observations retain a scoped full-output artifact. The read-only `artifact_read` tool reads at most 4,000 UTF-16 code units per call from the current chat's artifacts, preserves surrogate pairs, and returns a continuation offset. It uses canonical authorization, budgets and receipts, cannot read another chat's artifacts, and avoids repeating the source operation to recover omitted evidence.

Message/session deletion cascades anchored semantic records, artifacts and child sessions, including steering text in compatibility snapshots. Session sequence never rewinds; deletion revision forces clients to refresh their projection. Whole-chat deletion aborts and drains active work first; message truncation requires an idle session.

Before first semantic migration of a populated file DB, the session store creates `<dbPath>.before-harness-v1.backup` using `VACUUM INTO` and restrictive permissions. This backup precedes semantic migration, but other additive application schema initialization has already run. Preserve a separate pre-upgrade copy of the complete data directory for application rollback. Do not downgrade schema destructively; legacy snapshot read compatibility alone does not guarantee an old binary supports all new UI/config data.

## Extension boundaries

Local plugins are trusted application code. Their metadata cannot grant authorization. Core policy services and connector-owned plugins cannot be disabled through general Settings. Only idle runtime changes are allowed; revision conflicts require reloading. Registered driver/provider factories must honor cancellation, persistence and cleanup contracts. Arbitrary DSH client bundles, external subagent providers and OAuth flows are not implemented.

Agent handles enforce their admitted session identity. Shutdown drains driver construction before disposing its resources; a driver that finishes construction after shutdown begins is never admitted. Driver cleanup errors are collected after sibling cleanup settles, and do not skip later harness/plugin cleanup. Pause/resume removes its temporary cancellation listeners. The final tool-body boundary checks the combined parent and nested-runtime cancellation signal, including cancellation while middleware waits. A cancelled call whose body never started does not consume a tool budget or receive a body-start receipt.

Chat controls keep at most one polling request in flight per visit. Queue mutations invalidate older reads; changing chats and returning creates a new visit, so delayed responses from the earlier visit cannot restore stale controls. Regressions: `node test/harness/test_harness_agents.js`, `node test/harness/test_harness_invocation.js`, and `node test/ui/test_run_controls_ui.js` (requires Chrome).

Controls distinguish aborted runs still draining (`stopping`) and completed/failed runs still cleaning up (`settling`) from active model work. Chat discovery does not resubscribe to those terminal runs. The composer keeps new text on the durable queue while the session remains owned, disables repeated stop requests, and refreshes saved messages when ownership clears, including queued replies that finish between polls. The actual Electron regression is `test/ui/test_chat_stop_drain_ui.cjs`.

Steering accepted after the last safe step boundary is retained as a queued human
turn when the current run settles without cancellation. Its ID, content and queue
order remain unchanged, and `control/updated` records the transition before normal
queue dispatch. Explicit stop/shutdown cancels pending steering with a semantic
event and never restarts work. Restart recovery remains disarmed. Regression:
`node test/harness/test_harness_late_steering.js` exercises API admission, final-stream
timing, exactly-once continuation and explicit cancellation.
An immutable submission fingerprint keeps the original request idempotent after
mode conversion or consumption. Retrying its client message ID returns the same
item without interrupting goals or dispatching another run; changed submission
bytes remain a collision. The fingerprint column is an additive inbox migration.

Inline human answers also belong to a chat visit: repeated submissions are gated immediately, and responses from a previous visit cannot trigger project continuation or clear current pending state. Transient run-stream disconnects use native EventSource reconnection. Both historical and live frames carry stable run event IDs; `Last-Event-ID` resumes after that event and rejects malformed or foreign-run cursors. Regressions: `node test/core/test_run_stream_replay.js` and `node test/ui/test_run_stream_ui.js` (Chrome).

API shutdown ends open event-stream responses and their sockets after stopping admission; connected chats cannot indefinitely block persistence/plugin cleanup. Semantic stream listeners are removed when those responses close. Regressions: `node test/ui/test_chat_stream_shutdown.js` and `node test/harness/test_harness_cleanup.js`.

MCP reconnect is explicit after app restart. Stdio commands are executed directly without a shell. Remote content is untrusted tool output. HTML/SVG documents in the artifact pane use a script-disabled sandbox; interactive previews retain the existing separate preview workflow.

## Operational limits

The default tokenizer is an estimate, not exact provider token accounting. Summarization is one bounded request; oversized older history can fall back to explicit omission rather than an unbounded summarization chain. Partial model responses are not retried. Model budgets are shared with child, summary and approval requests.

PTC requires Linux x64, bubblewrap, prlimit and a native Node executable; Electron itself cannot fit the isolated address-space limit. Failed platform/probe checks expose an unavailable state. VM contexts are not the security boundary. PTC limits include 30-second wall/CPU timeout, 64 MiB Node heap, 2 GiB address space, 1 MiB output and 20 sequential tool calls.

See validation for reproducible checks, live-model results and remaining release gates.

## Adaptive turn budget

Normal turns default to `maxSteps: 0` and `browserMaxSteps: 0`: no fixed tool-round cutoff. Positive preset values retain explicit per-turn round limits; browser zero inherits the current round policy. `maxRequests: 100` and `maxToolCalls: 100` bound root work, with the same budget object shared by children, summary requests and approval review. Goal rounds retain their existing durable shared budgets. For budgets greater than three requests, three remaining requests trigger a tool-free partial conclusion (headroom for summaries/recovery, not a reservation against concurrent children). Exhaustion still fails closed at request/tool admission. No automatic tool mutation replay is added.

Token, wall-clock and cost caps share the same budget object. `maxOutputTokens` (default 1,000,000) and `maxRuntimeMs` (default 3,600,000, measured from the first admitted request, process-local) are enforced at new model-request admission: an over-cap run receives one granted conclusion request and the driver turns the next loop boundary into a tool-free final conclusion, while tool calls already admitted by the current step still complete to avoid unresolved side effects. Goal budgets fold in the same caps, settle as `limit_exhausted` when over, and refuse resuming or reserving rounds while over. Recorded token totals survive restarts through persisted attempts; the wall clock restarts with the daemon. Providers that never report usage degrade the token cap to no enforcement. `budgetCostRates: {inputPerMTok, outputPerMTok}` (host config) enables `estimatedCost` in budget snapshots. `test_run_budget_limits.js` covers the caps, graceful conclusion, goal settlement and config validation.

Three consecutive batches of identical failed calls/results stop further effects; successful calls and changed recovery strategies reset that counter. Existing malformed-call, permission denial, unknown-outcome, browser-stall and cancellation fences remain. This is not proof of semantic progress: varied failures may continue until the shared budget is reached. `test_tool_budget.js` covers >5 rounds and repeated failure; `test_adaptive_tool_budget.js` covers shared request/tool exhaustion and partial outcomes; explicit-limit activity tests remain in force.

`test_final_conclusion.js` and `test_final_tool_recovery.js` run the production
harness with an explicit five-step configuration, rather than assuming that the
default adaptive budget has a five-step cap. They cover empty-output recovery,
paired final-turn rejections without body execution, and ordinary conversational
or translated replies that must not trigger lexical retries. Anthropic streaming
uses incremental UTF-8 decoding; `test_anthropic_stream_unicode.js` splits every
byte boundary of Vietnamese text, emoji and native tool arguments.
Host and workspace shell stdout/stderr also decode incrementally;
`test_shell_unicode.js` exercises both real process providers with split UTF-8
writes. Their existing output bounds and process cleanup remain in force.

## Active-turn context pressure

If ordinary old-turn compaction and tool-output fitting still exceed the input budget, the host summarizes a complete settled prefix of the current turn through the existing bounded, tool-free summary service. All user messages (including steering and document context) remain verbatim. Normally the latest two assistant/tool groups remain verbatim too. If those groups alone prevent fitting (for example, one large `html_preview` argument), a bounded fallback summarizes the complete settled active span, retaining literal bounded tool observations and call identifiers alongside the summary. Native call arguments and thought signatures are never edited in place. Incomplete tool groups cannot be compacted. The resulting request is counted again including fixed prompts and schemas; it still fails closed if it cannot fit. Source messages/events are not changed, tool bodies are not replayed, and a `context/summary` checkpoint records the method, source count and digest. This is a semantic summary rather than exact request replay.

Regression: `node test/harness/test_harness_active_compaction.js` covers active overflow through real host request admission, shared-budget summary calls, pinned user/steering/latest results and immutable source. `test_harness_request_budget.js` covers incomplete groups and invalid summaries. `node test/harness/test_harness_large_current_tool.js` reproduces a single large HTML preview through admission, driver and tool invocation, checking completion without tool replay and preservation of full source/native metadata. This does not make arbitrarily large current user input or tool schemas fit, and is not evidence that a particular Excel file has been modified successfully.

## Focused file work and progress retention

Active-turn summary projections are cached in the run context against the exact source prefix. Appending a new step reuses that prefix until context pressure requires further compaction; edits invalidate it. Durable transcript events remain the source of truth. This avoids a new full-prefix summary request on every tool step.

The current-request prompt instructs the model to work on the specified file, batch relevant inspection, retain formatting, ask the human for missing personal facts and leave unrelated fields unchanged. It explicitly rejects home-directory/personal-document discovery without a human request and system Python bypass installs. These are model instructions, not a replacement for backend filesystem/approval authorization: host shell retains its existing authorized capabilities. The host cannot infer arbitrary shell file access reliably from command text.

A run-local progress observer detects three identical successful results for the exact same tool name and arguments, then injects a progress notice. Changed evidence resets the count. It neither replays nor suppresses mutations and does not claim that varied shell scripts are semantically equivalent. Existing repeated-error stopping, shared budgets, scope and cancellation remain enforced. Fixture regressions prove these control paths, not live model obedience or guaranteed quality on arbitrary files.

### Active-summary overflow recovery (2026-10-16)

A completed tool span may still exceed the input budget after summarization:
the generated summary and the literal observation appendix both consume space
alongside pinned human messages, fixed instructions and tool schemas. Emergency
compaction now bounds observation preview text to 1,200 characters across the
span (up to 450 per observation, plus identifiers and explicit truncation notes).
Full receipts remain in durable history. If the resulting request still exceeds
the route-counted budget, the host fits only the generated summary text, with an
explicit omission notice. A trusted summary index distinguishes generated text
from human messages that happen to resemble summary markers. Human input,
steering, tool identities/schemas and native replay data are never shortened by
this fallback. No tool is replayed. If pinned data and receipt identifiers still
cannot fit, the request continues to fail closed.

Validation: request-budget and active-compaction regressions include oversized
model summaries, preserved literal observations, spoofed summary markers,
cancellation, tokenizer failures and irreducible schema overflow. The harness
suite and uncertain-write regression pass with offline providers. This does not
verify a live Google Sheets fetch or the screenshot's remote runtime state.

### Website routing versus data fetching (2026-10-16)

The native-browser routing guard identifies shell command words rather than
matching `open` anywhere in a shell string. Quoted Python source containing file
`open()` or `urllib.request.urlopen()` no longer counts as launching an external
browser. CSV downloads and other fetches proceed to the existing permission
pipeline; they are not automatically authorized. Explicit OS browser launchers,
quoted executable paths, chained commands and common shell `-c` wrappers retain
the embedded-browser routing rule. This guard is a routing aid, not a replacement
for sandboxing or authorization. Browser-routing and permission regressions cover
both the false-positive fetch case and retained scoped denials.

### DeepSeek-derived context and repeat-call upgrades

See [the implementation and validation record](deepseek-harness-upgrade-2026-10-16.md)
and `server/vendor/deepseek-harness/README.md` for source pinning and boundaries.
Shared tool previews preserve Unicode-safe head/tail evidence. Route fitting
prunes large observations at 80% input pressure before summary recovery. The
existing driver adds advisory canonical repeat feedback and retains all execution,
permission, cancellation and unknown-outcome fences. It does not replace the
agent loop or authorize effects based on plugin/source metadata.

### Repeated active-compaction identity fix (2026-10-16)

A generated active-summary message uses the provider user role for untrusted
context. That role alone must not classify it as a human input during subsequent
compaction. Previously, a reused checkpoint could be pinned as human input in the
next checkpoint, accumulating generated summaries until even the minimum request
could no longer fit. Active summaries now carry a private process-local symbol;
subsequent active compaction replaces them rather than retaining them with actual
human input. Spread copies used by summary fitting preserve the identity; JSON
serialization/model adapters do not expose the symbol. The marker is not inferred
from user-visible text and cannot be impersonated by a user string. Durable source
history and call/results remain unchanged. Checkpoint reuse remains process-local.

The active-compaction regression now performs successive oversized summaries with
new settled tool batches, asserts exactly the two human inputs plus the latest
checkpoint, and verifies continued requests under the same bounded input window.
It reproduced CONTEXT_BUDGET_EXCEEDED before the fix and passes afterward. Live
Google Sheets/model behavior on the screenshot runtime remains unverified.

### Follow-up admission before auxiliary summarization (2026-10-16)

A short follow-up may inherit large completed tool observations. Previously,
old-history pressure triggered model summarization before deterministic request
fitting, so a normal lookup could silently wait for several auxiliary requests.
At the first step of a follow-up with older history, the host now first fits the
complete conversation with currentTurnStart=0 (no whole-turn removal). If pruning
observations makes it fit the route-accounted budget, no history summary is needed.
If not, existing bounded summarization and overflow recovery still apply. Fixed
instructions, schemas, human messages and call identities remain pinned; the
original source is not mutated. This does not impose a new provider timeout.

The new follow-up regression observed eight auxiliary summaries before this fix
and none afterward for a fixture CSV history, with one main request and an
unchanged durable source. Logs from the reported runtime showed attempt/start
purpose=summary with ~18,375 estimated input tokens and no subsequent main request
at inspection time; a live provider completion was not available to verify.

### Reusable history and bounded source lookup

[Document performance record](document-lookup-performance-2026-10-16.md) describes
validated prefix-summary reuse, query/range retrieval for scoped document
snapshots and artifacts, context preview limits and the measured fixture results.
These share the existing stores/invocation pipeline and preserve current source
references rather than introducing a global document cache or mutation replay.

### Composer context meter

The composer shows the latest main request's input accounting, not cumulative
billing usage or the full stored transcript. Request attempts persist the applied
context window (the smaller of harness configuration and declared model window),
response reserve, route identity and token counter accuracy. The existing scoped
inbox response exposes only these numbers from the latest main attempt; summary
and child requests do not replace the meter. Legacy attempts without limits and
model selection mismatches show unavailable data. Estimates are labeled. The meter
updates on the existing controls poll and does not issue model requests. Draft text
and output generated since that request are not included.

Validation: `node test/harness/test_harness_context_usage.js` and
`node test/ui/test_context_meter_ui.js` cover session isolation, latest-request rather
than cumulative usage, legacy data, model mismatch, keyboard dismissal and narrow
viewport bounds.

The application default context budget and new-preset starting value are now
100,000 tokens (response reserve remains 4,000). Explicit saved presets are
preserved. The declared model window still caps the effective budget when it is
smaller; this is a harness allowance, not a claim about an unknown model's native
capacity. `node test/harness/test_harness_context_default.js` covers the default and both
smaller/larger declared model windows through the request pipeline.
