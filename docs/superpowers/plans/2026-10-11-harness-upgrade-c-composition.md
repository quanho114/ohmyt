# Harness C — Composition and context reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Giảm coupling trong host và làm context accounting có nguồn/độ chính xác rõ.

**Architecture:** Extract plugin implementations giữ nguyên IDs/services/API, sau đó chuẩn hóa request envelope và chạy eval trước khi đổi default budgets. Không dựng hệ package/profile mới.

**Tech Stack:** JavaScript ESM, Node.js, @deepseek-ai/cordis đã pin trong repo, SQLite/better-sqlite3, React/Electron; giữ dependency hiện tại.

**Spec:** docs/architecture/harness-upgrade-2026-10-11-spec.md

## Global Constraints

- Giữ Electron/React, SQLite, HTTP/SSE, provider gateway, browser native và các API công khai hiện có.
- Giữ status: success, error, denied, cancelled, unknown.
- Không tự retry mutation.
- Giữ default maxSteps=5, browserMaxSteps=20, contextTokens=24000, reserveTokens=4000, toolResultTokens=4000.
- Dữ liệu production không dùng làm fixture; tạo DB tạm, sao lưu trước migration; không drop bảng/cột.
- Repo có nhiều thay đổi chưa commit: khi triển khai ghi baseline trước, stage theo file/hunk, không dùng git add . hoặc reset thay đổi ngoài task.

## Review Focus

- Unload/reload không xóa contribution của owner khác — Task 1.
- Child có capability rộng hơn parent phải bị chặn — Task 1.
- Request đổi route hoặc schemas phải tính lại budget — Task 2.
- Ảnh lớn, tiếng Việt và current tool turn không được cắt sai protocol — Task 2.
- UI/browser delay hoặc tác vụ chất lượng kém không được che bằng benchmark khác model/budget — Task 3.

---
### Task 1: Tách plugin implementations khỏi composition root

**Files:**
- Create: server/harness/plugins/workspace_tools.js, server/harness/plugins/subagents.js, server/harness/plugins/artifacts.js
- Modify: server/harness/host.js, server/harness/agents.js
- Test: test/test_harness_plugin_ownership.js, test/test_harness_advanced.js, test/test_harness_subagents.js

**Interfaces:**
- Produces: workspaceToolsPlugin({tools,group}) → plugin definition; group là workspace|browser|web|memory, host mount từng group với IDs tools/workspace, tools/browser, tools/web, tools/memory hiện có.
- Produces: subagentsPlugin({db,agents,sessions,runContexts,childSessions,agentLoop}) → plugin definition; giữ agents/subagents và tool names.
- Produces: artifactsPlugin({db,sessions}) → plugin definition; giữ artifacts/store.
- Consumes: invokeTool/drain plan A, completeTurn/modelHistory plan B; core/ keys không đổi.

- [x] **Step 1: Viết regression test**
Plugin unload gỡ đúng owner, reload một lần không duplicate tools/listeners. Parent abort drain child; child tool grant chỉ subset parent; parent/child dùng cùng budget object. Replace driver fixture không import AgentLoop implementation. Giữ compatibility core/agentLoop override và tests connector unload hiện có.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `node test/test_harness_plugin_ownership.js`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Di chuyển lifecycle effects và child-session plumbing, không đổi business behavior. Host chỉ compose dependencies, readiness, disposal và facade; các plugin đóng tài nguyên do mình tạo. Chưa tách mọi service thành package; không đổi profile preset schema. Nếu unload trong run không supported thì trả busy có kiểm tra, không dispose nửa chừng.

- [x] **Step 4: Verify**
Run: `node test/test_harness_plugin_ownership.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_subagents.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_advanced.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_connectors.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_profile_runtime.js`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `refactor: move harness implementations into owned plugins`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

### Task 2: Request envelope và truthful token accounting

**Files:**
- Create: server/harness/request_envelope.js
- Modify: server/harness/tokenizers.js, server/harness/context.js, server/harness/compaction.js, server/harness/host.js, server/harness/attempts.js
- Test: test/test_harness_request_budget.js, test/test_harness_compaction.js, test/test_harness_protocol.js

**Interfaces:**
- Produces: prepareRequestEnvelope({messages,tools,route,config,counters,signal}) → Promise<{messages,tools,accounting,omitted,shortened}>.
- accounting: {tokens:number,accuracy:'exact'|'estimated',source:string}.
- Consumes: TokenCounters.countRequest(request,route) và canonical semantic history.
- Overflow error: code='CONTEXT_BUDGET_EXCEEDED' khi pinned current turn không fit dù đã giới hạn observation.

- [x] **Step 1: Viết regression test**
Fake exact counter tính theo fixture canonical envelope: exact route → accuracy exact; absent route → estimated; đổi tool schemas/route → recompute. Current user message và call IDs không mất. Vietnamese/long text, image allowance, huge tool output giữ adjacency. Abort summary không commit context/summary. Không import tokenizer package nếu chưa xác minh provider wire-level parity.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `node test/test_harness_request_budget.js`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Áp dụng cùng envelope accounting trước/ sau compaction và truncation, tính cả system+schemas+images. Không fallback silently từ exact counter error sang estimated. Nếu giữ nguyên tools/messages thì cache có bounded key theo route + serialized envelope, không theo sessionId riêng. Chỉ label exact khi counter hỗ trợ toàn bộ request wire payload; mặc định estimated được chấp nhận. Giữ budgets của spec.

- [x] **Step 4: Verify**
Run: `node test/test_harness_request_budget.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_compaction.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_protocol.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_profile_runtime.js`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `fix: account for complete request context consistently`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

### Task 3: Acceptance eval và product regression

**Files:**
- Create: test/evals/harness/architecture_acceptance.js, docs/architecture/harness-upgrade-validation.md
- Modify: package.json (thêm test:harness:upgrade; giữ scripts hiện có)
- Test: suites harness, approvals, session UI, browser native/motion hiện có

**Interfaces:**
- Produces: test:harness:upgrade → deterministic suite; nonzero exit nếu invariant fail.
- Produces: redacted result record {revision,scenario,modelRoute,fixtureVersion,budgets,trial,status,durationMs,usage,errorCode}.
- Consumes: toàn bộ A/B/C; architectural checks không cần provider credentials.

- [x] **Step 1: Viết regression test**
Fixtures offline: direct/PTC denied mutation, interrupted receipt, steering, scoped MCP, child cancellation, overflow, plugin reload. Tạo failing assertion về exit code và outcome trong architecture_acceptance.js, rồi thêm script test:harness:upgrade chạy file đó trước Step 2; lỗi missing script không phải regression hợp lệ. Chỉ dùng thật model khi chạy benchmark riêng có cấu hình route; 5 lượt/scenario cùng model/fixtures/budgets, lưu cả failure và usage unavailable.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `npm run test:harness:upgrade`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Thêm script deterministic chạy focused suites mới, không gọi API trả phí trong default npm test. Validation document ghi baseline/after, migration/rollback và hạn chế; không khẳng định quality tốt hơn khi chưa có benchmark thật. Electron acceptance: open/switch chat browser, expand/collapse, approval pending, cancel parent, restart interrupted run, attachment và artifact render.

- [x] **Step 4: Verify**
Run: `npm run test:harness:upgrade`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `npm test`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `npm run build`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `xvfb-run -a node_modules/.bin/electron --no-sandbox test/test_session_switch_ui.cjs`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `xvfb-run -a node_modules/.bin/electron --no-sandbox test/test_browser_chrome_ui.cjs`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `xvfb-run -a node_modules/.bin/electron --no-sandbox test/test_browser_page_motion.cjs`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `xvfb-run -a node_modules/.bin/electron --no-sandbox test/test_browser_chat_pane.cjs`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `test: add harness architecture acceptance coverage`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

Implementation note: Đã triển khai và verify; chưa commit vì repo có harness chưa track cùng nhiều thay đổi trước task. Validation: docs/architecture/harness-upgrade-validation.md.
