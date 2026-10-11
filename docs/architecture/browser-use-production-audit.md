# Browser Use integration delivery — 2026-10-09

## Architecture and upstream audit

The integration preserves the existing AgentLoop and delegates browser work through:

Main Agent → ToolRegistry / PermissionEngine → BrowserUseRuntime → direct BrowserSession actions or bounded BrowserSubagent → scoped CDP / Chromium.

Node controls run ownership, approvals, limits, traces and lifecycle. Python is an
isolated JSON-lines sidecar using the installed, pinned **browser-use 0.13.11**.
Upstream BrowserSession, DOM processing, CDP/event actions and watchdogs are reused;
upstream autonomous Agent/model credentials are not installed into the parent core.
The optional planner uses the parent's selected Gateway model and requests a new
permission for each atomic step. No Browser Use Cloud or paid API is mandatory.

Research references: [tagged upstream source](https://github.com/browser-use/browser-use/tree/0.13.11),
[dependency contract](https://github.com/browser-use/browser-use/blob/0.13.11/pyproject.toml),
[MCP lifecycle](https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle/).
The exercised local version is preferred to an untested latest release. The audit
covers the repository source layout, core/runtime/permission boundaries, native
browser paths, adapter/sidecar, settings/UI, persistence and test suites. It does
not claim every dependency or generated file was read line by line.

## Final feature matrix

| Requested group | State | Delivered behavior / boundary |
|---|---|---|
| BrowserSession, CDP, lifecycle | Implemented | Integrated Electron WebContents and standalone temporary Chromium; scoped targets, headless/headful configuration, owned teardown |
| Navigation, click/input/scroll/keyboard/dropdowns/tabs | Implemented | Snapshot/index checks, bounded key allowlist, wait, history, tab ownership |
| DOM, frames, Shadow DOM, accessibility | Partial | Upstream DOM includes srcdoc and cross-origin OOPIF plus open Shadow DOM; bounded interactive role/name projection. Closed roots and complete platform AX tree are not promised |
| Screenshot, vision, evaluation, extraction | Implemented with constraints | PNG artifacts, existing native vision/coordinates, safe read-only expression interpreter, parent-model JSON schema extraction. Arbitrary page JS is deliberately excluded |
| Upload/download, cookies, profiles/storage | Implemented | User-staged per-chat files, authenticated and blob downloads, PDF; persistent integrated chat profiles, temporary standalone profiles. Raw credential export/import is excluded |
| Watchdogs, reconnect, retries/timeouts/cancel | Implemented | Upstream watchdogs, bounded RPC/startup/actions, explicit observation recovery and sidecar reconnect, abort cleanup. Mutation is never automatically replayed |
| History, structured outputs, traces/events | Implemented | Parent task history, schema-validated extraction, sanitized bounded durable event records and authenticated SSE |
| MCP, custom tools, direct tools | Implemented | 27 atomic tools; standard stdio connector to authenticated local facade; trusted aliases through same validation/permissions |
| Optional browser subagent | Implemented | Optional browser_use_task makes 28 registrations; parent-selected model, 1–10 steps, separate atomic approvals, honest exhaustion result |
| Pause/resume, approval/auth/session/concurrency | Implemented | UI controls, manual login without CAPTCHA/2FA bypass, paused actions wait, fresh snapshot on resume; chat profile and lease isolation, two runs / one atomic call per run |
| Cloud, cloud CAPTCHA solver, upstream independent agent | Not Applicable | Excluded to retain the parent core's authority and avoid mandatory paid services |

No applicable feature group is left as an unimplemented placeholder. “Partial”
DOM coverage above is an explicit browser/platform boundary, not a claim that
closed Shadow DOM or the complete accessibility tree was implemented.

## Security and lifecycle

- The egress proxy validates every DNS answer and pins connections to public
  numeric IPs; private/reserved/mixed DNS is denied. Both browser modes use it.
  Integrated session proxies cover workers and remain alive for preserved tabs
  until daemon shutdown. Standalone proxies stop on run cleanup.
- Navigation/history/child frame commands require exact configured hostnames.
  Provisional OOPIF targets receive only initialization commands until their
  origin is known. App UI, HTML previews and other chats are outside CDP scope.
- Profiles are hashed by chat ID under the current OS user's private app-data
  directory. Cookies are not copied across chats; upload/file IDs have chat owners.
- Parent approval modes, DENY rules, LOCAL_ONLY and project scope are enforced.
  MCP requires an active matching parent run and existing API authentication.
- Password/token/payment/OTP hints are removed from DOM/AX values. Screenshot
  CSS hides marked inputs and iframe areas. Sanitized traces allow only action,
  timing, state, fixed error code and numeric token metadata.
- Automatic CAPTCHA solving is disabled. Authentication is manual. No credential
  entry, clipboard read or arbitrary JS execution is exposed through these tools.
- Shutdown/cancellation rejects waiters, aborts native requests, detaches CDP,
  terminates the owned Python process tree and deletes temporary run directories.
  Integrated website tabs/profiles intentionally persist for the user.

These are application controls, not an OS firewall or a guarantee against a
compromised browser. Arbitrary page text/custom or closed shadow roots can contain
secrets not recognizable by field heuristics. Browser artifacts/page observations
may contain personal data; the user can delete artifacts with existing file UI.
Unencrypted WebSocket upgrades through the proxy are rejected; WSS works through
CONNECT. Public subresources are permitted independently of navigation domains.

## Files changed for this integration

Existing files extended: package.json/package-lock.json (Acorn and test commands),
electron/main.cjs and preload.cjs (chat profile IPC and browser network flags),
server/index.js (runtime binding to harness), server/api.js (authenticated browser
control/events/MCP/workflow routes), src/vite-env.d.ts (IPC types), BrowserPane.tsx
and index.css (browser lifecycle controls). Other dirty Core/UI files in the shared
workspace belong to existing/concurrent work and are not attributed to this delivery.

Browser modules created or extended:
- server/browser_use.js, browser_use_cdp.js, browser_bridge.js: adapter ownership,
  tools, protocol, lifecycle and scoped OOPIF support.
- server/browser_egress.js, browser_evaluate.js, browser_trace.js,
  browser_integration.js: pinned egress, safe evaluation, traces, MCP/subagent.
- server/browser_files.js and browser_extract.js: artifact boundaries and extraction.
- electron/browser.cjs, browser-cdp.cjs, browser-computer.cjs,
  browser-network-policy.cjs: profile isolation, native control and request policy.
- integrations/browser-use/sidecar.py and mcp.js: BrowserSession sidecar and stdio.
- test/test_browser_* and test/run_browser_validation.js: boundary/security/unit,
  protocol, API and real browser validation; docs/browser-use.md and audit/checklist.

## Actual verification

`npm run test:browser-use:full` executes independent test files serially and fails
on nonzero exit, timeout or logged assertions (even if a daemon handler swallows
an assertion and exits zero). Its machine-readable report is
`output/browser-use-validation.json`.

All 36 aggregate checks passed: 16 browser suites, 19 existing Core/harness suites and the production build. TypeScript (`npx tsc --noEmit`), Python syntax and `git diff --check` also passed. The final run measured action p50 73 ms, p95 837 ms; real integrated scenario 8768 ms; Electron process RSS 260.5 MiB (not Python or full process-tree RSS). Expected denied/stale/cancel cases are assertions, not claimed task failures. No statistical live-agent success rate is inferred from fixture pass counts.

Real E2E covers navigation/input/click/dropdown/tabs, open Shadow DOM, srcdoc and
cross-origin iframe perception/action, manual authentication, isolated HttpOnly
login cookies, private worker/fetch denial, screenshots/evaluation/accessibility,
staged upload bytes/name, authenticated/blob downloads, PDF under modal occlusion,
closed pane rejection, stale snapshot, Python crash/reconnect, takeover and
cancellation cleanup. The standalone protocol smoke uses actual pinned Python /
Chromium through the production proxy with injected fixture DNS/connection routing.
MCP stdio is spawned and speaks initialize/initialized/tools-list over the actual
local authenticated API. Optional model planning/extraction uses deterministic
fixtures; paid-model calls: 0. This verifies contracts, not real model accuracy.

## Local run and reproduction

```bash
npm install
npm run setup:browser-use
npm run desktop
npm run test:browser-use:full
npx tsc --noEmit
```

Setup requires uv and Python prerequisites; standalone mode also needs a local
Chrome/Chromium executable. Linux browser E2E uses xvfb-run. Enable Settings →
Web search → Browser Use · Chrome, configure exact allowed domains, then open
that site in a standalone chat's browser pane. See [user and MCP instructions](../browser-use.md).

## Remaining validation limits

Linux/Electron is exercised. macOS was not run; Windows owned process-tree
cleanup is unsupported and must not be advertised as validated. Browser Use
compatibility is pinned, not an assurance for future upstream versions. Reported
latency/RSS is one local fixture run, not capacity planning. Live selected-model
success rate, paid token totals, long-duration stability and platform-wide load
measurements require separate credentials/workloads and are not fabricated here.
