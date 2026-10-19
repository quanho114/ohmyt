# Chat and harness hardening — 2026-10-15

This is a checkpoint for the ongoing core-agent/chat work, not a claim that the broader Goal is complete. The working tree already contained extensive changes before this pass. Settings and other frontend features were not edited in this pass.

## Changes backed by failing regressions

- Nested-runtime cancellation now fences the actual tool body after asynchronous middleware. A cancelled child cannot start a mutation merely because its parent remains active.
- Agent shutdown waits for pending driver construction and disposes late resources exactly once. Handles enforce their owning session, clean up pause listeners, and drain sibling disposals even when one driver fails.
- Harness disposal continues ordered cleanup after driver errors, retains aggregate errors, and still attempts Cordis plugin cleanup.
- Chat control polling no longer overlaps slow polling requests. Queue actions invalidate earlier reads; leaving and returning to a chat invalidates the previous visit's responses.
- Inline answers reject duplicate submissions immediately. Late answers cannot trigger project continuation or modify busy state in a later chat visit. Polling failures clear on recovery; submission errors remain visible.
- Run streams retain native EventSource recovery. Historical and live frames carry IDs, and validated run-scoped `Last-Event-ID` cursors replay only missing events.
- API shutdown ends connected event streams and their sockets, releasing semantic listeners and allowing persistence/plugin shutdown to finish.

No new packages, workspace migration, alternate agent loop, or alternate authorization path were introduced.

## Validation

Passed during this pass:

- `npm run test:harness`, including upgrade/architecture acceptance, after the backend changes.
- `npm run test:goal` and `npm run test:tasks`.
- `npm run test:smooth-ui`.
- `node test/ui/test_run_controls_ui.js`, `node test/ui/test_task_workflows_ui.js`.
- `xvfb-run -a node_modules/.bin/electron --no-sandbox --ozone-platform=x11 test/harness/test_harness_controls_ui.cjs`.
- `node test/core/test_e2e_suite.js`, `node test/core/test_parallel_runs.js`.
- Targeted invocation, agent lifecycle, shutdown, replay and cleanup regressions.
- `npx tsc --noEmit`, `npm run build`. Build retains the existing large-chunk warning.

The new backend tests are included in `test:harness`; control UI regressions are included in `test:harness:ui`, and stream reconnection is included in `test:smooth-ui`.

Live conversation evaluation was attempted using the repository's read-only configuration path and disposable fixtures. All nine cases failed before model output because the configured provider was unreachable. That run provides no model-quality evidence. Its report is outside the repository at `/tmp/ohmyt-goal-eval-vbSfBy/conversation.json`.

The standalone `test/core/test_e2e_http.js` requires a daemon on port 3188, which was absent; the self-contained E2E suite passed instead. The full optional Browser Use suite and full Electron Settings suite were not run. Offline/provider fixtures validate control behavior, not live reasoning quality or other operating systems.

## Self-review of this checkpoint

| Axis | Score | Evidence and remaining gap |
|---|---:|---|
| Accuracy | 4/5 | Boundary regressions and matching suites pass; live model behavior remains unverified because the provider was unreachable. |
| Completeness | 4/5 | Cancellation, admission, cleanup and chat recovery are covered for this batch; the user's ongoing improvement Goal remains active. |
| Clarity | 4/5 | Behavior, regression commands and limits are recorded; this checkpoint does not include a visual walkthrough. |
| Actionability | 4/5 | Changes are in the working tree with runnable regressions; pre-existing edits require care when reviewing or committing the combined diff. |
| Conciseness | 4/5 | Runtime changes reuse current seams and add no dependencies; async browser regressions need dedicated fixture files. |

Overall: 4.0/5. Next useful evidence is a successful isolated live-provider evaluation when that provider is available, followed by review of the actual answers. Self-check: the user should be able to verify the concrete reliability fixes without interpreting them as proof that overall agent quality is solved.

## Round 2 — usable evidence and truthful chat results

Additional changes:

- Shared activity mapping carries canonical unknown tool outcomes into live events and saved messages. Both chat tool renderers show a readable warning instead of a completed checkmark or a confirmed-failure label. Historical `TOOL_OUTCOME_UNKNOWN` output is handled too.
- Stopping a run after a durable tool body-start event immediately saves that tool as unknown, rather than claiming it was blocked before execution.
- Child-list API responses expose the existing task outcome separately from execution status. Chat labels partial, blocked, failed and unverified child results in Vietnamese and English. A child returning normally after cancellation keeps its cancelled lifecycle state.
- Added read-only `artifact_read` through the existing artifact plugin and canonical invocation service. It pages through this chat's artifacts with bounded ranges and intact Unicode pairs. Truncated observation markers explain how to inspect relevant ranges. A real driver regression recovers the tail of a long observation through two artifact reads while its source tool executes once.
- Acceptance source fingerprints now include `shared`, where the host/client activity contract lives.

Round 2 validation: `npm run test:harness` (including acceptance), `npm run test:goal`, `npm run test:tasks`, `npm run test:smooth-ui`, the run-controls and task-workflow browser tests, targeted child-outcome/uncertain-write/aborted-activity/artifact-range tests, type check and build passed. The unknown-result UI was also inspected at 390px width without horizontal overflow; browser regressions verify its readable warning and VI/EN child labels. One browser fixture startup race was corrected by waiting safely for its fixture global.

The live-provider limitation from round 1 remains; no repeat live run was needed for these control-path changes. No additional frontend functions outside chat were edited. Settings remain outside the scope of this work.

Self-review of this round: accuracy 4/5 (regressions and production-driver paths pass; live model use of the new reader is not verified), completeness 4/5 (this batch closes the identified evidence and presentation gaps; the broader Goal continues), clarity 4/5 (warning is readable and bilingual labels are tested; no full product walkthrough), actionability 4/5 (changes and regressions are ready for review amid the pre-existing dirty tree), conciseness 4/5 (existing plugin, outcome and invocation seams were reused). Overall 4.0/5. The next review should examine the chat's transition from requested cancellation to actual tool drain, and confirm that polling cannot rediscover an aborted run as new work.

## Round 3 — stop, drain and queued replies

The actual Electron application reproduced repeated subscriptions to an aborted run while its tool body was still draining (three stream subscriptions instead of one). Controls now distinguish terminal runs that retain session ownership: `stopping` for aborted runs and `settling` for completed/failed runs still cleaning up. Discovery does not reattach those runs. The composer keeps accepting queued text while ownership remains, disables repeated stop requests, and shows a finishing label. When polling observes ownership clear, chat refreshes saved messages so a queued reply that finishes between polls is still displayed.

Validated with the new actual-application regression `test/ui/test_chat_stop_drain_ui.cjs`: one subscription to the stopped run, unknown tool effects retained, new input queued until body drain, one original body execution, and the next reply visible in the application. This regression is included in `test:harness:ui`.

Also passed: `npm run test:harness` including upgrade/acceptance, `node test/ui/test_run_controls_ui.js`, send-now/inbox replacement regressions, aborted-tool activity regression, the existing Electron harness-controls test, `npx tsc --noEmit`, `npm run build`, and `git diff --check`. The existing build chunk warning remains. No live-provider claim is added.

Self-review: the concrete stop/queue issue is implemented and checked at the backend, browser-hook and actual Electron chat boundaries. Broader model quality is still unverified for the reason recorded above. The user requested pausing after this step; this checkpoint finishes that step and preserves the working tree for later continuation. No commit was created.
