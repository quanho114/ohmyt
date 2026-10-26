# Practical Codex Windows sandbox integration path

Status: strict policy builder and parser feasibility validated; execution provider
NOT enabled. No administrative setup, account or ACL changes were performed.

## Evidence

Installed CLI: `codex-cli 0.164.0` at the trusted application installation's
`bin/codex.exe`. Its public `codex sandbox` command accepts argv, `-C` cwd,
`-P` named permission profile and inherited stdin/stdout/stderr. This is a more
practical initial integration seam than its private command-runner IPC.

Pinned sources:
- https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/debug_sandbox.rs
- https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/windows-sandbox-rs/src/identity.rs
- https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/windows-sandbox-rs/Cargo.toml

An actual CLI parser probe used a fresh isolated CODEX_HOME, `:minimal = read`,
only the probe root `write`, network disabled, and `windows.sandbox = unelevated`.
It failed closed before child execution with `Restricted read-only access requires
the elevated Windows sandbox backend`. This confirms named strict policy parsing
and rules out legacy restricted tokens as the production solution.

## Setup requires explicit consent

The elevated backend can automatically provision/repair local sandbox accounts,
WFP network rules and persistent filesystem ACLs through a service or UAC helper.
Checking a setup marker is not a no-side-effects guarantee: missing/disabled/expired
accounts and version/settings changes trigger repair. The CLI has no verified
no-provision flag. Do not invoke elevated mode as a background readiness check.

After explicit user consent to this machine-level setup, a human can provision
and test a dedicated non-temporary CODEX_HOME with a reviewed strict config:

```powershell
$env:CODEX_HOME = 'C:\Users\YOUR_USER\AppData\Local\ohmyt\codex-sandbox'
# First create this directory and config.toml using the trusted policy builder.
# Review all allowed roots and deny paths before running; may request admin setup.
& 'C:\PATH_TO_TRUSTED_CODEX\codex.exe' sandbox -P ohmyt-project -C 'C:\PROJECT' -- cmd.exe /d /c exit 0
```

Do not use default `:workspace`: it permits broader reads than ohmyt's contract.
Do not put CODEX_HOME under Temp: installed Codex refuses helper aliases there.
Do not reuse user authentication/config state. Workspace/project config merging
must be tested and overridden so it cannot widen the generated policy. The policy
builder does not yet guarantee config isolation or enumerate project secrets.

## Consented elevated launch result

After explicit user consent, `node scripts/setup-codex-windows-sandbox.js
--consent-machine-setup` attempted the strict verification profile using the
installed 0.164.0 CLI and a dedicated non-temporary CODEX_HOME. It failed before
launch with `elevated Windows sandbox requires effective :root read access`.
Thus this version's elevated backend does not meet the current project-only read
contract either. Do not add `:root = read` merely to pass setup: that broadens
host read access. No successful provisioning or isolated child launch is claimed.
The generated dedicated configuration remains strict. The CLI adapter is not a
viable drop-in production provider under the existing contract.

## Explicitly consented host-read experiment

User approved Codex-style broader reads separately from setup. The policy builder
now supports `allowHostRead: true` (strict default remains false). The setup script
requires `--consent-host-read` and uses a separate CODEX_HOME ending in
`codex-sandbox-host-read`, with known existing credential directories denied.
The consented setup command returned exit 0. A subsequent actual project-write
verification failed (`Allowed project write failed`); therefore exit 0 alone is
not evidence of usable workload execution and no provider is enabled. Outside-write,
network and cancellation enforcement remain unverified. Do not claim Windows
support is complete based on the setup command.

## Scope remaining

1. Consent/onboarding with explicit setup effects, uninstall/repair behavior.
2. Immutable trusted executable discovery/version pinning and dedicated config.
3. Native Windows broker root mapping and safe opens; currently Linux assumptions
   remain despite argv transport being portable.
4. Real strict read/write/secret/network tests, including new secret files, junctions,
   hardlinks, sibling projects and root replacement.
5. stdin capture, output caps and cancellation tests proving wrapper termination
   stops the underlying runner and descendants. Do not assume taskkill of the CLI
   alone reaches separately launched sandbox-account processes.
6. Only then mark provider available and route project tools into it.

A standalone native build is possible but not a tiny dependency: the crate uses
workspace protocol, HTTP, OTEL, PTY, utility crates and three helper binaries. It
needs a pinned source snapshot, provenance/licenses, app-specific identities and
storage, trusted signed distribution plus separate setup lifecycle. The CLI
adapter is the smaller practical route; neither route is a safe one-line fix.
