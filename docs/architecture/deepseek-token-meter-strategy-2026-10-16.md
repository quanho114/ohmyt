# DeepSeek-compatible token measurement strategy for ohmyt

Status: researched proposal; no runtime behavior changed by this document.

## Evidence and scope

Reviewed DeepSeek Harness revision `1517a4dbca0a2789ff1d41ba439600f8547d23fa`
from https://github.com/deepseek-ai/deepseek-harness, especially:

- packages/llm/token-meter/src/estimate.ts
- packages/llm/token-meter/src/index.ts (measure and usage anchors)
- packages/llm/token-meter/src/usage-projection.ts
- packages/llm/token-meter/src/breakdown-projection.ts
- packages/llm/token-meter/src/turn-usage.ts
- packages/llm/token-meter/README.md

This is parity with the pinned implementation, not a promise of future upstream
compatibility. Preserve MIT licensing and record source hashes if adapting code.

ohmyt currently estimates JSON request characters / 3 plus a fixed image allowance
in server/harness/context.js. TokenCounters supports route counters, but the
composer displays only the latest main attempt's preflight estimate. Attempts
persist provider usage when supplied. The inspected 18,255-token attempt had no
provider usage; it is not a measured provider bill. Historical semantic snapshots
exclude the assembled system prompt and full tool envelope, so an exact historic
composition cannot be recovered from those snapshots.

## What upstream actually does

The fixed estimator prices text at four characters per token, adds role/block
framing, and prices serialized tool schemas separately. It explicitly documents
inaccuracy for CJK and schemas. It does not make arbitrary models tokenizer-exact.
A session-local deterministic fold consumes durable events, tracks the current
request header and visible surface, and exposes immutable measurements.

Three outputs have distinct meanings:

1. tokenUsage: cumulative provider usage buckets, with attempt/retry identity.
2. contextPressure: latest prompt pressure and projected next-request pressure,
   plus the recorded context window.
3. contextBreakdown: heuristic system/tools/messages composition, not an exact
   allocation of provider billing or projected pressure.

measure() can use a successful call's provider usage anchor only for an identical
canonical header (provider/model/tools/call configuration), and only when its total
is at least the matching route-priced heuristic anchor. Later visible changes are
signed deltas, so compaction can reduce pressure. A changed header falls back to
full estimation. Route-owned image/file representations matter. Upstream measure
includes request/response pressure; it is not simply the last prompt count.

## Proposed implementation sequence

### 1. Normalize provider usage before changing the display

Audit gateway/adapters including the configured OpenAI-compatible proxy. Preserve
missing usage as unknown. Normalize input, output, reasoning and cache buckets at
the adapter boundary: upstream expects disjoint input/cache buckets, whereas some
APIs include cache hits inside prompt totals. Never add reasoning twice or count
cached tokens twice. Verify usage-only final stream chunks, retries and cancellation.
Record provenance: provider-reported, route-tokenizer, or heuristic.

### 2. Introduce one shared meter on existing semantic events

Extend TokenCounters and existing projections rather than mounting a second
session store or importing upstream's whole runtime. Persist a versioned compact
request-meter record before dispatch: canonical envelope digest, route, effective
capacity, reserve, component estimates, surface revision and estimator version.
Keep schema/prompt digests and sizes sufficient for meter invalidation; do not
claim exact replay from hashes. Full request retention is a separate privacy and
storage decision, not required for the meter.

Implement a pure fold with checkpoints invalidated by log deletion revision,
route/header changes and estimator versions. Preserve current user/steering,
complete call/result groups and receipts. Reuse upstream anchor eligibility and
signed-delta semantics; the pure service makes no model calls or tool decisions.

### 3. Preserve the distinction between UI capacity and admission budget

Expose native declared model capacity separately from the effective harness cap
and response reserve. Unknown native capacity stays unknown. Keep the 100k default
harness cap and smaller declared-route clamp until explicitly reconfigured.
The ring should name its denominator. Show provider prompt usage for the latest
completed request when available, projected pressure as estimated, and cumulative
billing separately. Never silently substitute one metric for another. Composition
rows may not sum to provider usage and must be labeled estimates.

### 4. Actually reduce request overhead as a separate change

Meter parity alone does not reduce requests. Replace repeated task/browser/HITL
instructions with concise invariant guidance and load detailed task guidance only
when needed. Investigate scoped tool discovery using the existing registry: start
with a small discoverable catalog and request only selected schemas. Avoid greeting
keyword routers, hidden execution permission, extra classifier model calls, and
catch-all execution tools. Scope, DENY precedence and canonical invocation remain
authoritative. Preserve discoverability of browser/document/approval workflows.
This stage needs separate behavior evals; it must not be bundled into a cosmetic
estimator change.

### 5. Admission and compaction consume the same measurement

Initially run the new meter in comparison mode while the existing conservative
request fitting remains authoritative. Measure disagreement and overflow cases.
Only switch compaction/admission after fixtures cover replacements, schema changes,
images, summaries and model routes. Heuristic-only routes still need headroom and
bounded overflow handling. Unknown mutation outcomes never authorize replay.

## Acceptance criteria

- Golden fixtures match the pinned upstream text/tool pricing and anchor rules.
- Independent provider fixtures verify cache/output/reasoning normalization.
- Changing model, tools, call config or deletion revision invalidates stale anchors.
- Compaction reduces projected pressure without deleting durable receipts.
- Missing usage never appears as exact zero; no unrelated-session measurement leaks.
- Retry totals count each billed attempt once; streaming/final samples do not double.
- Meter reads do not issue model requests and survive restart via existing events.
- Composer labels estimate, provider usage, capacity and reserve honestly.
- Real overhead reduction is benchmarked independently on greetings, document
  followups, browser tasks, HITL and uncertain effects using the same route/tools.
- Provider fixtures establish control correctness, not live-model task quality.

## Delivery order

First usage audit + shared meter + breakdown + UI. Then scoped guidance/tool
loading with task regression gates. Finally consider switching pressure admission.
Do not migrate npm to pnpm, adopt upstream's whole plugin workspace, or change
permission policies to achieve token-meter parity.

## Implemented measurement slice

The request boundary now records a digest of the actual prepared route/messages/
tools, fixed-density composition, and declared model capacity. This digest is not
used to extrapolate across future requests. The existing scoped latest-attempt
query joins its own completion by attemptId, preferring successful provider input
usage; unsuccessful or missing usage falls back to the original preflight count.
No provider usage anchor is borrowed across envelopes. This narrower behavior
avoids claiming full upstream replay/pressure parity.

OpenAI-compatible streams request include_usage and retain usage-only final
chunks. Gemini usageMetadata and Anthropic initial/final usage are retained.
Normalized input includes cached input; output includes reasoning. Cache and
reasoning fields are subsets, not extra totals. This differs from upstream's
internal disjoint input/cache convention and is explicit in providers/usage.js.
No unsupported-parameter retry is introduced: servers that reject stream_options
report their actual error instead of silently retrying a request.

The composer exposes estimated composition and declared model capacity separately
from the applied harness limit. Conservative admission remains unchanged.
Deferred: signed replay deltas, cumulative cost UI, optional exact tokenizers,
and scoped tool loading/prompt reduction. These require independent rollout;
this implementation does not reduce request contents or claim full parity.

Validation: test_token_meter_integration.js covers normalization, double-count
avoidance and the actual OpenAI stream parser; existing context pipeline/UI tests
cover persistence and display. No paid/live provider call is made by these tests.
