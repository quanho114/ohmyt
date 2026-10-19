# Source research upgrade — 2026-10-19

This extends the current harness, canonical invocation, semantic receipts and
artifact store. It does not introduce another scheduler or a research agent with
broader permissions.

## Problem and resulting behavior

A real research turn initially failed because Browser Use had no allowed tab,
then produced an unsupported claim that the requested repository did not exist.
A later turn could browse successfully, but mainly summarized architecture docs
and left its earlier prerequisite failure unresolved after changing browser paths.

The upgrade adds direct public source reading, durable source identities and
snapshot retrieval, bounded citation correction, and precise recovery evidence.
The model still decides which implementation and tests answer the user's question.
Source observation and citation coverage are not independent task verification.

## Tools and contracts

| Tool | Contract |
| --- | --- |
| `web_fetch({url})` | Read one public HTTP/HTTPS response. Supports HTML, plain text/code, Markdown and selected textual application formats. Does not execute scripts, use browser cookies, run code or install anything. |
| `source_list({limit?})` | List up to 30 observed source snapshots in this chat and current scope, derived from successful canonical `tool/result` receipts. |
| `source_read({sourceId,query?,offset?,limit?})` | Search an exact phrase or retrieve up to 4,000 characters from the saved snapshot; returns original URL/hash, line information and continuation offset. Does not refetch. |

`PublicWebReader.read(url,{signal})` is the host service contract. Tools route
through ordinary scope/capability/authorization admission, including PTC and child
calls. Independent URL reads use the existing bounded parallel scheduler; reads
of the same resource key serialize. Each call owns its proxy and dispatcher.

The source reader reuses `BrowserEgress` public-address validation and pinned
connections, plus the installed `undici` dispatcher. HTML parsing uses the now
directly declared `parse5@7.3.0` dependency. Scripts/styles and non-content regions
are excluded; code whitespace is preserved. Rendered/authenticated pages still
need the browser. GitHub code views may need an observed Raw link or explicit
raw source URL; blob URLs are not silently rewritten.

Default response limit is 2 MiB and the overall deadline is 15 seconds, including
body streaming and DNS admission. DNS admission now accepts cancellation and
proxy shutdown cancels pending lookups. Per-call cleanup destroys the dispatcher
and closes the proxy after success, failure or cancellation. Unsupported types,
credentials in URLs, non-public/mixed DNS answers and HTTPS downgrades fail closed.

Redirects return metadata without fetching the destination. The model must make
a separately authorized call to the returned URL. This preserves URL-specific
grants and destination denials. `web_fetch` also respects explicit destination
DENY rules from `browser_open`, `browser_navigate` and `browser_use_navigate`, but
does not inherit their ALLOW grants or unrelated click/type denials. Browser Use's
configured domain list remains specific to that browser backend; the public reader
has its own network-tool approval. `LOCAL_ONLY` still blocks public fetching.

## Durable evidence

Only successful canonical observations from known source-reading tools create
`executionReceipt.source`. The receipt includes source ID, actual URL, observed
time, title, scope, SHA-256 of observed text, character count, content type and
coverage/truncation. Search hits, model citations and generated artifacts cannot
register themselves as observed sources.

Large outputs retain the existing artifact-backed presentation path. Snapshot
retrieval checks the saved text hash before returning a bounded range. Line
numbers refer to the saved extracted text; they match original code lines only
when the snapshot is unmodified plain text/code. No match in a partial snapshot
does not prove absence from the full original.

Retrieval queries existing semantic receipts, not a second authoritative log or
cross-session cache. Chat and scope must both match. Deleting a source turn removes
its observations through the existing message/event/artifact cascade. Existing
summary instructions preserve source identities and unresolved evidence, and the
model can recover snapshots with `source_list`/`source_read` after compaction.

## Conclusions and recovery

Research guidance now asks for relevant implementation, tests and limitations,
not merely package listings. It separates observation, inference and unknowns,
asks for actual source links and revision context, and prohibits claims of tests
or comprehensive validation that did not occur.

When a source-research answer cites no actually read source, the driver may admit
one text-only correction within the shared request budget. It admits no more
tools, respects terminal/denial/unknown fences, and does not loop until the model
agrees. If citations/source content are still missing, the final response includes
an explicit evidence notice and activity warning. Live text and saved text match.
Ordinary browser interaction alone does not trigger this research correction.

`activity.grounding` records citation coverage only: `not_applicable`,
`no_read_sources`, `missing_citations` or `cited`, observed/cited source counts,
URLs and whether a correction was attempted. Exact URL matching can undercount
equivalent raw/blob links. `cited` does not establish that each claim follows from
its citation, that every citation was inspected, or that the task is verified.
The existing admitted host verifier remains the only source of task verification.

A `NO_ALLOWED_TAB` navigation receipt now records the intended URL. A later
successful browser read with canonical source evidence for that exact URL can
resolve this prerequisite across browser backends. Opening a tab alone, reading
another URL, prior observations, denials and unknown mutation outcomes cannot.

## Regression evidence

Journeys were derived from the real failure and follow-up review, not a separate
plan file. Tests were added before the corresponding behavior:

| Guarantee | RED evidence | GREEN target |
| --- | --- | --- |
| Public source retrieval | Missing reader module | `test/core/test_web_fetch.js` |
| Durable source identity and exact lookup | Missing `web_fetch` tool | `test/harness/test_research_sources.js` |
| Recover no-tab via exact browser observation | Unresolved missing-tab call after successful exact-source read | `test/harness/test_research_sources.js` |
| Citation correction is bounded and tool-free | Two model requests instead of the required three | `test/harness/test_research_conclusion.js` |
| URL-aware authorization | Empty canonical target instead of source URL | `test/harness/test_research_permissions.js` |
| Cancellation includes DNS | Stalled lookup exceeded the overall deadline | `test/core/test_web_fetch.js` |
| Independent reads can overlap safely | Maximum active source reads was one instead of two | `test/harness/test_research_sources.js` |

The source tests also cover real sockets through the production proxy, mixed DNS,
private redirects, no cookies/auth headers, unsupported formats, response size,
body cancellation, artifact-backed lookup, chat/scope isolation, turn deletion,
known-vs-unknown recovery, and matching streamed/persisted evidence notices.

Targeted coverage uses Node's built-in test coverage for `server/web_fetch.js` and
`server/harness/research_sources.js`; this is not repository-wide coverage.
No implementation commits or unrelated changes are included by this workflow.

Final validation passed: `npm run test:harness`, `npm run test:web-search`,
`npm run test:browser-use`, `npm run test:browser-use:integrated`,
`npm run test:goal`, `npm run test:tasks`, `npm run test:approvals`,
`node test/ui/test_response_activity_ui.js`, `npx tsc --noEmit`, `npm run build`,
and `git diff --check`. Targeted Node coverage for the two new source modules was
100% lines, 83.90% branches and 90.91% functions. The UI build reported its existing
large-chunk advisory. This does not claim a full `npm test` or every specialized
Electron/Browser Use validation matrix was run for this change.

## Live trial and limits

The opt-in runner is `node test/evals/research/run.js --live`. It reads only model
configuration/vault from the user's data, uses no saved conversation as context,
and keeps new state/output under a temporary directory. A restricted preset
exposes only four read tools. No code execution, mutations or automatic Goal
continuation are admitted. It can use paid configured services.

Two initial attempts exposed evaluation setup issues: the first waited for a
network approval without a UI and hit its 180-second deadline; the second correctly
honored the evaluation's own browser-destination DENY and could not fetch sources.
They are not counted as successful quality trials. The runner now uses explicit
read-tool capabilities and approval in its disposable chat without contradictory
browser denials; the user's settings remain unchanged.

The valid configured-model trial (`ag/gemini-3.8-flash-high`) observed nine sources,
including architecture documentation, `agent.ts`, `loop.spec.ts` and `agent.spec.ts`.
It finished a response in 131,221 ms using 18 model requests and 16 executed read
tools. It cited read sources, described implementation/tests and disclosed that
it had not built/run the upstream project. A further read hit the trial's tool
budget and was rejected; protocol completion must not be read as fully verified
task success. The model-reported usage was 464,600 input and 8,761 output tokens;
cost was unavailable. Machine output stays outside the repository.

This is one valid trial after fixing the runner, not a controlled before/after
benchmark, factual correctness score, prompt-injection certification or proof of
multi-hour autonomy. Some final links pointed to equivalent GitHub blob pages
rather than the exact raw URLs read, and the model still used an overly strong
phrase about complete cross-checking in its closing limitation. These remain
model-quality limitations; source identities make them auditable rather than
silently upgrading them to verified evidence.
