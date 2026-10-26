# Tests

Run commands from the repository root using npm. The suite names in `package.json`
remain the entry points; individual tests can also run with `node test/<group>/<file>`.

| Directory | Coverage |
| --- | --- |
| `browser/` | Browser control, Chrome extension and HTML previews |
| `core/` | End-to-end flows, sessions, tools and general application behavior |
| `cli/` | CLI process/PTY, submission API, discovery, lifecycle and Electron attach |
| `documents/` | Document formats, context, previews and image attachments |
| `goals/` | Goal runtime, controls and UI |
| `harness/` | Agent execution, history, providers of harness services and research |
| `providers/` | Model adapters, gateway routing and streaming |
| `sandbox/` | Project isolation, local execution and approvals |
| `ui/` | Chat, settings, rendering and interaction checks |
| `fixtures/` | Sidecars and subprocess fixtures shared by tests |
| `evals/` | Acceptance and evaluation runners |

Browser fixture HTML, fixture components, and shared runners remain at this level
so their development-server URLs stay stable. Generated outputs do not belong here.
