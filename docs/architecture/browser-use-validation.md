# Current validation — 2026-10-09

The full integration supersedes the older notes below. All 36 aggregate checks passed (16 browser, 19 Core/harness, build); TypeScript and Python syntax also passed. See [final audit](browser-use-production-audit.md), `npm run test:browser-use:full` and `output/browser-use-validation.json`. Historical failures below describe earlier revisions, not the current result.

# Browser Use integration validation — 2026-10-08

Implemented the plan in `browser-use-plan.md`. Browser Use is installed in the
ignored optional `.venv`; it remains disabled by default. A dedicated browser_use_config table stores enablement/hostnames/mode; no
application-wide activation was performed. Integrated mode uses the existing
ohmyt browser profile without exporting or importing browser cookies.

## Files, extraction and recovery extension

Added browser_files metadata and a private durable file store. The integration
remains disabled by default. Scope is documented in browser-use-files-plan.md.

- Actual Electron/Python/Browser Use: upload preserves filename/content across
  reconnect and run cleanup; authenticated HTTP download and button-generated blob
  download produce verified stored bytes; PDF has a valid signature and is durable.
- Extraction uses the explicitly selected model with no tools and returns a
  validated JSON object plus durable JSON artifact (fixture model; no paid API).
- Changed controls produce a stale/changed error. Recovery reads without replaying
  the mutation, reconnects after killing Python, and rejects another chat's attempt
  to recover that run. User takeover remains enforced.
- In-flight download abort stops the DownloadItem and leaves no partial artifact.
- API/service tests: authentication, cross-chat/project rejection, safe names,
  integrity/PDF checks, invalid schema/output, abort and file cleanup on chat delete.

These checks do not benchmark live model extraction accuracy. Existing full-suite
failures below remain separate from this extension.

## Passing checks

- Actual integrated Electron → scoped CDP → Python → Browser Use: DOM read,
  type/click, dropdown options/selection, screenshot, reload, new/switch/close tabs,
  app target isolation,
  blocked destination, user takeover and CDP/lease cleanup preserving the tab.
- Settings API: validation, atomic invalid update, active-run protection, persistence
  across daemon restart, tool registration/removal, and no Python spawned on save.

- `npm run setup:browser-use`: Python 3.12, Browser Use 0.13.11.
- `npm run test:browser-use`: real child-process protocol fixture and real agent
  loop; opt-in, strict schemas, exact domains, project boundary, per-run profiles,
  approvals/DENY, LOCAL_ONLY even with shared Chrome tabs, failure/timeout/abort,
  concurrent-run limit, process and directory cleanup.
- `npm run test:browser-use:smoke`: actual Node → Python → Browser Use → Chromium,
  local hostname fixture, navigate/DOM/type/click, observed result, cancellation
  during an in-flight navigation and process/profile cleanup.
- `test/test_browser_use_smoke.py`: actual Chromium fixture, stale observation,
  password field and disallowed link/URL rejection.
- `npm run test:chrome`, `npm run test:browser:vision`, approval modes and project
  isolation tests: existing browser/permission paths pass.
- `npm run build`: passes; existing large-bundle warning remains.
- `git diff --check` and JS/Python syntax checks: pass.

Linux was tested with Google Chrome. macOS process-group behavior has not been
tested on a Mac; Windows is intentionally unavailable.

## Existing full-suite failures

`npm test` stops at `test_core_real.js`. Running the remaining suites separately
found five failures in total. Each was reproduced in a temporary source copy
with the Browser Use integration wiring removed, retaining the user's existing
working-tree changes:

| Suite | Failure |
| --- | --- |
| `test_core_real.js` | Test expects auth error to start with `Lỗi:` and contain `401`; existing formatter emits a different user message. |
| `test_e2e_suite.js` | Expected `ToolCallStarted` event absent. |
| `test_response_activity.js` | Test tool fixture lacks existing `forStandalone` method. |
| `test_session_titles.js` | Expected title strips `giúp tui`; current title retains it. |
| `test_final_conclusion.js` | Expected `RunCompleted` event absent. |

The other original npm-test suites pass when run independently. These failures
were left unchanged to keep this integration scoped. The complete application
test suite is **not green**.

These checks do not establish containment of arbitrary web traffic, browser
security, persistent login safety, or live LLM task accuracy. Domain/field guards
are defense in depth; this version is intended for public non-sensitive tasks.

## Pane visibility regression

The integrated Electron test now hides the website view as the UI does for an
approval dialog, while retaining an open pane, and exports/verifies a real PDF.
It separately closes the pane and confirms PDF control is rejected. Native
view visibility and whether the user has opened the pane are distinct states;
temporary modal occlusion must not be reported as a closed browser pane.
