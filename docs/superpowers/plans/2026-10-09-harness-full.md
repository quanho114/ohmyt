# Full Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện harness theo kiến trúc DeepSeek trong ohmyt, có UI desktop rõ ràng và recovery/policy được kiểm chứng.

**Architecture:** Giữ Cordis host, SQLite, API/SSE và React/Electron. Chuyển dần từ loop cụ thể + transcript snapshots sang services có contracts, semantic log và projections; mỗi chặng vẫn chạy được ứng dụng. UI phát triển theo capability đã hoạt động, dùng các vùng hiện hữu.

**Tech Stack:** Node ESM, @deepseek-ai/cordis@4.0.4, SQLite hiện có, React 19/TypeScript, Vite, Electron; JSON Schema validator, tokenizer, YAML parser và MCP SDK chỉ thêm khi đến task sở hữu chúng, sau khi kiểm tra compatibility/license/version.

**Spec:** [harness-full-spec.md](../../architecture/harness-full-spec.md). Đọc cùng [research](../../architecture/deepseek-harness-research.md) và [baseline](../../architecture/harness-integration.md).

## Global Constraints

- Không reset/stash toàn workspace: đang có nhiều thay đổi trước plan. Khi execution bắt đầu, ghi baseline diff và chỉ commit paths/hunks do task sở hữu.
- Một writer thực thi trên mỗi session; các session khác vẫn chạy độc lập. Duplicate submission không tạo turn thứ hai.
- Persist tool intent trước execution. Crash với outcome chưa rõ tạo unknown result, không replay mutation.
- Policy deny không bị hook đảo ngược; mọi child/MCP/PTC call đi qua cùng policy và budgets.
- Giữ React/SQLite/SSE/Electron, existing themes và appearance settings; không redesign toàn app.
- V1 client contributions build cùng ứng dụng; backend plugin không được inject executable frontend code.
- Benchmark model thật tách khỏi tests deterministic; không dùng credentials thật trong fixtures.
- Mỗi task: test fail có ý nghĩa → implementation → test pass → review diff; commit chỉ phần sở hữu khi baseline cho phép. Không thêm tests chỉ mirror implementation.

## Review Focus

1. Crash sau side effect nhưng trước result commit: không replay, outcome unknown và history coherent (T3/T5).
2. Reconnect/event duplicate/session switch: không nhân output hoặc gán sang chat khác (T4/T10).
3. Unload/revoke trong khi approval hoặc child đang chạy: chờ drain, không cấp quyền lại (T5/T8/T12).
4. Xóa/branch/forward trong log migration: không resurrect dữ liệu hoặc copy privileges (T3).
5. Cửa sổ hẹp, tiếng Việt dài, keyboard-only và theme đổi: controls không mất, focus không nhảy (T9–T11/T15).

## Thứ tự và điểm release

`T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14 → T15`.

- **R1 — Runtime đáng tin:** T1–T5. UI cũ tiếp tục dùng projection tương thích.
- **R2 — Điều khiển tác vụ:** T6–T10. Có compaction, inbox, presets và quản lý extension thật.
- **R3 — App mở rộng:** T11–T13. Renderers, subagents, connectors.
- **R4 — Full scoped release:** T14–T15. PTC và benchmark/UI acceptance.

Các chặng lớn là subprojects, có tests và release gate riêng. Không deploy tất cả bằng một diff khổng lồ. Chưa ước lượng số ngày trước T1; đo thời gian hai task đầu rồi cập nhật estimate theo chặng.

## T1 — Baseline, contracts và UX inventory

**Files:** Create `server/harness/contracts.d.ts`, `docs/architecture/harness-ui-spec.md`, `test/fixtures/harness/`; modify `docs/architecture/harness-integration.md`.

**Interfaces:** Define `RunScope`, `AgentHandle`, `SessionEvent`, `ToolResult`, `RequestAttempt`, `ClientContribution` cùng version1. IDs riêng sessionId/turnId/stepId/attemptId/callId; không tái dùng callId làm artifactId. Event envelope `{sessionId,seq,eventId,version,type,payload,createdAt}`.

- [ ] Đối chiếu source hiện tại và upstream pinned commit; matrix mỗi subsystem: implemented/partial/planned/excluded, link file thực tế.
- [ ] Chạy `npm test`, `npm run build`, `npm run test:approvals`, `npm run test:browser-use`, `npm run test:sandbox`; lưu baseline failures riêng trước edit.
- [ ] Chụp app thực tại các kích thước/themes trong spec; inventory navigation/spacing/components và wireframes Settings, Composer busy, recovery, subagent activity. Ghi component tái dùng, mỗi control gắn user action/API.
- [ ] Chốt discriminated event/result/state types và fixtures; contract fixture phải reject thiếu ID/version và unknown result giả success.
- [ ] Review contracts và UX flow; cập nhật plan nếu source hiện tại đã đổi. Không bắt đầu UI với mock dashboard.

## T2 — Agents registry và loop driver

**Files:** Create `server/harness/agents.js`, `server/harness/driver.js`, `test/test_harness_agents.js`; modify `server/agent_loop.js`, `server/harness/host.js`, `server/index.js`.

**Interfaces:** `agents.create({sessionId,scope,driverId}) -> Promise<AgentHandle>`; handle `run(input)`, `pause()`, `resume()`, `abort(reason)`, `dispose()`; driver `run({handle,input,signal,services})`. Registry sở hữu admission/cancellation/cleanup; driver không sở hữu daemon DB lifecycle.

- [ ] Test same-session concurrency rejected, different sessions allowed, init failure rolls back, dispose twice succeeds, shutdown drains; chạy `node test/test_harness_agents.js` thấy fail vì service thiếu.
- [ ] Extract orchestration từ `_run` theo services, giữ facade/API cũ; built-in driver đăng ký Cordis, không import approval/browser implementation trực tiếp.
- [ ] Test real default driver và replacement driver dùng cùng registry contracts; `node test/test_harness_agents.js` và `npm run test:harness` pass.
- [ ] Review admission race và cleanup, ghi contracts rồi commit phần task.

## T3 — Semantic log, projections và migration

**Files:** Create `server/harness/log.js`, `server/harness/projections.js`, `server/harness/migration.js`, `test/test_harness_log.js`; modify `server/harness/sessions.js`, `server/db.js`.

**Interfaces:** `log.append(sessionId,expectedSeq,events) -> committedEvents`; `log.read(sessionId,{afterSeq,limit})`; `projectModelHistory(events,route)`; `projectConversation(events)`; `migrateLegacy(db)`. Transaction append/update checkpoint; UNIQUE(sessionId,seq), eventId dedupe; writer lease phải phục hồi sau restart.

- [ ] Failing tests: duplicate append idempotent; stale expectedSeq rejects; no torn transaction; unknown tool balanced once; cold reopen; delete anchor/session cascade; branch/forward copy text only; migration rerun unchanged.
- [ ] Implement turn/step/message/tool/attempt/control events. Migrate settled snapshots và legacy messages với deterministic origin IDs; legacy incomplete runs đóng unknown, không suy đoán side effects.
- [ ] Projection cache có version và rebuild; giữ UI messages/run_events adapters trong rollout. Log source duy nhất cho turn mới; không dual-write hai sources cạnh tranh.
- [ ] Chạy `node test/test_harness_log.js`, `npm test`, `npm run test:sandbox`; thử migration trên bản sao DB fixture và rollback compatibility. Review retention/deletion trước commit.

## T4 — Attempts và SSE replay

**Files:** Create `server/harness/attempts.js`, `server/harness/client_events.js`, `test/test_harness_replay.js`; modify `server/providers/gateway.js`, `server/api.js`, `src/api.ts`, `src/types.ts`.

**Interfaces:** `attempts.run({stepId,request,signal,retryPolicy})`; `GET /api/sessions/:id/events?afterSeq=&limit=`; SSE `id=sessionId:seq`; durable envelope T1 và transient delta `{sessionId,runId,attemptId,deltaIndex,...}`.

- [ ] Fail tests reconnect from cursor, duplicate settlement, partial stream then network failure, provider finish ordering, late delta after aborted attempt, two sessions interleaving.
- [ ] Persist attempt start/settlement and redacted errors/usage; retries only pre-tool model request with bounded attempts (default2) for classified transient transport failures; stream replacement keyed attemptId, không concatenate failed answer.
- [ ] Implement backfill + subscribe race-free, bounded replay pagination; no seq gaps silently accepted. Existing SSE adapter vẫn hoạt động.
- [ ] `node test/test_harness_replay.js` và `npm run test:harness` pass; verify reconnect không phát sinh provider/tool execution. Review native provider metadata.

## T5 — Authoritative tools pipeline

**Files:** Create `server/harness/tool_pipeline.js`, `server/harness/tool_results.js`, `test/test_harness_pipeline.js`; modify `server/tools.js`, `server/permissions.js`, `server/harness/host.js`.

**Interfaces:** `pipeline.execute({call,scope,signal}) -> ToolResult`; result `{callId,status:'success'|'error'|'denied'|'cancelled'|'unknown',modelContent,artifactRefs,executionReceipt}`. Monotonic decision `allow < ask < deny`; transformations chỉ đổi modelContent, không viết lại executionReceipt.

- [ ] Fail tests schema violations, malformed raw args, prototype keys, double-next, deny after allow, approval provider absent, stale approval, observer failure, timeout side effect unknown.
- [ ] Add JSON Schema validator đã kiểm tra tương thích; order validate → guards → approval → persist intent → execute once → persist receipt/result → project content → frozen observers. Projection errors giữ receipt và fallback output.
- [ ] Timeout/abort chờ body đạt quiescence; plugin không honor signal bị đánh dấu unhealthy, không dispose dưới body đang chạy. Không dùng Promise.race để giả đã dừng tool.
- [ ] `node test/test_harness_pipeline.js`, `npm run test:approvals`, `npm run test:harness`, `npm run test:sandbox` pass; review denied call không có execution side effect.

## T6 — Token accounting và compaction

**Files:** Create `server/harness/tokenizers.js`, `server/harness/compaction.js`, `test/test_harness_compaction.js`; modify `server/harness/context.js`, providers adapters/gateway.

**Interfaces:** `countRequest(request,route) -> {tokens,accuracy:'exact'|'estimated',source}`; `compact({sessionId,targetTokens,signal}) -> summaryEvent`. Summary `{sourceSeqRange,facts,openTasks,artifactRefs}` là model-derived context, không policy.

- [ ] Fail tests huge schemas, multilingual text, images, signatures, large tool results, deleted source, summary failure, model change, budget exceeded after compaction.
- [ ] Count serialized provider request gồm schemas/images/reserve; dùng provider-supported counting/local tokenizer khi phù hợp, fallback explicit estimated. Không gọi approximation “exact”.
- [ ] Trigger at 80% effective input budget; compact settled old turns only. Keep current turn/policy and recent complete tool groups; summary persisted with lineage. Nếu không fit, fail rõ; không loop summarization vô hạn.
- [ ] `node test/test_harness_compaction.js` và `npm run test:harness` pass. Kiểm tra cost/latency accounting gồm summary requests; review summary không tự cấp quyền.

## T7 — Inbox, steering, pause và safe continuation

**Files:** Create `server/harness/inbox.js`, `server/harness/controls.js`, `test/test_harness_controls.js`; modify agents/driver/API.

**Interfaces:** `enqueue({sessionId,clientMessageId,kind:'queued'|'steering',content})`; `editPending(id,content)`, `cancelPending(id)`; control endpoints `/api/runs/:id/pause`, `/resume`; persisted states queued/consumed/cancelled và running/pause_requested/paused/terminal.

- [ ] Fail tests steering during stream/tool/approval, duplicate enqueue, edit vs consume race, restart queued input, pause during mutation, abort while paused.
- [ ] Steering consumed ở boundary trước request kế tiếp, ghi event exactly once; queue tạo turn kế khi idle. Pause không cắt tool đã bắt đầu; báo waiting boundary. Đang chờ approval không tự đổi approval scope khi steering.
- [ ] Continuation sau crash tạo turn mới từ coherent state; unknown mutation yêu cầu inspect-state action trước tiếp tục. Không expose resume boolean hứa khôi phục exact instruction pointer.
- [ ] `node test/test_harness_controls.js`, `npm test` pass; review boundary state machine và pending messages retention.

## T8 — Scoped manifests, profiles và scheduler

**Files:** Create `server/harness/manifests.js`, `server/harness/profiles.js`, `server/harness/scheduler.js`, `test/test_harness_profiles.js`, `test/test_harness_scheduler.js`; modify host/tools/permissions.

**Interfaces:** Manifest version1 `{id,version,requires,capabilities,configSchema,contributions}`; profile `{id,version,plugins,budgets,model,scope}`. `resolveProfile(base,projectPatch,explicitPatch) -> effectiveConfig`; `schedule(calls,{scope,signal,maxParallel})`.

- [ ] Fail tests dependency cycle/missing version/duplicate ID, unknown config keys, invalid YAML, project privilege escalation, conflicting tool resources, unload pending approval.
- [ ] Safe YAML parsing không custom executable tags; overlays deterministic explicit→project→base precedence; credentials chỉ secret references. Preview effective config/diff trước apply; apply idle-only atomic with rollback.
- [ ] Tool metadata readOnly/resourceKeys/exclusive; default exclusive, opt-in parallel read-only disjoint resources; default maxParallel3. Results preserve call order; budgets shared across all calls. Profile không tự tạo grants.
- [ ] `node test/test_harness_profiles.js`, `node test/test_harness_scheduler.js`, approvals/isolation tests pass; review rollback restores exact registrations.

## T9 — Settings: extensions, presets, connectors foundation

**Files:** Create `src/components/ExtensionSettings.tsx`, `src/components/AgentPresetSettings.tsx`, `src/components/ExtensionDetail.tsx`, `test/test_harness_settings.cjs`; modify `src/components/SettingsPage.tsx`, `src/api.ts`, `src/types.ts`, `src/settingsLocale.ts`, `server/api.js`.

**Interfaces:** `GET /api/extensions`, `GET /api/extensions/:id`, `PATCH /api/extensions/:id {enabled,config,expectedVersion}`; `GET/PUT /api/agent-presets`; errors `{code,message,fieldErrors,retryable}`. API dùng auth/origin checks hiện có; state đổi sau ack.

- [ ] Implement API tests stale version409, busy409 có lý do, schema field errors, dependency disable failure, redacted config, restart persistence; endpoint không nhận arbitrary filesystem module path từ UI.
- [ ] Dựng rows + detail trên layout Settings hiện có; name/status/scope luôn đọc được; detail source/capabilities/dependencies/config/errors. Form schema v1 chỉ primitive/enum và sections, không render arbitrary HTML.
- [ ] Keyboard flow: search→open→edit→save→back, focus return; error ngay field, disable khi đang save. Bổ sung VI/EN, empty/loading/offline/retry.
- [ ] Chạy `node test/test_harness_settings.cjs` trên Electron + `npm run build`; lưu screenshots light/dark, cửa sổ hẹp, long labels. Review theo UX spec, không nghiệm thu bằng build alone.

## T10 — Composer controls và activity projection

**Files:** Create `src/harness/useRunControls.ts`, `src/components/PendingMessages.tsx`, `src/components/RunRecovery.tsx`, `test/test_harness_controls_ui.cjs`; modify Composer/ChatStage/ResponseActivity/App/api/types.

**Interfaces:** Hook consumes T4/T7 events, returns `{runState,pendingMessages,enqueue,edit,cancel,pause,resume,abort}`; UI reducers keyed sessionId/turnId/attemptId, never “latest tool”.

- [ ] Fail Electron flows submit queued/steering, edit pending, switch session midstream, replay duplicate, pause mutation then settle, cold restart unknown-action card.
- [ ] Busy composer defaults “Gửi sau”, explicit “Điều chỉnh tác vụ”; pending item remains until acknowledged consumed/cancelled. Keep draft on submission failure. Preset menu near model only if at least2 presets.
- [ ] Activity inline pause/recovery/status, details collapsed; keep stop visible. Confirmation chỉ action thực sự cần, không hỏi cho mọi click. Error actions map server eligibility; không show nút resume giả.
- [ ] `node test/test_harness_controls_ui.cjs`, existing session/stream tests, `npm run build` pass; screenshot and keyboard review. No automatic scroll/focus away from user selection.

## T11 — Client slots, artifacts và diagnostic pane

**Files:** Create `src/harness/clientRegistry.ts`, `src/harness/conversationReducer.ts`, `src/components/ArtifactPane.tsx`, `src/components/HarnessDiagnostics.tsx`, `server/harness/artifacts.js`, `test/test_harness_client.ts`, `test/test_harness_artifacts.cjs`; modify ContentBlock/ToolCallCard/ResponseActivity/HtmlPreview/BrowserPane.

**Interfaces:** `registerContribution(owner,definition) -> disposer`; slots spec-defined only, deterministic priority + duplicate rejection. Artifact `{artifactId,version,mime,title,scopeId,downloadRef}`; `GET /api/artifacts/:id` checks scope; `GET /api/runs/:id/diagnostics` redacted.

- [ ] Fail tests unload disposes renderer, collision, unknown renderer fallback, wrong-scope artifact, unavailable file, duplicate/out-of-order updates, browser pane + artifact focus conflict.
- [ ] Build local typed registry; generic cards remain fallback. Fold durable events deterministically, transient overlays removed at settlement. Render-specific errors caught at contribution boundary.
- [ ] Reuse existing side pane, one selected view; explicit user open action. HTML artifacts retain sandbox; mime validation/file limits/download auth reuse existing file security patterns. Redacted diagnostics include attempts/context/usage and export, không secrets/raw private payload mặc định.
- [ ] `node test/test_harness_client.ts`, `node test/test_harness_artifacts.cjs`, existing html/browser tests + build pass. Review light/dark/focus and plugin disposal on navigation.

## T12 — In-process subagents

**Files:** Create `server/harness/subagents.js`, `src/components/SubagentActivity.tsx`, `test/test_harness_subagents.js`, `test/test_harness_subagents_ui.cjs`; modify agents/profiles/budgets/tool pipeline/client reducer.

**Interfaces:** `subagents.spawn({parentId,task,presetId,capabilities}) -> childId`; `wait(childId,signal)`, `cancel(childId)`; lineage durable `{parentRunId,childRunId}`. Defaults maxActiveChildren3, maxDepth2; child spending debits parent total budget.

- [ ] Fail tests child requests elevated project permissions, recursive spawn cap, parent abort, child tool still draining, spawn failure rollback, unload provider during child run, restart parent+child unknown outcomes.
- [ ] Implement provider seam and first in-process provider; separate child session/context, permission intersection, no parent secret/history dump. Parent result summary references artifacts, not hidden thoughts.
- [ ] Activity grouped child rows with goal/status/result and independent cancel; details lazy loaded. No auto new sidebar chat; user may explicitly open child trace.
- [ ] Run both new suites, `npm run test:sandbox`, `npm run test:approvals`; verify parent abort drains subtree before disposal and same total budget cannot be multiplied by spawn.

## T13 — General MCP/connectors

**Files:** Create `server/harness/connectors.js`, `server/harness/mcp.js`, `src/components/ConnectorSettings.tsx`, `test/test_harness_mcp.js`, `test/test_harness_connectors_ui.cjs`; modify tools/secret store/API/Settings.

**Interfaces:** `connectors.add(config)`, `test(id)`, `connect(id)`, `disconnect(id)`; MCP transports stdio and streamable HTTP; tool namespace `connectorId/toolName`; resource reads treated as untrusted content. OAuth support only through tested SDK flow, không form giả “connected”.

- [ ] Fail fixtures malicious schema, duplicate tool names, transport timeout, revoked credential, reconnect duplicate registrations, disconnect with pending call, resource/prompt content attempting policy override.
- [ ] Research/pin official MCP SDK compatible installed Node; reuse browser MCP code only after verifying lifecycle/policy contracts. Cap schemas/output; explicit stdio command/args, no shell interpolation. Store credentials secret references, validate endpoints against existing egress policy.
- [ ] UI add→test→scope/capabilities→connect; states connecting/connected/error/disconnected, error has actual remedy. Disconnect removes registrations after drain; failed test never marks connected.
- [ ] Run both new suites, approvals/egress tests, build; real local MCP fixture executes through authoritative pipeline. Review credentials export redaction.

## T14 — PTC runtime

**Files:** Create `server/harness/ptc.js`, `server/harness/ptc_worker.js`, `test/test_harness_ptc.js`; modify tools/project sandbox/activity renderer.

**Interfaces:** `ptc.execute({code,scope,signal,budget})`; worker exposes only `tools.call(name,args)` RPC through T5, output channel and explicit artifact APIs. Defaults wall-time30s/output1MiB/maxSubcalls20/concurrency1; count all model/tool costs against parent budgets.

- [ ] Fail tests filesystem/network/process escape, arbitrary imports, infinite loop, output flood, denied subcall, abort during mutation, MCP/subagent nested calls, forged receipts.
- [ ] Verify existing project sandbox suitability; if it cannot isolate code, use OS process isolation with enforced scope/network/filesystem limits before enabling feature. Node vm alone is not security boundary.
- [ ] Every subcall has durable intent/result and normal approval. Disable memory of stale grants; worker failure marks unknown in-flight side effects, never retries. PTC enabled only when isolation probe passes, UI states unavailable with clear reason otherwise.
- [ ] `node test/test_harness_ptc.js`, `npm run test:sandbox`, approvals + harness pass. Review real adversarial worker cases before exposing model tool.

## T15 — Full release evaluation và UX acceptance

**Files:** Create `test/evals/harness/tasks.json`, `test/evals/harness/run.js`, `docs/architecture/harness-full-validation.md`; modify scripts/README/integration matrix.

**Interfaces:** Evaluation output `{taskId,trial,model,configHash,success,toolErrors,contextLoss,latencyMs,cost,terminationReason}`. Ground truth kiểm tra file/browser/artifact state, không chỉ model tự chấm.

- [ ] Freeze ít nhất20 tasks: repo read/fix/test, browser/form/files, context pressure, steering, crash, child, connector và PTC. Baseline vs candidate cùng model/settings/budgets, ít nhất3 trials/task; fixture cleanup độc lập. Live paid benchmark có explicit cost cap trước chạy.
- [ ] Critical contract gates: zero unauthorized actions, zero duplicated mutations do recovery/retry, zero cross-project data leaks, no unbalanced call/result. Bất kỳ violation block release.
- [ ] Quality gate: công bố per-task success và confidence/variance; không nhận regression repeatable ở baseline tasks. Cost/latency >20% phải có nguyên nhân và quyết định tradeoff ghi trong report, không âm thầm tăng budgets để che failure.
- [ ] Chạy `npm test`, build, approvals, browser-use, chrome, web-search, sandbox, browser-use integrated, tất cả new suites; kiểm tra fresh install, migration DB cũ, plugin/config disable và rollback trên bản sao.
- [ ] Electron UX walkthrough toàn flow T9–T13, theme/size/language/keyboard/reduced-motion; screenshot actual states. Kiểm tra không clipped buttons, nested scroll thừa, layout shift do activity updates, useless badge/toast hoặc fake data.
- [ ] Cập nhật matrix every layer implemented/evaluated/remaining, package/license notices và docs. Feature còn unavailable do isolation không đạt phải được ghi rõ; chưa đủ điều kiện gọi full release.

## Rollout và rollback

T3 migration transaction có schema version + backup procedure trước thay DB thực. Không xóa snapshots legacy trong release đầu; giữ read compatibility cho rollback, không dùng lại làm source cho turns mới. Test downgrade từ DB copy trước rollout; nếu binary cũ không thể hiểu log mới, rollback application vẫn dùng compatibility projection và dữ liệu log được bảo toàn, không downgrade schema phá dữ liệu.

T6/T7/T8/T12/T13/T14 có feature flags để đưa vào theo chặng; flags không override policy. Disable capability từ chối task mới rồi drain. Không dùng flag để che migration hoặc recovery không coherent.

## Checklist tự review plan

- [x] Mười subsystem trong research đều có owner task; DSH binary compatibility và external providers được ghi excluded rõ.
- [x] Runtime state, event IDs và artifacts có contracts dùng xuyên backend/client.
- [x] Năm failure classes Review Focus đều có tests được phân công.
- [x] UI có vị trí, user actions, APIs và acceptance thực tế, không chỉ tên component.
- [x] Migration, deletion, rollback, secrets, cost và cancellation nằm trong deliverables.
- [ ] T1 xác minh baseline thực tế và chốt UI screenshots trước execution các task còn lại.

Execution update 2026-10-09: T1–T14 have implementations and targeted tests; T15 has local/Electron checks and a synthetic live-model corpus. The original broad release gates (real repo fixes/browser tasks, fresh install and downgrade verification) remain incomplete. Detailed evidence and exceptions: [validation](../../architecture/harness-full-validation.md). Original unchecked acceptance items are retained as release gates rather than automatically marked complete.
