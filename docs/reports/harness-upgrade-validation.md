# Harness upgrade validation — 2026-10-11

Implemented A1–A3, B1–B2, C1–C3 on codex/harness-full, baseline HEAD 767007345c7a3c41cefe49f17668618eafb7fd16. Changes remain uncommitted alongside pre-existing work.

## Behavior

- ToolInvocationService resolves admitted server scope and capabilities, validates/freeze arguments, authorizes once, runs deny-only guards, records intent and canonical receipt, deduplicates call IDs and drains tool bodies before resource disposal. Direct model calls, PTC and production browser delegation share it. Abort while middleware waits checks again at actual body entry; never-started body is cancelled, uncertain started body is unknown.
- Semantic history imports preserve message identity and SQLite cascade anchors; dry run compares without writing. A completed coverage marker selects the semantic projection. Corrupt markers fail validation; uncovered sessions retain compatibility history. Tool receipt overrides contradictory protocol results. Final assistant, turn end, UI mirror and run status commit atomically, with semantic publication after commit.
- Workspace/browser/web/memory groups, subagent forwarding and artifacts have extracted plugin factories. Plugin reload preserves ownership and removes listeners. Children retain scope, capability subset and shared budgets; default driver remains replaceable.
- Request envelope uses route token counters for system/messages/tool schemas and image allowance. Old whole turns can be removed, observations explicitly shortened, current input/protocol preserved. Overflow has CONTEXT_BUDGET_EXCEEDED. Counters disclose accuracy/source and counter errors do not silently downgrade.

## Verification

New behavior tests were observed RED then GREEN. Final commands passed:

- npm test (includes existing harness suite plus new acceptance runner).
- npm run test:harness:upgrade — 10 deterministic offline scenarios; no paid provider calls.
- npm run build — existing large-chunk warning remains.
- Electron/Xvfb: test_session_switch_ui.cjs, test_browser_chrome_ui.cjs, test_browser_page_motion.cjs, test_browser_chat_pane.cjs.
- git diff --check.

Session UI test recorded zero blank frames. Page motion passed one viewport resize per transition and snapshot cleanup. Toolbar motion/address input passed on the sequential rerun; an earlier concurrent run failed native input focus. Environmental GPU/cache messages occurred in headless Electron.

Fresh reviewer found the delayed-abort race; fixed with a regression test. Reviewer then hit its usage limit; remaining final review was performed by the implementer. No model-quality benchmark was run, so no claim of higher agent quality or speed.

## Implementation decisions

- Existing dirty feature checkout was preserved with a file baseline; no commits were made because harness files and dependencies were already untracked/modified. Review must include workspace changes, not HEAD alone.
- BrowserIntegration without a harness retains its standalone legacy adapter; production createDaemon uses canonical invocation. Standalone adapter persistence remains its prior behavior.
- Import adds semantic messages plus cutoff marker instead of rewriting old events; this costs one extra history copy, preserving compatibility rows and deletion anchors.
- Existing final no-tools protocol recovery makes bounded-loop requests seven for five tool steps. Updated stale test expectations (including denied-result count), retaining zero-execution assertions.

## Migration and rollback

Before writing populated file DB history imports, a mode-0600 .before-harness-history-v1.backup is created; initial legacy migration also preserves .before-harness-v1.backup. Dry-run is SessionStore.migrateHistory(sessionId,{dryRun:true}); repeated successful migration does not append messages. No tables/columns are dropped.

Stop daemon before restoring a backup. Preserve current DB and WAL/SHM together, then restore the chosen SQLite backup and use compatible code. Older readers retain messages/messages_json mirrors; backups are the recovery point if reverting the semantic migration. Tests use temporary databases; production data was not manually edited for this task.
