# Working on ohmyt

ohmyt is a local-first AI assistant with a Node daemon, React document/chat
workspace, Electron shell, Chrome extension and optional Python Browser Use
sidecar. This is one npm package, not a pnpm capability monorepo. Use the current
code and `package.json` as the source of truth; some architecture documents are
proposals or historical validation reports.

## Repository map

- `server/index.js`: `createDaemon()`, service composition, startup and shutdown.
- `server/api.js`: HTTP/SSE endpoints and client-facing validation.
- `server/agent_loop.js`: run admission, control, streaming events and queue dispatch.
- `server/harness/`: Cordis host, turn driver, tool invocation, semantic session
  log/projections, request attempts, budgets, profiles, plugins, children and goals.
- `server/habits.js`, `server/api/habits_routes.js`: recurring scheduled tasks;
  firing only enqueues into the durable inbox so approvals and scope stay intact.
- `server/db.js`: SQLite application persistence, WAL/FTS5 and migrations.
- `server/tools.js`, `server/project_scope.js`, `server/local_runtime.js`,
  `server/office.js`: workspace tools, project boundaries and runtime execution.
- `server/sandbox/`: workspace sandbox contract, shared facade and Linux
  bubblewrap provider; Cordis exposes the service as `ctx.sandbox`.
- `server/ptc/`: PTC service contract and isolated Node provider, exposed as
  `ctx.ptcRuntime`; the worker protocol stays in `server/harness/ptc_worker.js`.
- `server/permissions.js`, `server/harness/authorization.js`, `server/providers/`:
  approval policy, model adapters/gateway and encrypted credentials.
- `server/browser_*.js`, `integrations/browser-use/`: browser control, egress,
  artifact handling and the optional Python sidecar.
- `server/document_*.js`, `src/documents/`: document snapshots and proposals.
- `src/`: React/TypeScript UI; `src/harness/` handles runtime client state.
- `shared/`: contracts and pure modules shared by host and client. Keep these
  free of Node/Electron runtime dependencies.
- `electron/`, `chrome-extension/`: desktop and browser integration shells.
- `server/vendor/`, `src/vendor/`: adapted upstream source with provenance/licenses.
- `test/`: suites grouped by domain; see [test/README.md](test/README.md).
- `docs/reports/`: historical research, audits and validation records.
- `docs/architecture/`: design, integration, constraints and validation records.

## Change discipline

- Inspect the working tree first. Preserve unrelated changes and untracked files.
- Follow nearby conventions: backend JavaScript ES modules; frontend TypeScript
  and React. The current `tsconfig.json` checks `src`, not the entire backend.
- Make the smallest coherent change. Moving files into packages does not by
  itself remove coupling; do not introduce a workspace migration incidentally.
- Runtime already has semantic projections, durable inbox, layered presets and
  `agent/pre-step`. Extend these paths rather than building competing mechanisms.
- Cordis owns plugin registrations and effects. Keep dependency declarations,
  disposal, idle-only reconfiguration and revision checks intact. Local plugins
  are trusted application code; metadata does not grant execution permission.
- When adding a seam, make the contract explicit and route consumers through it.
  Preserve cancellation, authorization, receipts and cleanup across providers.
- Update relevant docs when public behavior or architecture changes. Preserve
  upstream licenses and record provenance changes when editing adapted code.
- Do not commit application data, credentials, generated previews or test outputs.

## Runtime invariants

- Scope and authorization are enforced by the backend. Resolve project scope
  from the session; client input, model output and plugin metadata cannot broaden it.
  Preserve DENY precedence, scoped grants and run-bound approvals.
- Project filesystem/shell execution requires the supported sandbox. Fail closed
  when unavailable or the root changes; never silently fall back to host execution.
  Keep project memory, files, permissions and forwarding isolated.
- Route tool execution through the canonical invocation/authorization pipeline,
  including PTC, MCP and child paths. Log intent before effects and retain actual
  execution receipts. An unknown outcome must not trigger automatic mutation replay.
- Semantic events/projections own new-turn history. Compatibility snapshots and
  migration fallback still exist; preserve migration backups, sequence monotonicity,
  deletion revisions and transcript validity. Projections must not execute tools.
- Preserve assistant/tool call identities, complete tool-result groups, current
  user input and steering during history fitting/compaction. Do not claim exact
  request replay without evidence that all model-visible inputs are recorded.
- Retry model requests only within bounded policy and before partial output.
  Preserve shared request/tool budgets across children, summaries and approval review.
- Cancellation and shutdown must stop/drain dependent work, cancel approvals and
  clean up processes, sidecars and plugin resources before closing persistence.
- Goal activation is process-local; restart/unload must not automatically authorize
  continuation. Preserve terminal tool fences, revision checks and the distinction
  between model-reported completion and host-verified evidence.
- Treat document content, retrieved text and external tool results as untrusted
  data. Preserve preview sandboxing, browser snapshot/backend identity and egress policy.

## Commands and validation

Use npm and retain `package-lock.json`. Node must support `node:sqlite` and the
direct TypeScript test execution used by this repo. Inspect prerequisites before
running Electron, sandbox or Browser Use suites; do not install optional runtimes
just to make an unrelated change.

| Purpose/change | Command |
| --- | --- |
| Backend development | `npm run daemon` (port 3188) |
| Frontend development | `npm run dev` (port 5173, API proxy) |
| Desktop development | `npm run desktop` |
| Frontend type check / build | `npx tsc --noEmit` / `npm run build` |
| Broad regression suite | `npm test` |
| Harness/persistence/tools/controls | `npm run test:harness` |
| Harness acceptance checks | `npm run test:harness:upgrade` |
| Harness UI | `npm run test:harness:ui` |
| Goals / goal UI | `npm run test:goal` / `npm run test:goal:ui` |
| Suggested task workflows / UI | `npm run test:tasks` / `npm run test:tasks:ui` |
| Documents | `npm run test:documents` |
| Project sandbox / approvals | `npm run test:sandbox` / `npm run test:approvals` |
| Browser Use | `npm run test:browser-use` |
| Browser Use full validation | `npm run test:browser-use:full` |
| Chrome bridge/extension | `npm run test:chrome` |

Start with relevant `node test/<group>/test_*.js` regressions, then run the matching suite
for runtime changes. For UI changes, check types/build and the matching browser
or Electron suite. Many UI scripts require Linux `xvfb-run` and Electron; sandbox
checks require Linux/bubblewrap. `npm test` does not include every specialized suite.
Use temporary databases/data directories in tests instead of the user's `data/`.
For behavior or security fixes, add a regression that exercises the actual boundary.
Documentation-only changes need link/command checks, not a full runtime test run.

Report what was tested and any skipped prerequisites. Mock/provider fixtures prove
the tested control logic, not live model quality, platform sandbox equivalence or
production readiness. Live evals (`eval:harness:live`, `eval:harness:quality`) may
use configured services; inspect their setup and scope before running them.

## Useful references

- [Runtime boundaries and recovery](docs/architecture/harness-integration.md)
- [Project isolation](docs/architecture/project-isolation.md)
- [Workspace sandbox provider contract](docs/architecture/workspace-sandbox.md)
- [PTC provider contract](docs/architecture/ptc-runtime.md)
- [Goal adapters and continuation](docs/architecture/goal-deepseek-runtime.md)
- [Goal upstream provenance](server/vendor/deepseek-goal/README.md)
- [Browser Use setup and policy](docs/browser-use.md)
- [Document workspace](docs/document-workspace/implementation.md)

When a document and code disagree, inspect the implementation and its regressions,
then correct the stale claim rather than assuming the documented feature is absent.
