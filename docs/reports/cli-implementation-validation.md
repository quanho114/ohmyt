# CLI implementation and validation — 2026-10-26

Source intent: [CLI design](../architecture/cli-design.md).
Current behavior and known gaps: [CLI guide](../cli.md).

## Delivered journeys

- Open project chat in a terminal, submit a prompt, read streamed output, and
  resume history through the existing daemon/harness.
- Run a single prompt from arguments or stdin, with clean text/JSONL output
  and explicit exit status.
- Attach an authenticated Electron runtime or start a headless runtime without
  creating a second profile owner.
- Answer approval/questions interactively; noninteractive execution cancels
  and drains when human interaction is required.
- Interrupt a run, preserve project boundaries, and recover an enqueue whose
  committed response was lost without executing twice.

## TDD evidence

RED: `node test/cli/test_cli_api.js` failed with `404 !== 200` for the absent
runtime endpoint. `test_cli_client.js` initially failed to import the missing
client modules; this is scaffold evidence, not a behavioral RED assertion.
The API behavioral RED and initial tests were checkpointed in `79b4018`.
A fixture callback was corrected to use the production `streamChat(options)`
signature (`onChunk`) before GREEN; no production behavior was weakened for it.

GREEN commands actually run:

| Guarantee | Command / test | Result |
| --- | --- | --- |
| Stable runtime identity, scoped lookup, settlement, inbox dedupe/collision and lost-response recovery | `node test/cli/test_cli_api.js` | PASS |
| Loopback endpoint restriction, UTF-8 SSE chunks and control-character filtering | `node test/cli/test_cli_client.js` | PASS |
| Real CLI subprocess text/JSONL/stdin, wrong project, human input/approval cancellation and SIGINT drain | `node test/cli/test_cli_e2e.js` | PASS |
| OS-owned cooperative profile lock, concurrent auto-start, authentication, token mode, owner fence and stop cleanup | `node test/cli/test_cli_runtime.js` | PASS |
| Composer editing, multiline paste, command completion, expired question and resize logic | `node test/cli/test_cli_terminal.js` | PASS |
| Real PTY chat/paste/Unicode/resize/restore; desktop wins approval race | `node test/cli/test_cli_pty.js` | PASS |
| Real Electron utility runtime token/discovery/CLI attach and cleanup | `npm run test:cli:desktop` | PASS |
| Existing harness/persistence/provider/invocation/acceptance contracts | `npm run test:harness` | PASS |
| Approval modes and DENY behavior | `npm run test:approvals` | PASS |
| Project sandbox dispatch/isolation, Linux Node and Electron | `npm run test:sandbox` | PASS |
| Frontend type/build compatibility | `npx tsc --noEmit`, `npm run build` | PASS |
| Executable installation | `npm link --ignore-scripts --no-audit --no-fund`, `ohmyt --version`, `ohmyt --help` | PASS |

Coverage: `npm run test:cli:coverage` passed all six test files. Scoped report
for `cli/*.js`, `server/api/cli_routes.js` and `server/runtime/control.js`:
**91.09% lines, 68.80% branches, 80.43% functions**. The separate Electron test
also passed. Branch coverage is below 80%; command settings/pickers and rare
connection/startup failure branches remain less covered than execution paths.
Coverage describes fixtures/process control, not live model task quality.

The web build reported browser externalization for JSZip's `stream` import and
large-chunk warnings; the build completed. No live provider eval, Windows/macOS
terminal run, new platform sandbox equivalence claim, or full desktop GUI test
was performed. Electron coverage here uses the actual utility runtime with a
temporary data directory and a minimal parent process.

## Architecture review and limitations

No second agent loop, direct CLI SQLite writes or host shell fallback was added.
New API endpoints sit behind existing Host/auth middleware. Submission-to-run
naming stays inside the backend. Approval snapshots include descendants bound
to the specific parent run. History prefers semantic events and uses the
existing message endpoint only when semantic message events are absent.

The profile lock uses a deterministic loopback control listener. A collision
fails closed; this is cooperative with the CLI and desktop entrypoints. The old
`node server/index.js` development launcher is not enrolled in discovery/locking.
POSIX token ownership/modes are validated; Windows ACL management and platform
terminal behavior still need dedicated validation.

The initial terminal has a composer/status bar, basic Markdown formatting,
slash commands and activity, rather than complete Codex feature parity. Code
highlighting, a dedicated diff viewer, file/image picker, `/compact` and terminal
MCP/goal management remain roadmap work. Diff/review currently use agent tools.

## Self-evaluation

Using the agent-self-evaluation rubric:

| Axis | Score | Evidence / improvement |
| --- | --- | --- |
| Accuracy | 4/5 | Process/PTY/Electron and harness checks passed; live models and other OSes were not validated. |
| Completeness | 3/5 | Core terminal journeys work; full Codex picker/rendering parity remains explicitly documented above. |
| Clarity | 4/5 | Usage separates desktop attach, headless profiles and script output; long-term design still contains proposed contracts. |
| Actionability | 4/5 | `ohmyt` is linked locally and help works; a new headless profile still needs a configured model. |
| Conciseness | 4/5 | No new runtime dependencies; command dispatch would benefit from smaller command modules as it grows. |

Overall: 3.8/5. Highest-impact follow-ups are terminal rendering/pickers,
broader command/connection branch coverage, and Windows/macOS validation.
Completeness remains 3 because these UI capabilities need further implementation;
it is not a claim of complete Codex equivalence. A user expecting that complete
surface would reasonably keep this limitation in view.

Checkpoint commits are local TDD evidence. If squashed later, retain the API
RED and GREEN commands above in the review/merge description. No application
data, credentials, previews or generated test outputs belong in those commits.
