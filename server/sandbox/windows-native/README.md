# Windows LPAC feasibility probe (not a provider)

This directory contains an intentionally non-production Windows API probe. It is
not wired into tool execution and grants no workspace access. Do not enable a
Windows provider based on its presence.

## Reproduce

From the repository root on Windows, compile with the .NET Framework compiler:

```powershell
& C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /out:server\sandbox\windows-native\AppContainerProbe.exe server\sandbox\windows-native\AppContainerProbe.cs
& .\server\sandbox\windows-native\AppContainerProbe.exe --derive-only
```

The default mode attempts a transient AppContainer profile; `--derive-only` derives
a SID without creating a profile. Both set `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES`
and `PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY` (LPAC opt-out), request
no network capabilities, and attempt `cmd.exe /d /c exit 37`. Profile cleanup occurs
only if this probe successfully created the profile. No filesystem ACLs/accounts
are modified. A five-second deadline terminates the direct child; this probe does
NOT implement production Job Object process-tree cleanup.

## Observed 2026-10-26

- Rust/cargo installed; dotnet SDK absent, Framework csc successfully compiled probe.
- Default mode: `CreateAppContainerProfile` failed `0x80070005 E_ACCESSDENIED`.
- SID-only mode: SID derivation and both process attributes succeeded;
  `CreateProcessW` failed `ERROR_ACCESS_DENIED (5)`. No sandbox child ran.
- No escalation or permission workaround attempted; no access-boundary pass claimed.

This probe did not launch in this session. ERROR_ACCESS_DENIED does not identify
whether the cause is the session token, runtime ACLs, or probe configuration; it
is not proof that LPAC cannot launch on this host. Even successful launch
would only establish launch feasibility, not project isolation.

## Diagnostic follow-up (2026-10-26)

The diagnostic probe resolves `cmd.exe` through the Windows system-folder API
rather than an inherited `SystemRoot` string and uses System32 as working directory.
Startup structure sizes are 104/112 bytes and SECURITY_CAPABILITIES is 24 bytes on
x64, consistent with the native layout. Attribute constants remain 0x20009
(SECURITY_CAPABILITIES) and 0x2000f (ALL_APPLICATION_PACKAGES_POLICY).

Read-only host diagnostics found an ordinary medium-integrity limited token,
TokenElevationType=3, TokenElevation=0 and TokenIsAppContainer=0. Both cmd.exe and
Windows directory ACLs grant ReadAndExecute to ALL RESTRICTED APPLICATION PACKAGES
(S-1-15-2-2), so the simple explanation "system executable lacks LPAC read grants"
is not supported by those ACLs. The corrected system cwd/exe diagnostic still
failed CreateProcessW with error 5. No child ran. No policy/ACL/account was changed.

This narrows but does not establish the cause: process mitigation policy,
application-control/security software, effective token restrictions, and dependent
runtime ACL access still need host-level diagnosis. Do not keep trying alternate
launch APIs to bypass the denial. A viable next step is an explicitly supervised
LPAC helper integration test on a Windows dev/CI machine where native sandbox
launch is supported, with process-creation audit diagnostics and scoped runtime
staging; only then build job-object and filesystem/network boundary tests. The
probe is not itself a provider, and automatic host fallback remains prohibited.

## Production gaps

Use LPAC rather than relying on broad ALL APPLICATION PACKAGES read grants.
Provision narrowly scoped runtime and workspace capabilities/ACLs with reversible
setup, no broad user directory grants. Reject/handle reparse points, hardlinks,
root replacement, inherited handles and secret reads. Provide bounded captured I/O,
sanitzed environment, network denial including loopback, suspended launch into a
kill-on-close Job Object before resuming, cancellation, and trusted runtime staging.
All need actual adversarial Windows process tests before a provider reports ready.
Do not substitute a restricted token alone: WRITE_RESTRICTED does not restrict reads.
