# DeepSeek-derived harness upgrade — 2026-10-16

## Scope and upstream evidence

Reviewed DeepSeek Harness at `1517a4dbca0a2789ff1d41ba439600f8547d23fa`
(public HEAD when inspected), particularly:

- `packages/guard/repeat-tool-reminder/src/index.ts`: canonical argument identity,
  advisory thresholds 3/5/8, reset after user interjection.
- `packages/compaction/compaction-tool-result-pruner/src/index.ts` and `config.ts`:
  deterministic Unicode-safe head/middle/tail pruning and explicit omissions.
- `packages/compaction/compaction-basic/src/index.ts` and `region.ts`: measured
  pre-step pressure, preservation of paired tool groups, stable source spans.
- `packages/shell/bash-local/src/index.ts`: separate bounded stdout/stderr capture.

The existing Goal adaptation is already a separate upstream import; this change
neither replaces it nor imports another agent loop, permission system or session
store. Source hashes, MIT license and exact adaptation boundaries are in
`server/vendor/deepseek-harness/`.

## Findings and implemented changes

1. **Tail evidence lost by prefix-only truncation.** Long shell/HTML output could
   retain a large header but lose its final row count or error. Shared tool-result
   presentation and emergency context fitting now use the adapted Unicode-safe
   head/tail algorithm. Full observations remain durable; existing scope-checked
   artifact range reads retrieve omitted evidence. Surrogate pairs remain intact.
2. **Repeat detection depends on JSON insertion order and only identical success.**
   The existing exact-success observation guard remains. Additional run-local
   consecutive-call feedback recognizes deep key-equivalent arguments for all
   settled statuses. It is advisory at 3/5/8 and does not skip tool bodies or claim
   a task is complete. Different calls or consumed steering reset the chain.
   The existing three-identical-failure fence also canonicalizes arguments so key
   reordering cannot evade it. Unknown effects still stop without mutation replay.
3. **Large tool observations are reduced only after overflowing.** The canonical
   route-accounted request fitter now applies a model-free pruning pass above 80%
   input pressure to observations over 8,192 characters. It retains user messages,
   tool IDs, native call metadata and complete call/result groups. Existing bounded
   summary recovery remains the fallback. Pruning does not consume model requests.

Model-controlled argument text is not promoted into the system-role advisory;
only the call identity/count and trusted guidance are included. Reminders pass
through normal transcript checkpointing and shared input-budget checks.

## Validation and limits

- New tests: `test_harness_deepseek_context.js` and
  `test_harness_deepseek_runtime.js`, included in `npm run test:harness`.
- Extended `test_harness_progress.js`: nested argument order, changed polling
  results, denied attempts and bounded notices.
- Canonical runtime test: actual invocation receipts, three distinct executions,
  feedback arriving in the next provider request and unchanged failure fence.
- Context test: actual route accounting, preserved human input/IDs, head/tail,
  Unicode and artifacts. Existing artifact-range and uncertain-write tests pass.
- Full harness suite, existing Goal compatibility suite and frontend type check.

These are offline/provider-fixture checks. No live model quality, Google Sheets
accuracy, macOS/Windows sandbox parity or equality with DeepSeek Harness is
claimed. The current screenshot-driven issues also involve model choices and
runtime configuration, which these algorithms cannot guarantee. The package
structure, policy grants and backend project isolation remain authoritative.

## Review

The change is intentionally bounded to observed context and repetition failures.
Cancellation, shared budgets, scope and permission fences remain in the canonical
pipeline. No new service, dependency installation, implicit retry or model repair
pass is introduced. Remaining work for capability claims is live comparative
assessment with matched model route, prompt, source task and approval settings.
