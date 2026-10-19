# Goal upstream integration validation — 13/10/2026

Base: `e250a3b`, local `main` after merging `dev`. DeepSeek source:
`d743267388641bc76f17c45ce8b4c231aed1d32c`. Changes are uncommitted.

## Result

Imported MIT lifecycle methods and strict fold, round/wrap-up renderers and
command parser. ohmyt's adapter commits compatible SQLite snapshots; runtime
activation stays process-local. See `server/vendor/deepseek-goal/README.md` for
source provenance and the explicit departures from upstream's full runtime.

Terminal updates use a closing request without tools and an invocation fence
covering same-batch/nested calls. Scope-denial classification takes priority.
The final turn must commit before model-reported completion settles. Pending
user input pauses immediately; unfinished legacy plans request review rather
than silently becoming complete. Failed local Goal mutations are ordinary
errors rather than uncertain external effects. Recovered argument/revision
errors do not block the already-resolved objective.

UI uses live run state to animate checklist steps, and safely renders blocked
steps from older v2 snapshots. Human control commands go through the API without
becoming new model objectives; character-by-character typing is covered.

## Checks

| Check | Result |
|---|---|
| Full `npm test`, including new `test:goal` | PASS, exit 0 |
| `npm run test:goal` after invocation review | PASS |
| Focused upstream integration after timestamp review | PASS |
| `test_harness_authority.js`, `test_harness_advanced.js` after review | PASS |
| `npm run test:goal:ui` | PASS in Chrome; includes legacy blocked step |
| Electron `test_harness_goal_ui.cjs` | PASS VI/EN |
| Electron `test_harness_goal_controls_ui.cjs` | PASS VI/EN |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; existing large-chunk warning remains |
| `git diff --check` | PASS |

Fixtures cover real runtime admission/invocation/SQLite, HTTP commands, four
SIGKILL recovery cuts and actual browser/Electron renderers. Model responses
are deterministic fixtures, not live-provider quality certification. No paid
model calls or production goal-state rewrite was performed.

## Existing sessions

Existing persisted blocked goals retain their saved phase. Updating the app
stops their stale spinner; it does not declare old work complete. A human may
resume or clear them explicitly. New continuation is not armed by restart or
by reading a goal from history. Reopen the application to load the new backend
and renderer.
