# Local-first execution in ohmyt

## Research and findings

OpenWorker separates a native desktop shell, local agent server, providers and tools. Its local engine and state remain on the user's computer, while configured model providers may be remote. Tools can run in a sandbox; local-first does not imply unrestricted host access.
Source: https://github.com/andrewyng/openworker (reviewed 2026-10-04).

Codex likewise separates execution boundaries from approval policy. Local execution can remain sandboxed and elevated operations require the relevant authorization.
Source: https://developers.openai.com/codex/security (redirects to https://learn.chatgpt.com/docs/security; reviewed 2026-10-04).

The existing ohmyt shell explicitly creates a Bubblewrap filesystem with no /sys. Missing battery information inside that shell did not establish that the daemon itself was deployed inside Docker. The earlier explanation conflated shell isolation with service placement.

## Implemented architecture

Desktop Electron main process
→ owned Node utility process running the local daemon
→ local database, permissions, provider gateway and tool registry
→ workspace file tools / isolated workspace shell / approved native host shell.

The desktop starts its own runtime on a dynamically allocated loopback port and passes its connection to the isolated renderer through preload. It does not silently reuse an unrelated daemon at port 3188. A random per-launch bearer token protects API requests; SSE uses the same token. The service retains Host/Origin checks and loopback binding. Native execution is never exposed as arbitrary renderer IPC.

The default CLI daemon continues to offer workspace-only execution. Desktop enables shell_host explicitly. Permission evaluation and recorded tool events happen in AgentLoop before execution. Unknown shell_host commands default to ASK; stored permission rules apply. This is host execution with an approval gate, not an OS sandbox. Existing shell_exec continues using Bubblewrap on Linux. Non-Linux definitions omit the Linux-only tool.

runtime_info and the agent system context expose the actual platform, workspace, shell modes and possible container isolation. Commands use PowerShell on Windows and /bin/sh on Unix. The runtime can operate only on the OS it runs on: launching the whole app in a container cannot grant access to its parent machine.

The host executor supports working directories, bounded output, finite timeouts, per-run process tracking and process-tree cancellation. File operations retain their canonical workspace path boundary. There is no battery-specific tool or battery-specific routing logic.

Production desktop state lives under Electron userData/runtime, independently of its executable location. Workspace defaults to Documents/ohmyt. Development preserves the existing project data and workspace. OHMYT_WORKSPACE can select a different workspace at launch. Remote providers remain optional; existing Ollama integration remains available. Local-first is not a claim that all selected model inference is offline.

On shutdown, the desktop requests runtime shutdown and aborts owned runs. Startup failures and unexpected runtime exit are visible instead of silently switching to a remote executor.

## Validation and limits

Tests exercise native shell execution, default approval policy, child cleanup, host-disabled CLI behavior and API authentication. An Electron utility-process smoke test launches the real local daemon, verifies authenticated HTTP access and shuts it down. Existing protocol, response activity, concurrent-run and tool-budget suites cover regressions.

Native execution was tested on Linux in this environment. Windows PowerShell and macOS need platform validation before release. The current Electron distribution has no completed installer/packaging pipeline; assets and server modules must be shipped with the app. User-facing workspace selection and per-session workspace roots are not yet implemented. Existing Electron sandbox flags were not upgraded into a native OS command sandbox. This foundation does not provide browser/computer-use automation or a remote-machine bridge.
