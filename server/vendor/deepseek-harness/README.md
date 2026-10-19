# DeepSeek Harness context/guard adaptations

Source: https://github.com/deepseek-ai/deepseek-harness/tree/1517a4dbca0a2789ff1d41ba439600f8547d23fa

MIT, Copyright (c) 2026 DeepSeek. Full license: `LICENSE`. Source file hashes
are pinned in `source-manifest.json`; upstream dependencies are not installed.

`context_utils.js` adapts two pure algorithms:

- Deep JSON key sorting/canonicalization from `repeat-tool-reminder`. ohmyt
  uses null-prototype objects so `__proto__` remains untrusted JSON data.
- Unicode code-point head/middle/tail pruning from
  `ToolResultPruner.pruneContent`, specialized to a single text value. ohmyt
  supplies its own artifact locator/omission marker and derives an 80/20 split
  from the existing per-result budget instead of upstream fixed head/tail sizes.

The repeat thresholds (3/5/8), advisory behavior and
reset on user steering are adapted in `server/harness/progress.js` and the
existing driver. Unlike upstream's Cordis per-agent WeakMap listener, state is
local to ohmyt's admitted run. Model-controlled argument payloads are not echoed
into system-role reminders; the original calls remain available as observations. Unknown outcomes and existing failure fences are
never overridden. The reminder does not skip execution or claim stalled results.

`request_envelope.js` adopts model-free pruning of large tool observations
before overflow at 80% route-accounted input pressure. It retains paired call
identities and untouched durable receipts. Upstream compaction services/session
schemas are not imported: ohmyt's canonical projection, cancellation, accounting,
shared budgets and scope remain authoritative. This is not full upstream runtime
or API compatibility, nor a claim of live-model capability parity.
