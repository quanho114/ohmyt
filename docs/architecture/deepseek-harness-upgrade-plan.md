# Kế hoạch nâng cấp harness sau review

Ngày: 11/10/2026. Baseline ohmyt `8de067e1ba8437b43c25cdc6c396a4762a42ab50`; DeepSeek `d743267388641bc76f17c45ce8b4c231aed1d32c`.

Trạng thái cập nhật: **đã triển khai S1–S9 trong working tree**. Người dùng đã yêu cầu hoàn tất phần còn thiếu sau S1–S8, gồm durable goals/plan và live evaluation. Các gate và kết quả thực tế nằm trong [validation](../reports/deepseek-harness-validation.md), [offline results](deepseek-harness-offline-results.json) và [live report](../reports/deepseek-harness-live-validation.md). Chưa commit. Các phần baseline/audit dưới đây được giữ để đối chiếu lịch sử.

| Slice | Kết quả triển khai |
|---|---|
| S1–S3 | Dừng browser có kiểm soát; rejected call có receipt; hủy sau body thành unknown |
| S4 | Outcome durable/atomic; UI VI/EN và child evidence phản ánh incomplete/unverified |
| S5 | Admission/usage chung cho main, title, summary, approval, child, planner và browser extraction; drain request trước settlement |
| S6 | Observation canonical; full text artifact theo scope; body-entry marker; bảy crash cuts, kể cả crash sau abort |
| S7 | Checkpoint có digest/source identities/route/scope/prompt; reuse qua steps và cold store; fields dữ kiện/công việc/refs |
| S8 | 26 architecture scenarios và 6 task trials scripted có oracle độc lập; runner live coding/research/browser/denial/context/child |
| S9 | Objective/plan durable, model khởi tạo từ yêu cầu trong chat, tiếp tục tuần tự có giới hạn, pause/edit/cancel, review, cold recovery và UI VI/EN |

G0 còn tìm được hai route settings chưa được nối với màn hình đã có. Đã phục hồi route/menu connections/extensions và kiểm tra bằng Electron. Các UI tests dùng thư mục tạm, giữ nguyên ảnh và tài liệu người dùng đã có.

Nguồn: [conformance và findings](../reports/deepseek-harness-conformance.md), [baseline validation](../reports/deepseek-harness-validation.md). Plan này thay roadmap A/B/C cho công việc tiếp theo; giữ tài liệu cũ như lịch sử, không chạy lại A/B/C như một dự án mới.

## Ranh giới và các quyết định

1. `AgentRegistry` sở hữu admission/session ownership; `driver.js` sở hữu execution và turn settlement; `HarnessHost` composition/request admission; `ToolInvocationService` là đường tool authoritative; `SessionStore`/`SessionLog` là semantic history; UI chỉ đọc projections.
2. Giữ SQLite, API/SSE event names, browser/MCP/PTC/skills/memory/provider adapters, tool names, plugin IDs. Giữ compatibility adapters đến khi có chứng minh thay thế. Không đổi runtime sang nguyên DeepSeek, không thêm loop/state machine cạnh tranh.
3. Tách `protocolStatus`, `taskStatus` và `verificationStatus`. Model final text chỉ chứng minh protocol completion. Run `completed` cũ không tự suy ra task verified.
4. Thêm result projection/event có version, legacy consumers bỏ qua field mới vẫn settle stream bình thường. Không thêm DB run status hàng loạt trước khi trace tất cả consumers.
5. Rejected args là correction observation; policy denial và unknown mutation là ranh giới không được bypass. Không tự retry tool body để “recover”.
6. Không xây generic independent evaluator bắt model trả lời thêm sau mọi task. Verification phải dựa test oracle, website state, artifact checks hoặc evidence adapter xác định; thiếu evidence trả unverified. Với tác vụ thuần hội thoại có thể dùng verification `not_applicable`.
7. Không áp “mọi tool error = task failed mãi mãi”. Error chỉ được resolved khi có bằng chứng operation/criterion đó đã được hoàn thành hoặc người dùng đổi scope; một tool thành công không liên quan không đủ. Optional probe failure cũng không tự thành required work.

## Thứ tự và gate

```text
G0: baseline/UI diagnosis
 → S1 browser stop
 → S2 recoverable per-call rejection
 → S3 post-body cancellation
 → S4 truthful outcome + child result
 → S5 shared model admission/usage
 → G1 correctness release gate
 → S6 canonical observation + crash recovery
 → S7 reusable compaction + fidelity
 → G2 reliability/context gate
 → S8 independent quality evals
 → G3 product evidence
 → S9 goals/plan; limited UI presentation (đã được người dùng yêu cầu tiếp tục)
```

Mỗi slice là một diff/commit review được độc lập. Chạy focused tests, regression phù hợp, review diff, ghi validation trước khi chuyển slice. Không lập lịch thực thi background hoặc gọi provider trả phí trong kế hoạch audit này.

## G0 — Baseline và xác định lỗi Electron

- Đã có baseline test/build/typecheck/browser suites và 10 offline acceptance scenarios; lưu kết quả đúng HEAD.
- Trước code change tiếp theo, ghi lại HEAD/status; bảo vệ untracked work có sẵn.
- File kiểm tra: `test/harness/test_harness_controls_ui.cjs`, `src/App.tsx`, `src/components/Composer.tsx`, `server/harness/controls.js`, `test/core/test_send_now_replacement.js`.
- Diagnostic đã xác định assertion đầu truy vấn `button[aria-label="Gửi yêu cầu"]` trong lúc run busy, nhưng `Composer.tsx:826` chuyển label thành `Gửi tin nhắn tiếp theo`. Update selector theo state/contract; rerun mới xác định những assertions tiếp theo còn lỗi hay không.
- Phân biệt test selector lỗi thời, timing và product defect; fixture hiện có assumptions về send-now cần đối chiếu contract hiện tại. Bổ sung renderer diagnostics vào test nếu cần, không sửa sản phẩm chỉ để khớp assertion cũ.
- Exit: baseline failure có nguyên nhân và test phản ánh contract được chọn; gate UI hiện tại phải qua trước tuyên bố release ready. Có thể tiếp tục sửa core độc lập khi lỗi UI chưa rõ, nhưng không đánh dấu full gate xanh.
- Migration: không có. Rollback: revert slice diagnosis/test, giữ output riêng tránh overwrite ảnh người dùng.

## S1 — Dừng browser có kiểm soát (F1)

- Files: `server/harness/driver.js`, browser state/result helpers nếu cần; focused regression mới trong `test/`.
- Dùng turn stop reason trong driver đang có. Khi đủ 3 failures hoặc 3 identical action/image states: ngừng admission browser actions, settle mọi call trong batch, chỉ cho phép bounded conclusion nếu budget còn; outcome blocked/failed theo evidence.
- Không chỉ khai báo `conclusionRequested`; flag phải có consumer và stop transition. Failure threshold lấy config đã có hoặc thêm cấu hình validated có default 3; không tự mở retry mutation.
- Tests: 2 failures chưa stop; 3 stop; success reset counter; identical screenshot/action nhưng snapshotId đổi; no fourth body; paired results; cancellation/release; text không báo success.
- Gate: targeted browser stop + browser vision/unit + final conclusion/protocol + `npm run test:browser-use`.
- Migration: không có. Risk: dừng batch sớm làm orphan results; rollback code slice giữ observation/ownership behavior cũ, không replay task.

## S2 — Arguments sai trở thành observation (F2)

- Files: `driver.js`, `tool_invocation.js`, `tools.js`, `contracts.js`, `contracts.d.ts`, `tool_results.js`; scheduler chỉ khi cần để xử lý planned rejected slots.
- Chuyển validation authoritative về invocation service. Driver chỉ lập scheduling metadata bằng resolution an toàn; không gọi map có thể throw và bỏ cả batch. Không để readOnly/resourceKeys classification bị quyết định bởi unvalidated args.
- Giữ status vocabulary cũ nếu có thể: `error` + code `INVALID_ARGS` / `UNKNOWN_TOOL`; `denied` + policy/scope code. Invalid identity/collision là protocol violation rõ ràng, không tự rename để replay mutation.
- Invalid call có canonical receipt, `bodyStarted:false`, id/name và correction detail bounded. Valid siblings chạy theo policy/scheduler bình thường; strict dependent batch có thể reject toàn bộ chỉ khi dependency được khai báo.
- Giới hạn malformed corrections theo run budget và counter rõ (đề xuất default 3 consecutive malformed steps, reset sau corrected valid batch); denial không được tính thành malformed retry. Model phải tạo call mới khi sửa args; same ID/different args vẫn collision.
- Tests: malformed JSON/object/nested schema/unknown name; invalid+valid siblings; corrected request trong cùng turn; repeated bad calls bounded; missing/duplicate IDs; denied cannot bypass qua PTC/browser/child; uncertain mutation không replay.
- Gate: invocation/schema/scheduler/authority/protocol + full `npm run test:harness`.
- Migration: không bắt buộc; nếu thêm payload field thì optional/versioned. Risk: nhầm denial thành retryable error; rollback preserve all receipts mới, không xóa log.

## S3 — Cancellation sau body settle (F4)

- Files: `tool_pipeline.js`, `tool_invocation.js`, `host.js`; `test_harness_invocation_lifecycle.js`, `test_harness_pipeline.js`.
- Track body entry riêng với policy/intent. Giữ body-entry abort gate và quiescence; sau body settle, signal aborted không được publish success nếu chưa có contract proof chắc chắn về completed outcome.
- Never started → cancelled; started nhưng chưa biết external effect → unknown. Không mặc định every exception = no effect. Chỉ tool-specific evidence có thể nâng unknown thành confirmed result; callback hậu kiểm không cấp thêm quyền.
- Tests: abort trước policy, lúc middleware chờ, sau body start nhưng body return normally, abort sau committed receipt, delayed external completion, parent cancellation/drain.
- Gate: existing quiescence/invocation/child cancellation + new probe regression; permissions/receipt immutable.
- Migration: additive receipt metadata khi cần, không sửa receipt đã commit. Rollback: revert implementation, giữ unknown receipts; tránh rerun external operation.

## S4 — Outcome đúng và child evidence (F3)

- Files: `driver.js`, `sessions.js`, `projections.js`, `contracts.*`, `plugins/subagents.js`, `subagents.js`, `client_events.js`, `src/types.ts`, `src/App.tsx`, `src/components/ResponseActivity.tsx`.
- Bổ sung durable compatible outcome projection: protocol completed/failed/cancelled; task completed/partial/blocked/failed/unknown; verification verified/unverified/not_applicable; evidenceRefs, unresolvedCallIds, stopReason. Final schema chốt trước implementation; không phân loại bằng text chứa từ “done”.
- Outcome và final message/UI mirror/turn end commit trong transaction hiện có. SSE chỉ publish sau commit; `RunCompleted` cũ giữ terminal transport semantics với summary trung tính và optional outcome; adapter mới không báo mạnh hơn task/evidence state.
- Replaces `completedWithWarnings` heuristic bằng tiêu chí evidence và unresolved work. Errors còn chưa xác minh không trở thành completed chỉ vì unrelated read thành công.
- Child results trả status/summary/evidence/artifactRefs/unresolved/verification. Parent không coi completed child là verified. Không bắt trivial child chạy verification request phụ; cập nhật mô tả `subagent_wait` cho đúng guarantee.
- Tests: required write fail + read success; corrected operation success; optional read error; protocol-only final; partial/blocked; independent test failure despite confident final; child warning propagation; legacy metadata/SSE/replay/cold reopen; UI VI/EN.
- Gate: final conclusion/tool recovery, atomic session commit, subagents, response activity, harness controls/UI and full tests/build/typecheck.
- Migration: ưu tiên optional event payload/projection; event type mới cần version/reader test. Không thêm mandatory status/column. Risk: legacy clients hiểu completed là task success; rollout adapter trong cùng slice. Rollback: legacy transport vẫn đọc được; back up DB trước mọi migration thực sự.

## S5 — Admission và usage chung cho mọi request (F5)

- Files: `host.js`, `attempts.js`, `budgets.js`, `browser_integration.js`, `session_titles.js`, `approval_modes.js`, `driver.js`, usage/report projections.
- Một request admission helper trong host hiện tại với `purpose`: main/title/summary/approval/browser_planner/child. Count một lần mỗi physical attempt; child share root budget. Tool budget vẫn tính body invocations, tách attempted/rejected telemetry nếu cần.
- Browser planner phải consume root request budget trước dispatch, validate terminal signal trước parse JSON/done, propagate cancel và await request quiescence. Không biến planner thành agent loop thứ hai.
- Title/approval dùng helper để có usage record, không chỉ count. Compaction đã consume requests: giữ behavior này và tránh double count khi hợp nhất. No-gateway compatibility cần test riêng hoặc ghi rõ giới hạn; không bỏ adapter vô tình.
- Input/output actual tokens và estimates lưu tách; null khi provider không báo. Cost chỉ estimate có route/pricing source; không suy token usage từ request budget. Có thể hoãn monetary hard limit đến khi pricing đủ tin cậy.
- Tests: exact count main+retry+title+summary+review+planner+child; root exhaustion trước dispatch; no-body retry trên uncertain writes; incomplete planner stream dù JSON hợp lệ; timeout request drain; missing usage/null; no double-count.
- Gate: request budget/replay/title/approvals/browser integration/subagents + harness suite. G1 hoàn tất sau S1–S5 và UI gate xanh.
- Migration: additive events/fields; tránh đổi default step budgets incidental. Rollback helper adapter slice, giữ usage records; không retry request/tool khi rollback.

## S6 — Canonical observations và recovery cuts (F6/F8)

- Files: `tool_results.js`, `tool_pipeline.js`, `driver.js`, `projections.js`, `sessions.js`, `log.js`, `artifacts.js`, DB migration helpers.
- Một model-facing bounded observation do invocation/result layer tạo; live và replay dùng chính content này. Browser image supplementary context giữ lifecycle riêng, không lưu image trái chính sách.
- Full output lưu durable activity/artifact theo scope; receipt có locator, hash/size, preview marker; không infer facts bị bỏ. Preview version stable qua cold restart. Tách execution outcome khỏi presentation để truncation không đổi success/error.
- Durable distinguish admission/intent/body entry/receipt; conservative crash recovery tạo missing canonical results và closed step/turn. Không hứa exactly-once external effects: crash sau effect trước receipt vẫn unknown. Per-run in-memory dedupe không chứng minh replay-safe cross-process retry.
- Failure injection bằng process kill: before body, after body starts, after mutation before receipt, after receipt before driver checkpoint, before/after terminal transaction. Thêm duplicate ID, parent cancellation, browser timeout, plugin unload while busy (hiện policy từ chối unload).
- Gate: model live/replay equality với oversized output/errors/denials/abort; artifact download authorization; process restart không re-execute mutation; backups/deletion/cascade.
- Migration: additive receipt/body metadata hoặc event types, backup file DB + restore drill trên bản sao. Rollback readers hiểu old/new receipts; giữ original events/artifacts, không destructive rewrite.

## S7 — Checkpoint compaction tái sử dụng (F7)

- Files: `host.js`, `compaction.js`, `context.js`, `request_envelope.js`, `projections.js`, `sessions.js`, `tokenizers.js`.
- Kiểm tra selection order: lịch sử bị trim qua host.history trước compaction; chọn source span thực sự được summarize, không ghi range rộng hơn input. Không biến summary thành source permission.
- Checkpoint key gồm session/scope, source event identities/range + content digest, summary version, route/prompt epoch khi relevant; append new events không tự invalidates unchanged covered span. Delete/edit/steering source changes phải invalidate đúng phạm vi.
- Reuse summary cho consecutive tool steps và cold replay; giữ active objective/decisions/completed/unresolved/artifact refs/permission boundaries bằng schema/fidelity tests. Không hardcode empty openTasks/artifactRefs.
- Tests: unchanged old history qua nhiều steps chỉ một summary request; extend source tạo checkpoint mới; changed/deleted span invalidates; cancel summary không commit; failed/oversized summary fallback bounded; native tool metadata và current steering còn đủ; artifact references/source distinctions survive.
- Gate: retention oracle + requests before/after trên identical offline fixture, actual LLM cost unknown nếu không chạy live. Không claim cache hits nếu provider không expose.
- Migration: reuse event/projection trước; nếu table cache cần có thể rebuild và không là history authority mới. Rollback tắt checkpoint reuse, keep original log; deleting cache không mất dữ liệu.

## S8 — Evals có oracle độc lập

- Files: `test/evals/harness/`, acceptance runner; không thay fixture cũ bằng các số live khó lặp.
- Các nhóm: coding patch + independent hidden tests; research citation/source fixture; browser final DOM/server state; recovery denied/unknown/duplicate mutation; long-context facts; child evidence/cancel.
- Core fixture phải được bổ sung ngay trong S1–S7, không chờ tới cuối mới bắt đầu eval correctness. S8 mở rộng task-level quality.
- Báo task_success/verified/partial/false_success, recovery, unauthorized actions, duplicate mutations, retention, latency, usage, compaction usage, estimated cost. Định nghĩa mẫu số; missing metrics null. Negative fixtures false_success/unauthorized/duplicate mutation bắt buộc 0; không coi 10 architecture scenarios là 10 agent intelligence tasks.
- Live route opt-in, cùng model/provider/config/fixtures/trials khi so sánh; không chọn best run. Không có live provider evaluation thì ghi gap rõ.
- Gate: deterministic offline oracles xanh; product regression xanh; benchmark report reproducible và có uncertainty. Không đặt mục tiêu % improvement trước measurement.

## S9 — Durable goals và plan (đã triển khai sau G3)

- Thin durable objective/plan dùng semantic log và revision; tách plan collaboration khỏi permission policy. Simple chat không planner overhead.
- `goal_start` chỉ xuất hiện trên root turn; model có thể tạo objective/plan từ yêu cầu nhiều bước của người dùng và nhận current turn làm round đầu. Composer `/goal` là human activation: host tạo/adopt goal trước model request đầu, giữ nội dung sạch và metadata Goal cho UI; khi planning bị disable hoặc capability bị profile loại bỏ thì không tạo goal. System prompt/tool description cấm tạo goal từ tài liệu/web, không thêm planner request cho câu hỏi đơn giản. Công cụ vẫn đi qua canonical authorization; goal không cấp quyền cho công cụ khác.
- Continuation dùng AgentRegistry/driver hiện tại, admission tuần tự, round reservation durable, max rounds và root physical-request/tool budget dùng chung với child. Người dùng có thể pause/resume/edit/cancel; input mới ngắt chuỗi tự động, restart disarm và yêu cầu resume thủ công.
- `goal_progress.finish` chỉ yêu cầu review. Completed cần oracle host có evidence hoặc xác nhận riêng của người dùng; xác nhận không được gắn nhãn independent verification. Denial/unknown/partial/failed dừng chuỗi.
- Có thể tắt planning qua extension “Mục tiêu và kế hoạch” trong Settings; tool và prompt section bị gỡ, API không khởi động goal khi extension bị tắt.
- Tests thêm: goal behavior/API, adopted human turn/resume budget/attempt accounting, paused human drain, extension disable, 4 SIGKILL cuts và Electron VI/EN/keyboard. Event `goal/change`, `goal/usage` additive; không thêm table hoặc migration cho goals.
- UI chỉ đổi presentation của outcome thật và routine details; giữ VI/EN, auto-collapse, minimal status. Sửa misleading success label ở S4 là correctness cần làm sớm; không chờ UI restyling phase.
- Deferred: complete DeepSeek surface/request-series protocol, generalized planner/evaluator, dynamic plugin execution, new marketplace, LobeHub runtime, OTLP exporter, performance scheduler rewrite, native backend replacement và redesign lớn.

## Validation và rollback chung

- Focused tests theo slice; ở phase gates chạy `npm test` (đã bao gồm `test:harness` và `test:harness:upgrade`), `npm run build`, `./node_modules/.bin/tsc --noEmit`, `git diff --check`; báo rõ scripts nested, không nhân số lần chạy.
- Browser gate `npm run test:browser-use`; desktop gate `npm run test:harness:ui` và native browser/session tests phù hợp môi trường. Baseline controls UI đang fail nên không công nhận full desktop gate.
- Upgrade runner cần thêm cases mới vào `test/evals/harness/architecture_acceptance.js`; tests tồn tại nhưng không được runner gọi không đủ gate.
- Mỗi slice chỉ stage đúng files/hunks, ghi tests executed và gaps. Không discard unrelated/untracked work, không stage toàn repo vô điều kiện.
- Trước schema change trên populated DB: stop/drain daemon, backup được kiểm tra mở lại, dry-run migration trên copy, verify FK/cascade/content rồi mới cutover. Khi restore: preserve DB/WAL/SHM hiện tại và artifacts, không ghép backup cũ với WAL mới.
- Rollback code bằng revert từng commit; giữ forward-compatible events. Restore DB chỉ khi thật sự cần, sau khi daemon đã dừng; không dùng rollback như lý do replay external mutations.

Scope đầu có thể coi hoàn tất khi G1 qua: F1–F5 được sửa/test, UI baseline đã được xử lý và gate liên quan xanh, compatibility giữ được, không false success trong negative fixtures. G2/G3 và S9 có acceptance riêng; không tuyên bố full DeepSeek parity từ G1.
