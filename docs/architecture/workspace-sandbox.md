# Workspace sandbox seam

`shell_exec` and project filesystem tools now delegate workspace execution to
`WorkspaceSandbox` (`server/sandbox/index.js`). The default provider is
selected by host platform: Linux uses `BubblewrapSandbox`; Windows and other
unimplemented platforms expose an unavailable provider, never Linux bubblewrap or
an implicit host shell. The Linux provider's mount rules, credential/hardlink masks, network isolation,
Electron runtime mounts, file-descriptor transport and output limits were extracted
from `ToolRegistry` without changing their policy.

Windows implementation requirements and known broker portability blockers are
tracked in [Windows workspace sandbox design](windows-workspace-sandbox.md).
This platform routing change does not enable native Windows project execution.

## Contract and ownership

- `status()`: provider identity, availability and reason. The bubblewrap status
  checks platform/executable accessibility, not whether the kernel permits namespace
  creation. A launch failure is returned as an error; it never selects a host shell.
- `execute(request, context)`: receives workspace root, either shell `command` or
  structured `argv` (mutually exclusive; NUL-free strings), cwd, timeout,
  optional project scope, run ID, abort signal and optional filesystem-broker stdin.
  Returns the existing command/exitCode/signal/stdout/stderr/success shape.
- `cancel(runId)`: stops active processes for that run, without cancelling others.
- `dispose()`: disables admission, terminates all provider processes (including
  executions without a run ID), and waits for their close events.

The facade validates timeout, cwd containment and project root identity before
dispatch. The bubblewrap provider also checks root identity on the opened descriptor
used to mount the workspace. All scoped registries share the same facade. The
`core/sandbox` Cordis plugin provides `ctx.sandbox` and owns disposal. Trusted host
code may select a provider with `createDaemon({sandboxProvider})` at boot; this is
not a model-facing setting, permission grant or claim of DSH plugin compatibility.

Providers must preserve isolation, credential masking, bounded output, cancellation
and cleanup. Adding a new provider requires actual execution tests on its platform.
The injectable fixture used in tests does not supply production isolation.

## Boundaries retained

Authorization still belongs to the canonical tool invocation pipeline. Calling
`ctx.sandbox.execute()` directly is a trusted low-level operation, not an approved
agent tool path. The service cannot grant permissions. PTC keeps its separate
runtime and is not changed by this extraction.

`shell_host` remains the distinct explicitly permission-gated native shell tool.
Workspace sandbox failure never routes execution to it. Project filesystem tools
continue to use the sandbox broker. Aborting a run reaches both sandbox cancellation
and the existing host process tracker; provider cleanup removes sandbox processes
only after settlement/close. Abort signals reject cancelled executions, while
explicit `cancel(runId)` keeps the existing unsuccessful shell result behavior.

The current text limits remain 500,000 characters per normal output stream and
16,000,000 for file-broker streams, with truncation markers. These are character
limits, not byte-exact quotas. `runtime_info` now includes sandbox status and reports
workspace execution unavailable when its provider is unavailable.

## Verification

`npm run test:sandbox` runs the seam regression, project isolation and large-secret
mount tests under both Node and Electron. The seam regression covers scoped provider
dispatch, root replacement/cwd rejection, pre-aborted signals, authorization DENY,
missing/disabled providers without host fallback, idempotent Cordis-owned disposal,
real process cancellation, timeout, bounded output and disposal of unowned commands.

Also run `npm run test:harness`, `npm run test:approvals`,
`node test/sandbox/test_local_runtime.js` and `node test/core/test_core_real.js` when changing
this boundary. Fixture results do not establish equivalent security for other OSes.

Validation on 2026-10-14: sandbox suites passed under Node and Electron; approvals,
local-runtime and core integration suites passed. The harness command stopped at
`test/harness/test_harness.js:98` (expected zero `ToolCallStarted` events, observed one).
Loading the pre-extraction tools/daemon and removing the sandbox plugin registration
reproduced the same assertion without modifying the working tree. All remaining
commands in `test:harness`, including `test:harness:upgrade`, passed when run
separately.

Follow-up on 2026-10-14: corrected the stale assertion to check execution hooks,
semantic `tool/start` events and denied receipts with `bodyStarted:false`, while
retaining conclusion-turn UI activity. The full `npm run test:harness` now passes,
including upgrade acceptance. Budget-activity and final-tool recovery regressions
also pass. This is harness validation, not a claim that every repository suite ran.
