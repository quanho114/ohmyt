# Browser Use inside ohmyt Chrome

Browser Use 0.13.11 provides DOM perception and direct browser actions inside
**ohmyt's embedded browser pane**. The ohmyt agent keeps planning, model calls,
memory, approvals and logs. Existing screenshot/coordinate tools provide mouse,
keyboard and drag control in the same website tabs.

## Enable

1. Run `npm run setup:browser-use` once (requires uv; Linux/macOS).
2. Start the desktop app. Open Settings → Web search → Browser Use · Chrome.
3. Enter exact allowed hostnames, comma separated, and enable Browser Use.
4. In a standalone chat, open the Chrome pane and an allowed website.
5. Ask the agent to work on that page. Select a model with **vision and tool
   calling** for screenshot control. DOM actions work without vision.

The setting persists in the application database and applies to the next task.
Changes are rejected while an AI task is active. Browser Use starts Python lazily
on an approved action; enabling it does not launch an extra Chrome window.
The active allowed tab is preferred; otherwise the first allowed tab is selected.

Environment configuration is also available when no saved UI setting exists:

```bash
export OHMYT_BROWSER_USE=1
export OHMYT_BROWSER_USE_DOMAINS=example.com,www.example.com
npm run desktop
```

Optional `OHMYT_BROWSER_USE_PYTHON` selects an installed Python runtime. The
optional `OHMYT_BROWSER_USE_MODE=standalone` runs a separate temporary Chromium
browser; it requires an installed Chrome/Chromium executable. Saving in the UI
selects integrated mode. No automatic browser installation happens during tasks.
Windows process-tree cleanup remains unsupported; macOS is not validated here.

## Browser capabilities

| Capability | Tools |
| --- | --- |
| DOM perception / extraction | `browser_use_read` (DOM text and indexed controls) |
| Navigate / input / click / scroll | `browser_use_navigate`, `browser_use_type`, `browser_use_click`, `browser_use_scroll` |
| History / refresh | `browser_use_back`, `browser_use_forward`, `browser_use_reload` |
| Find text / dropdowns | `browser_use_find_text`, `browser_use_dropdown_options`, `browser_use_select_dropdown` |
| Tab management | `browser_use_tabs`, `browser_use_new_tab`, `browser_use_switch`, `browser_use_close_tab` |
| Files / PDF | `browser_use_files`, `browser_use_upload_file`, `browser_use_download`, `browser_use_download_click`, `browser_use_pdf` |
| Structured extraction / recovery | `browser_use_extract`, `browser_use_recover` |
| Screenshot / mouse / keyboard / drag | Existing `browser_observe`, `browser_act`; `browser_use_screenshot`, `browser_use_keypress` |
| Read-only evaluation / accessibility / wait | `browser_use_evaluate`, `browser_use_accessibility`, `browser_use_wait` |
| Optional bounded workflow | `browser_use_task` (parent selected model, separate permission for each step) |

DOM mutations require a fresh `snapshotId` and element index. Observations expire
in 30 seconds and each indexed attempt consumes its observation. Visual actions
use a distinct screenshot snapshot and image coordinates; do not mix snapshots.
Each action returns observed state so the agent can verify the resulting page.
Browser tasks get up to 20 model/tool rounds; individual Browser Use calls time
out after 45 seconds. At most two Browser Use runs operate concurrently, with
one pending action per run. A leased tab cannot be used by another run.

The tab bar shows an icon-only Stop button while the AI controls the page. The file icon includes a small Browser Use status dot; its tooltip reports enabled/disabled/runtime status. An agent cursor marks CDP mouse actions. Clicking Stop, using the browser
controls, or clicking/typing yourself revokes that run's control. Releasing the
run detaches CDP and cleans Python/temp files while preserving integrated tabs.
Embedded tabs use a persistent profile hashed by chat ID within the OS user app-data directory. Switching chat hides the other chat tabs and isolates cookies/storage. Login state persists in that chat. Separate mode uses temporary profiles removed at run completion.

## Files, PDF and structured extraction

Click the **file icon** in the Chrome tab bar (tooltip: File trình duyệt) to choose files, inspect the chat's
files, download them to your computer, or delete them. Each chat has its own file
IDs; tools cannot list/read/upload another chat's files. Limit: 25 MB/file,
50 files and 100 MB/chat. Selecting a file stores a private copy; it does not yet
send that file to a website. File transfers use normal chat action permissions.

`browser_use_upload_file` selects exactly one verified file ID into a fresh file
input index/snapshot. The file retains its name and remains readable after run
cleanup/reconnection. A separate approved page action must submit the form when
needed; selecting a file alone is not proof of a completed server upload.
No model-provided local filesystem paths are accepted. Upload destinations are
checked against the configured domains, including the selected input's frame.

`browser_use_download` downloads an allowed HTTP/HTTPS URL using the Chrome tab's
cookies. `browser_use_download_click` captures one file produced by an indexed
button/link, including page-origin blob CSV/PDF files. Unmanaged agent clicks
cannot silently download files. Redirect URLs and file size are checked;
cancellation waits for the download to stop before deleting staging data.
Downloads may involve network traffic before redirect rejection; these checks
are not a network firewall. User-initiated downloads outside a leased agent tab
keep their existing behavior.

`browser_use_pdf` renders the page through Electron's printToPDF, checks that the
URL stayed unchanged and verifies the resulting PDF bytes before committing.
PDF/download/JSON outputs have buttons in tool cards and also appear in the file
manager. They survive the run; deleting a file/chat removes its stored files.
File content endpoints require application authentication and return attachments,
not active HTML previews. File size/hash are checked before reading or uploading.

`browser_use_extract` reads bounded DOM text and makes **one additional model
call** with the chat's selected provider/model. No tools, model switch or Python
LLM credentials are used. The output must parse as JSON and pass the requested
schema; invalid output fails explicitly. A supported schema uses explicit JSON
types, `properties`, `required`, `additionalProperties:false`, arrays with `items`,
and scalar `enum`; references/combinators are excluded. Limits: 8 levels/100 nodes,
16 KB schema, 60,000 source characters, 100 KB output and 30 seconds/model call.
Result metadata includes source URL/title/truncation, model and available usage.
The JSON artifact is durable. Schema validation guarantees shape, not factual
accuracy; partial DOM input is reported as truncated.

## Recovery

Stale/changed indices produce classified errors with a read-only recovery hint.
Perception may retry once. `browser_use_recover` refreshes the observation; after
a failed Python transport it reconnects to the **same tab**, preserving browser
state and chat files. A stopped owner cannot regain control through recovery.
No automatic mutation replay, page reload, navigation, credential entry or model
fallback occurs. If an action may have run before a failure, the result reports
`mutationOutcomeUnknown`; the agent must inspect real page state before deciding
what to do. Three failed or identical stalled attempts block more mutations until
recovery. Browser tasks retain the existing 20-round budget.

## Scope and policies

The implementation combines Browser Use DOM/CDP with ohmyt's native visual
control. It does not copy the entire upstream repository or start a second
agent loop. Cloud, upstream Agent/CLI, arbitrary model-controlled JavaScript,
upstream LLM judge and its independent extraction/model adapters are not exposed.
The extraction tool uses the selected ohmyt chat model through the existing Gateway.
Desktop applications outside the browser pane are outside this scope.

Only website WebContents in the browser pane are exposed through a random-token,
loopback WebSocket proxy per run. App UI, browser controls, HTML previews and
unrelated targets are omitted. Electron has no global remote-debugging port.
Browser-wide cookie/storage/destructive CDP operations are denied or scoped.
Explicit navigation and history destinations must match configured hostnames;
redirect/navigation guards also operate while a tab is leased.

Both integrated and standalone modes route Chromium HTTP/HTTPS egress through a
local proxy that validates all DNS answers and connects to the validated numeric
IP. Private/reserved addresses, mixed public/private answers and DNS failures are
denied. The proxy also covers worker requests; redirect destinations undergo a new
check. Loopback bypass and QUIC are disabled and WebRTC uses non-proxied UDP
restrictions. Public subresources outside the navigation allowlist remain allowed.
Integrated profiles keep a safe proxy until daemon shutdown, so preserved tabs
remain usable after task completion. Standalone proxies stop with their run.
This is application-level enforcement, not an OS firewall or protection against
a compromised Chromium. HTTP WebSocket upgrades are denied; WSS uses CONNECT.

DOM and AX field values matching password/token/payment/OTP hints are redacted.
Screenshot capture hides marked sensitive inputs and iframe regions; iframe DOM
interaction still works. Arbitrary page text and custom/closed Shadow DOM may
contain secrets that these heuristics cannot identify. Never place credentials in
prompts; use the manual authentication handoff. Traces contain allowlisted numeric
and action metadata, never page content, URLs, arguments or provider errors.
Project chats and LOCAL_ONLY cannot use Browser Use. Parent approval modes and
DENY rules apply; no hidden mutation retry or backend/model fallback occurs.

## Pause, authentication and events

Use Pause or manual login in the browser pane while a run is active. In paused
state the user can enter authentication manually; browser actions wait at adapter
boundaries. Resume rechecks tab ownership/origin and invalidates old snapshots.
Stop and parent cancellation reject waiting actions and clean the sidecar/CDP.
Pause/resume rejects an in-flight mutation rather than interrupting it midway.
The integration never automatically solves CAPTCHA or 2FA.

Authenticated API endpoints (sessionId is required):
- GET `/api/browser-use/runs?sessionId=CHAT`
- POST `/api/browser-use/runs/RUN/control?sessionId=CHAT`, JSON action: pause/resume/authentication
- GET `/api/browser-use/runs/RUN/events?sessionId=CHAT`, optionally `&stream=1` for SSE

Each run permits one atomic action in flight, up to 100 adapter actions, and two
concurrent Browser Use runs globally by default. Metadata history is bounded to
200 events/run, 1,000 in-memory runs and 10,000 durable rows. Artifacts can contain
website data and retain the existing chat file deletion controls.

## MCP, custom tools and optional browser subagent

The 27 direct tools are registered with the existing ToolRegistry. API startup
also registers optional `browser_use_task`, making 28 tools. The parent remains
responsible for planning, permissions, budgets, model and task lifecycle.
`browser_use_task` plans one atomic action at a time using that parent model,
with 1–10 steps and a 30-second bound per planning call. It reports budget exhaustion
without claiming completion. Extraction/planning consumes the selected model's
normal tokens; Browser Use Cloud is not required.

MCP uses a standard JSON-lines stdio connector and a local authenticated JSON-RPC
facade. Bind it to an already active standalone parent run:

```bash
OHMYT_MCP_RUN=RUN_ID OHMYT_MCP_CHAT=CHAT_ID \
OHMYT_MCP_TOKEN=LOCAL_API_TOKEN node integrations/browser-use/mcp.js
```

Optional OHMYT_MCP_API defaults to http://127.0.0.1:3188/api/ and accepts loopback
HTTP only. The client must initialize, send notifications/initialized, then use
tools/list and tools/call. HTTP `/api/browser-use/mcp` is the internal facade,
not a separately advertised Streamable HTTP transport. Parent completion revokes
access. External calls have a 20-call budget per parent run and each action uses
existing parent permissions. A task's wrapper approval does not approve its steps.

Trusted server code may call BrowserIntegration.registerCustomTool with a
browser_use_custom_* name and an existing atomic toolName. Aliases share argument
validation and permission checks; no arbitrary Python or page JS is loaded.
POST `/api/browser-use/workflow?runId=RUN&sessionId=CHAT` accepts explicit steps
or task/maxSteps through the same authorization path.

`browser_use_evaluate` interprets an Acorn-parsed, read-only JS expression over
sanitized `page` observations. It has no browser globals, cookies, storage,
network, eval, assignment or prototype access. Use array map/filter and simple
scalar/string operations; expression, operation and output bounds are enforced.

## Validation and disable

```bash
npm run test:browser-use:full
npm run test:browser-use
node test/test_browser_use_settings.js
npm run test:browser-use:integrated
npm run test:browser-use:smoke
npm run test:browser:vision
```

Integrated tests use actual Electron, Python and Browser Use without paid model
calls. See `docs/architecture/browser-use-validation.md` for reproducible results; the current aggregate report is
`output/browser-use-validation.json`. They do not establish live LLM task success rates.

Disable in Settings after tasks finish. This removes Browser Use tool definitions
for subsequent tasks; existing native browser tools stay available. Keep the
Python environment installed or remove the ignored integration `.venv` if unused.
The additional DB tables store Browser Use settings and per-chat file metadata.
Artifact bytes are stored privately under the application data directory.

## License

Browser Use uses MIT. Preserve its copyright and MIT notice when distributing
the dependency: `THIRD_PARTY_NOTICES.md` and
`integrations/browser-use/LICENSE.browser-use`. Dependencies have their own
licenses. Cloud and commercial model services have separate terms and are not
required by this integration.

## Production audit

See [feature matrix and delivery results](architecture/browser-use-production-audit.md)
for the 2026-10-09 audit, implementation boundaries, actual measurements and platform/live-model
limitations. Completion claims are limited to the tests actually executed.
