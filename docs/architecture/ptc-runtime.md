# PTC runtime seam

`core/ptcRuntime` provides `ctx.ptcRuntime` and owns its disposal. The `tools/ptc`
consumer injects that service and registers `ptc_execute` only when its execution
probe succeeds. `HarnessHost.ptc` remains a compatibility accessor. The old
`server/harness/ptc.js` import re-exports the Node provider for existing consumers.

## Contract

`server/ptc/index.js` defines the shared service and `index.d.ts` its provider
contract: `probe()`, `execute(request)`, `cancel(runId)` and `dispose()`.
The service rejects invalid program/limit inputs, pre-aborted signals, unavailable
providers and calls after disposal. Providers are selected by trusted boot code
through `createDaemon({ptcProviderFactory})`; the factory receives the canonical
scoped tool callback. This is not a model-facing configuration or permission grant.

`server/ptc/node.js` retains the Linux x64 bubblewrap/prlimit/seccomp implementation:
no direct host files or network, native Node discovery under Electron, 64 MiB heap,
2 GiB address space, 30-second wall-time maximum, 1 MiB protocol output and at most
20 sequential tool subcalls. VM code-generation restrictions supplement OS isolation.
PTC does not use the project workspace sandbox provider, which mounts project files;
the PTC worker must not receive that filesystem access.

## Authorization and cancellation

The worker's RPC goes through `HarnessHost.callScopedTool()` and the admitted run's
canonical invocation service. Scope/capability checks, recursive PTC rejection,
approval, shared budget accounting and execution receipts remain in that path.
The factory/provider is trusted application code and must honor this callback;
the service cannot make an arbitrary malicious provider safe.

Each provider execution tracks its process and outstanding RPC jobs. Cancellation
kills the process group and aborts those jobs; disposal rejects new admissions,
stops all active executions (including probes/unowned calls) and waits for jobs to
settle. RPC handlers must cooperate with abort signals. Invocation combines the
parent run signal and narrower nested signal, so PTC cancellation reaches an active
tool without removing parent cancellation or aborting the parent itself. Effects
already started retain the existing unknown-outcome policy, not an automatic retry.

An RPC returning an unknown outcome fences further canonical tool bodies for that
run, even if the program catches its error. Calls that were waiting for middleware
or approval recheck the fence immediately before body admission. The task outcome
includes nested receipts independently of the wrapper's success. A new human turn
is required before further tools; the program cannot clear this fence.

The Node provider decodes stdout incrementally across UTF-8 pipe boundaries, while
the output ceiling still counts raw bytes. Large Vietnamese/emoji RPC arguments
and program output must round-trip exactly; partial characters are not replaced
when operating-system chunks split them.

## Validation

`node test/harness/test_harness_ptc.js` checks real OS execution, RPC, escape rejection,
timeout and subcall limits. `node test/harness/test_harness_ptc_pipeline.js` includes
`test_ptc_seam.js`: unavailable providers, scoped host wiring, DENY before RPC body,
shared budgets, receipt persistence, recursive PTC rejection, cancellation during
RPC, abort and idempotent provider/service disposal.
`test_harness_ptc.js` also covers large Unicode RPC/output round-trips;
`test_harness_uncertainty_fence.js` covers caught unknown RPCs and delayed bodies.

Run `npm run test:harness` for related lifecycle, invocation and child regressions.
Run PTC tests under Electron's Node mode to check native Node discovery; do not
interpret fixture results as proof of live model quality or other OS isolation.

Validation on 2026-10-14: PTC isolation and seam tests passed under Node and
Electron. Invocation-path, sandbox-seam and approval regressions passed. The full
harness command still stops at the previously reproduced assertion in
`test/harness/test_harness.js:98` (one `ToolCallStarted` event instead of zero). All remaining
commands in `test:harness`, including the upgrade acceptance suite, passed separately.

Follow-up on 2026-10-14: the stale UI-event assertion was replaced with direct
execution-hook, semantic-start and denied-receipt checks. The full
`npm run test:harness` now passes, including upgrade acceptance; budget-activity
and final-tool recovery regressions also pass.
