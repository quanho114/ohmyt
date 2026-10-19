# General document follow-up performance — 2026-10-16

## Baseline and bounded optimization

The inspected completed lookup took 32,295ms: 18,185ms in two history summaries,
13,086ms in main model requests and 903ms in two tool executions. The main
bottleneck was repeated model context work, not the spreadsheet parser. No paid
live-model comparison was run for this change. Search space: two bounded backend
optimizations, fixture providers and existing temporary-data document suites;
no user files or model configuration are changed.

## Accepted changes

1. **Reuse a validated summarized prefix as history grows.** The original raw
   prefix, source-event identities, scope, model route, fixed instructions and
   tool schemas participate in the cache key. A matching prefix can replace the
   corresponding old input before request fitting. If more summarization is
   necessary, summarize the validated checkpoint plus only the new suffix. Raw
   source counts/digests still describe the underlying history for future reuse.
   The current user input, steering and current document context are retained.
   Edited/deleted/reordered source spans or changed context invalidate reuse.
   Existing durable summary events provide the cache; no new store is introduced.
2. **Bounded source lookup.** `read_open_documents` and `artifact_read` accept an
   exact `query`, plus `offset` and `limit`. Both use the same literal text lookup,
   returning matching excerpt, source offset and line, without an auxiliary
   model, Python subprocess, network fetch or executable index. Documents retain
   reference path/grant/version; artifact reads retain their current session
   authorization. A missing snapshot match is not absence from the original.
3. **Bound automatic document context.** Small snapshots retain their previous
   behavior. When open tabs exceed 12,000 characters together, the model receives
   reference headers and bounded previews, with explicit retrieval instructions.
   The original snapshots remain in the current scope and are read by lookup.
   Closing a tab, changing a snapshot or changing scope immediately affects reads;
   there is no second stale source-text cache.

These changes apply to text extracted from Word, Excel, Markdown and the other
existing supported viewers, and text artifacts produced by tools. They do not
cache arbitrary shell commands, silently serve a downloaded remote file as fresh,
or claim that a partial extracted preview contains the entire source document.
The existing extractor limits and page selection remain explicit. Agent guidance
prefers bounded source queries when a relevant scoped source is already present;
it does not force an arbitrary source based on keywords.

## Measurement and correctness gates

| Case | Before | After | Gate |
| --- | --- | --- | --- |
| Appended history with valid prefix | Full old input, potential resummary | Fixture input 3,160 → 1,415 count units, no new summary request | Exact source digest/event/context key; current input retained |
| Exact lookup in fixture extracted text | Full source would be sent to model | Excerpt ≤300 characters; 100 lookups measured around 3–9ms locally | Same target value and faithful offsets |
| Many open document tabs | Up to ten 20,000-character snapshots | Bounded header/preview prompt under 15,000 characters in regression | Full snapshots retained and scope isolated |

New/extended regressions: `test_harness_source_lookup.js`,
`test_harness_artifact_read.js`, `test_harness_compaction_reuse.js`,
`test_harness_followup_context.js`. Runtime tool tests cover actual invocation for
Word/Excel/Markdown snapshots, foreign artifact denial and Unicode range handling.
These fixtures exercise extracted text; the separate `npm run test:documents`
suite exercises actual formats, viewer navigation, save/state and desktop context.
Full harness regression and frontend type checks are also run. Fixture timings
are not live model latency or a guarantee for every document size.

## Rollback

Remove prefix reuse while retaining exact-key summary reuse; remove query fields
while retaining bounded range reads; restore full prompt projection for snapshots.
No persistence migration or data deletion is needed. Existing authorization and
canonical tool invocation remain unchanged throughout.
