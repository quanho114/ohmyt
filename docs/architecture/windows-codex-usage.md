# Using the opt-in Codex Windows backend

This backend uses installed Codex CLI 0.164.0. It is not equivalent to Linux
project-only read isolation: it permits broad host reads, limits workspace writes,
requests disabled network and denies detected project secrets and known credential
directories. User explicitly approved this model and Windows setup in this session.
Codex may repair its machine-wide accounts/ACLs/network rules on execution.

## Start the application backend

After the consented setup, stop the existing ohmyt daemon/desktop normally to free
its port and database, then from the repository root:

```powershell
node scripts/daemon-windows-codex.js
```

Alternatively set `$env:OHMYT_WINDOWS_SANDBOX='codex'` in the same shell before
`npm run daemon` or `npm run desktop`. The variable is process-local: an already
running application does not acquire it. Do not run a second daemon against the
same database. No running user application was stopped/replaced automatically.

`runtime_info` should report provider `codex-windows`, PowerShell and broad host
reads/scoped writes. Missing setup/version/opt-in fails closed; there is no host
fallback. Linux still selects bubblewrap. Explicit opt-in is required because
Windows read policy differs from project isolation.

## Verification on Windows, 2026-10-26

`OHMYT_WINDOWS_SANDBOX=codex node test/sandbox/test_windows_tools_live.js` passed
through actual ToolRegistry and WorkspaceSandbox: read, write, hash-checked edit,
list filtering, secret read admission denial and PowerShell command execution.
A delayed Node write did not survive a 1500 ms timeout (checked after its deadline).
Separate direct Codex verification allowed a project write and denied an outside
write with EPERM. Policy/provider fixture regressions and diff whitespace pass.

These are targeted integration results, not complete security equivalence:
network denial, adversarial junction/root races, dynamically created secrets,
cancellation of independently spawned grandchildren, Electron runtime behavior,
and full GUI end-to-end interaction remain unverified. Broad host reads can expose
credentials outside the known deny paths. The API project-isolation suite currently
fails at unrelated interactive-terminal initialization with missing tools input.
Do not claim all-platform production readiness from these checks.

## Implementation

The provider uses per-invocation complete CLI policy overrides rather than shared
config writes, serializes executions, maps the native workspace for the broker,
and passes structured argv/JSON stdin. Status checks do not launch elevated setup.
Output is bounded. Cancellation requests taskkill of wrapper descendants; tested
single-child timeout cleanup is not a proof for every detached process topology.
