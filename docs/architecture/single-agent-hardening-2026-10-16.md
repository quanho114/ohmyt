# Single-agent runtime hardening — 2026-10-16

This change closes concrete correctness gaps in the existing single-agent loop.
It does not replace the harness, introduce a second scheduler, or establish that
an arbitrary model will always complete a task correctly.

## Execution and outcomes

- Canonical invocation fences further tool bodies after an unknown outcome,
  including nested PTC calls whose program catches the error. A body waiting for
  approval or middleware rechecks that fence before execution and budget charge.
- Task outcomes and admitted host verifiers see nested canonical receipts as well
  as top-level tool results. A successful wrapper cannot erase an unresolved call.
- Host-shell timeout or signal interruption preserves process observations and
  reports `TOOL_OUTCOME_UNKNOWN`; it cannot silently admit a sibling mutation.
  Known nonzero exits remain ordinary errors. Started effects are not rolled back.
- Steering accepted during the last model request becomes a queued human turn
  after settlement. Explicit cancellation cancels it rather than restarting work.
  Startup recovery remains disarmed. Submission fingerprints preserve retries
  across mode changes, edits and consumption without executing the request twice.
- Anthropic SSE, PTC pipe messages and host/workspace shell output decode UTF-8
  incrementally. Split Vietnamese characters, emoji and tool arguments remain
  intact; existing process limits and raw-byte PTC output ceilings remain intact.

These contracts extend [harness integration](harness-integration.md) and the
[PTC runtime seam](ptc-runtime.md).

## Regression evidence

The new tests were observed failing before the corresponding production fixes:

- `test_harness_uncertainty_fence.js`: caught unknown RPC, a pending body after
  middleware wait, and a real host command interrupted after writing a temp file.
- `test_harness_late_steering.js`: actual HTTP admission during the final stream,
  exactly-once follow-up, explicit stop, submission retries and old inbox schema.
- `test_anthropic_stream_unicode.js`: every byte boundary of Vietnamese text,
  emoji and tool-call arguments.
- `test_shell_unicode.js`: real host and Linux sandbox stdout/stderr, one-byte
  writes. `test_harness_ptc.js` adds a large Unicode RPC/output round-trip.

Final validation on Linux:

| Check | Result |
| --- | --- |
| `npm test` | Passed, including harness, 26 architecture acceptance scenarios, goals and task workflows |
| `npm run test:harness:ui` | Passed, including actual Electron stop/drain, queue controls, artifact sandbox, settings and Goal UI |
| `npm run test:sandbox` | Passed under Node and Electron, including isolation and large sensitive-file trees |
| `npx tsc --noEmit` | Passed |
| `git diff --check` | Passed |

Existing test assumptions were brought into line with current behavior: explicit
five-step configurations exercise final-turn limits; valid siblings retain their
own execution receipts when another call has invalid arguments; fixtures check
the actual project files and await full daemon cleanup. UI smoke tests use the
current visible settings surface rather than the removed preset page. These are
test corrections, not changes that restore an obsolete five-step runtime cap or
reintroduce hidden settings.

## Live conversational smoke evaluation

`test/evals/conversation/run.js` completed all nine structural checks on the
configured model route (`ag/gemini-3.8-flash-high`). It used synthetic history, an
in-memory database, a disposable README-only project and denied effectful tools.
The user's saved conversations were not used as model history or modified.

The observed responses distinguished greetings and topic changes from tasks,
accepted a pending file-read proposal, read the requested README after a French
social preface, asked which of two ambiguous changes was intended, and translated
an action sentence without executing it. File summaries matched the fixture;
the model distinguished documented `npm start` instructions from actual execution.
The clarification case is intentionally cancelled after capturing its question.

This is one post-change trial per case on one configured route, without a paired
pre-change baseline. It verifies the observed control behavior, not a general
quality score, provider identity guarantee, performance improvement or universal
completion rate. Live responses and machine logs stay outside the repository.
