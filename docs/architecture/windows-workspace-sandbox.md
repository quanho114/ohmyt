# Windows workspace sandbox design

Status: platform selection implemented; Windows execution NOT implemented.

## Codex-inspired separation

Keep authorization and project scope in the existing invocation pipeline. Select
an OS enforcement provider at trusted host startup, not from model arguments or
project settings. Linux retains bubblewrap. Windows requires a native provider;
PowerShell alone, a Job Object alone, or Node path checks are not isolation.

References (upstream main inspected 2026-10-26):
- https://github.com/openai/codex/blob/main/codex-rs/sandboxing/src/manager.rs
- https://github.com/openai/codex/blob/main/codex-rs/windows-sandbox-rs/src/lib.rs

Codex separates platform selection, permission profiles and native execution.
Do not assume its legacy WRITE_RESTRICTED token backend confines reads: it cannot
meet this application's project read isolation and credential masking by itself.
A Windows implementation needs a separately confined security identity and ACL
policy (including denied reads), enforced network policy, and process-tree cleanup.
Admin setup must be explicit and reversible; normal agent commands must not run
with the setup helper's elevated identity.

## Required integration work

1. Package and audit a native helper; authenticate its protocol and executable
   location. Never accept helper paths from a project/model.
2. Enforce allowed project/runtime roots, deny secrets, hardlinks/reparse-point
   escapes, and protect app data and other projects. Validate root identity at
   execution, not just admission. Avoid broad persistent user ACL changes.
3. Enforce network isolation and sanitized environment; bound stdout/stderr,
   forward cancellation/timeouts, and terminate/drain the entire process tree.
4. Structured `argv` requests are implemented in the facade and Linux provider;
   read/write/edit broker launches now use `['node','-e',script]` with JSON stdin,
   not POSIX shell quoting. Fixture regression checks quoted/metacharacter paths.
   The broker still uses `/workspace` and Linux file-open semantics; Windows
   workspace mapping and safe native opens remain required. Preserve edit locking,
   hash preconditions, 2 MiB file limits and secret filtering.
5. Tool discovery now exposes `shell_exec` only when the selected provider reports
   available, independent of host OS. UI must distinguish unsupported from
   missing setup and show actionable status without recommending disabling safety.
6. Test real Windows execution against outside-root reads/writes, secrets,
   junctions/symlinks/hardlinks, root replacement, network/DNS, inherited handles,
   process descendants, timeout/cancellation, disposal and authorization denial.
   Linux regression tests remain required separately.

Until those tests pass, Windows is unavailable and cannot silently execute host
commands. `node test/sandbox/test_platform_selection.js` checks routing and
fail-closed behavior only; it does not validate native Windows security.

## Validation record (2026-10-26, Windows)

- Node 24: platform routing, provider-based tool discovery, and actual scoped
  `fs_write` refusal/no host mutation passed.
- Node sandbox seam: scoped dispatch, authorization DENY, unavailable-provider
  rejection and disposal passed. Its Linux-only real process tests are skipped
  on Windows; its generic success message does not prove they ran.
- `npm run test:sandbox` stopped in project isolation setup: the pre-existing
  interactive-terminal API initialization dereferenced missing `tools.workspaceRoot`.
  Electron stages of that suite therefore did not run.
- Direct Electron platform regression could not create its temporary directory
  (`EPERM` in the user Temp directory). No Electron pass is claimed.
- `git diff --check` passed. No Linux or native Windows isolation test was run.

