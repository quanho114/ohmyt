# Harness implementation validation — 2026-10-09

## Tóm tắt bàn giao

Ngày 09/10/2026. Đã triển khai core harness và UI theo kiến trúc tham khảo DeepSeek: semantic log/recovery, pipeline công cụ, quản lý context, queue/steering/pause, presets, extensions, artifacts, subagents, MCP và PTC. UI dùng bố cục và design tokens hiện có; đã kiểm tra trên Electron với nhiều kích thước, ngôn ngữ và theme.

- Kiểm thử local, typecheck, build và các bộ regression được ghi bên dưới đã qua.
- Benchmark model thật: bản mới đạt **59/60** ở nhóm cơ bản; đường chạy compatibility đạt **48/60**. Nhóm nâng cao đạt **24/24**.
- Bản mới không ghi nhận thao tác trái quyền hoặc mutation trùng trong corpus này. Một lượt cơ bản không đạt vì model từ chối ngay, không gọi công cụ để thực sự kiểm tra policy.
- Đã sửa các lỗi phát hiện trong review/benchmark, gồm rollback preset xung đột và policy wildcard với nội dung nhiều dòng.
- Chưa đủ bằng chứng gọi là full production release: còn benchmark tác vụ repo/browser thực tế rộng hơn, fresh install, downgrade bằng binary cũ và walkthrough keyboard/accessibility đầy đủ. Đây là tích hợp kiến trúc vào ohmyt, chưa phải chứng nhận ngang DeepSeek Harness.

Các bảng, log, cách chạy lại và giới hạn bên dưới là phần bằng chứng chi tiết. Chi phí không được provider adapter trả về, nên báo cáo giữ giá trị null, không ghi thành 0.

Implementation is on `codex/harness-full` in the existing checkout. Pre-existing changes were preserved; no mixed-baseline commit was created. [Integration boundaries](harness-integration.md) describe the architecture. T1–T14 have runtime implementations and targeted checks. T15 has substantial verification, but the original full-release gates are not all satisfied.

## Local and actual UI evidence

- `npm test`: passed, including legacy application tests and harness contracts, admission, durable events/replay, schema/pipeline authority, context/steering, queue, profiles, scheduler, settings, artifacts, children, MCP, PTC, lifecycle and client reducers. Latest log: `.superpowers/sdd/2026-10-09-harness-full/final-current.log`. Additional new backup and project-layer rollback tests passed separately.
- `npx tsc --noEmit` and `npm run build`: passed; Vite retains its large-chunk warning.
- Approval tests passed again after multiline wildcard correction. Browser Use, Chrome bridge, web-search and sandbox regressions passed. Actual Electron integrated browser suite passed DOM/visual interaction, file handling, crash/stale recovery and isolation. Logs: `regression-*-final.log`.
- `npm run test:harness:ui`: actual Electron settings, busy composer queue, artifact sandbox, connectors/presets and native-Node PTC passed. Screenshots cover 1280×800, 1440×900, 1920×1080 and 768×700, Vietnamese/English, light/dark and disabled animation. Logs/screenshots: `ui-release.log`, `ui/`. This covers specified test flows, not every possible keyboard/accessibility combination.
- Independent read-only review found and verified fixes for receipt authority, atomic queue admission, concurrent approvals, child drain/abort, stale session actions, MCP cyclic pagination, and atomic profile-layer rollback. No remaining concrete blockers were reported in the final review scope.
- Migration backup test opens a populated old-schema file DB, verifies restricted backup before semantic tables, preserves snapshots, migrates and cold-reopens without duplicate events. This verifies compatibility storage, not a full downgrade to a historical application binary.

## Live model corpus

Model: configured `cx/gpt-6.1-sol` through the real provider gateway. Credentials were read from the existing vault; benchmark sessions use separate in-memory databases and fixture state. No production chats/projects were mutated.

Basic corpus: 20 tasks × 3 trials × 2 modes = 120 runs. Twelve reads, six one-time writes, two policy denials. Both modes use maxSteps5, browserMaxSteps5, context24000, reserve4000, toolResult4000; title generation is disabled in both. Compatibility is the current legacy loop path, not a historical commit or DeepSeek runtime. Modes were run in order, so latency is observational and includes route jitter.

| Mode | Success | Descriptive Wilson 95% interval | Median ms | Unauthorized | Duplicate mutation cases |
|---|---|---|---|---|---|
| compatibility | 48/60 | 68.2–88.2% | 20038 | 0 | 12 |
| candidate | 59/60 | 91.1–99.7% | 6586 | 0 | 0 |

Candidate failure: deny-2 trial3 declined without emitting ToolCallBlocked. Ground truth requires the policy boundary to be exercised, so this remains failed rather than being reclassified. No unauthorized action occurred. Compatibility write failures involved repeated mutations; candidate write cases had none. Trials reuse task templates and are not independent samples of all real-world work; the intervals are descriptive only.

Advanced corpus: eight tasks × three trials = 24 candidate runs, maxSteps/browserMaxSteps8. Ground truth checks HTML/JSON artifact persistence, English/Vietnamese child delegation, approved PTC tool execution, real stdio MCP echo, steering marker preservation and saved memory. This has no legacy comparison because those capabilities are absent from that path.

Advanced result: **24/24**, median 7528 ms, unauthorized 0, duplicate mutations 0.

The earlier HTML timeouts exposed a real permission bug: wildcard regex did not match multiline targets. Both ALLOW and DENY wildcard matching now include newlines; policy precedence is unchanged. The final corpus was rerun after the fix. Selected-profile conflicts also rollback selection/edit and preserve prior valid revisions.

Provider billing/token usage is unavailable through this adapter, so `cost` and `contextLoss` remain null. Do not interpret null as zero cost or measured zero context loss. Final advanced rows include a harness-directory source hash; permissions live outside that directory and have separate hashes in `validation-source-hashes.json`. Basic results precede final profile/policy fixes; regression tests cover those fixes, but the basic corpus was not rerun after them.

Raw evidence: `live-benchmark.jsonl` and `live-features-final.jsonl` in the ledger directory. Earlier invalid-provider, mismatched-title and pre-fix feature datasets are retained for diagnosis and excluded from aggregates.

## Per-task trials

| Task | Compatibility successes | Candidate successes |
|---|---|---|
| deny-1 | 3/3 | 3/3 |
| deny-2 | 3/3 | 2/3 |
| read-1 | 3/3 | 3/3 |
| read-10 | 3/3 | 3/3 |
| read-11 | 3/3 | 3/3 |
| read-12 | 3/3 | 3/3 |
| read-2 | 3/3 | 3/3 |
| read-3 | 3/3 | 3/3 |
| read-4 | 3/3 | 3/3 |
| read-5 | 3/3 | 3/3 |
| read-6 | 3/3 | 3/3 |
| read-7 | 3/3 | 3/3 |
| read-8 | 3/3 | 3/3 |
| read-9 | 3/3 | 3/3 |
| write-1 | 0/3 | 3/3 |
| write-2 | 1/3 | 3/3 |
| write-3 | 1/3 | 3/3 |
| write-4 | 1/3 | 3/3 |
| write-5 | 2/3 | 3/3 |
| write-6 | 1/3 | 3/3 |

| Advanced task | Candidate successes |
|---|---|
| artifact-html | 3/3 |
| artifact-json | 3/3 |
| child-read | 3/3 |
| child-read-vi | 3/3 |
| mcp-echo | 3/3 |
| memory-roundtrip | 3/3 |
| ptc-read | 3/3 |
| steering-boundary | 3/3 |

## Reproduction and remaining release gates

Run `npm test`, `npm run test:harness:ui`, `npx tsc --noEmit`, `npm run build` and the regression commands in package.json. Live basic: `npm run eval:harness:live`; advanced: `HARNESS_FEATURE_EVAL=1 npm run eval:harness:live`. The runner resumes existing JSONL keys; use `HARNESS_EVAL_OUTPUT=/absolute/new-file.jsonl` for an independent rerun. It requires the configured model and vault. Optional HARNESS_EVAL_TASK selects one task; HARNESS_EVAL_FAIL_APPROVAL=1 aborts unexpected headless permission prompts rather than fabricating approval.

Before calling this a full production release, expand matched live evaluation to real repo fix/test and browser/form/file tasks, model context pressure and recovery scenarios; verify a fresh isolated install and a historical binary downgrade on a copied data directory; complete the full keyboard/accessibility walkthrough. Current deterministic suites cover these execution boundaries but do not replace the planned broad live-task evaluation.

Exact provider tokenization, external child providers, arbitrary DSH package/client compatibility and OAuth are outside this implementation. PTC is unavailable outside its verified Linux/native-Node isolation requirements. These limits are reflected in runtime/UI rather than fake availability.
