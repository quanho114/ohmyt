# DeepSeek Goal runtime source

Source: https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c

MIT, Copyright (c) 2026 DeepSeek. The full license is retained in `LICENSE`.
`source-manifest.json` records the exact upstream files and SHA-256 hashes.

## Imported code

- `service.js`: `GoalService` mutation methods, validators, phase transitions,
  revisions, timestamps and activation helpers from `goal/src/index.ts`.
  TypeScript annotations/decorators are removed; the Typert/Cordis constructor,
  remote transport, Zod projection schemas and registration are replaced by
  an injected adapter context. `agentEvents` and `SessionSeq` use small adapter
  outlets. The service's domain methods are otherwise preserved.
- `fold.js`: strict decoder and pure fold from `goal/src/fold.ts`, with types
  removed and its runtime import changed to `./runtime.js`.
- `runtime.js`: protocol constant, ID identity and `GoalError` adapted to Error
  instead of the DSH-specific HarnessError superclass.
- `prompt.js` and `wrapup.js`: round and terminal instruction renderers, with
  types removed. Their prompt text is upstream text.
- `shared/goal_command.js`: the pure `parseGoalCommand` function from
  `command-goal/src/index.ts`, exported with types removed. Its `.d.ts` is an
  ohmyt declaration. Shared parser contains no server runtime dependencies.

## Adapter boundaries

`server/harness/goal_lifecycle.js` uses the imported service and strict fold to
propose and validate mutations against a detached current projection. The
SQLite CAS in `goals.js` then commits the compatible snapshot. Embedded
`payload.lifecycle` identifies the validated proposal; it is **not a second
authoritative replay log**. Existing ohmyt event operations such as adopt,
progress, reserve and settle cannot be fed directly to upstream's strict fold.

Plans, budgets, permissions, scope and verification stay in ohmyt's existing
contracts. The adapter maps completed to upstream complete; review-required
uses a stopped projection for validating resume/complete/clear. Creation via
the existing API remains paused until human/model admission. A model complete
proposal waits for the final turn commit and unresolved-effect check before
the durable goal is completed.

Continuation uses the separate `goal_round_driver.js` consumer and process-local
activation. It ports the upstream admission policy to ohmyt's registry, rather
than importing upstream's Cordis agent/inbox implementation. Existing human
adoption still counts as round one for compatibility; old counters are not
rewritten. Restart remains paused/disarmed. The stronger same-blocker counter
and `await_input` are ohmyt extensions.

The terminal prompt is paired with an invocation fence: even additional calls
in the terminal model batch cannot execute a body. The command API handles
human pause/resume/edit/clear without passing those commands to the model.

Tests: `npm run test:goal` and `npm run test:goal:ui`.
