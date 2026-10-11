# Harness B — Semantic session authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Lịch sử model và recovery đọc từ semantic log nhất quán, giữ UI và DB cũ tương thích.

**Architecture:** Shadow-compare projection với history hiện có, bổ sung event identity và commit transaction trước khi cutover. Receipt từ plan A là outcome tool duy nhất.

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

- DB cũ chứa attachment và tool protocol phải migrate không mất dữ liệu — Task 1.
- Hai tin nhắn có text giống nhau phải giữ identity riêng — Task 1.
- Crash sau receipt trước final message không được retry mutation — Task 2.
- Steering và child results không được lọt sang session khác — Task 2.
- UI write thất bại phải rollback cả turn completion — Task 2.

---
### Task 1: Projection identity, shadow diff và migration marker

**Files:**
- Modify: server/harness/contracts.js, server/harness/projections.js, server/harness/migration.js, server/harness/sessions.js
- Create: server/harness/history_compare.js
- Test: test/test_harness_history_authority.js, test/test_harness_migration_backup.js

**Interfaces:**
- Consumes: ToolResult/callId từ plan A; version=1 events hiện có.
- Produces: compareHistory({legacy,semantic}) → {equal:boolean,differences:Array<{index,field}>}; không log raw text/secret.
- Produces: SessionStore.modelHistory(sessionId) → canonical messages; hỗ trợ semantic projection cho shadow compare và fallback rõ cho session chưa đủ coverage.
- Compatibility: Task 1 giữ history(sessionId) trên nguồn hiện tại; Task 2 mới delegate modelHistory() sau khi coverage và shadow diff qua gate.

- [x] **Step 1: Viết regression test**
Fixtures DB tạm gồm legacy chat có ảnh, native provider metadata, hai user messages cùng text, steering, tool calls và missing result. Assertions: message IDs không collapse; lần migrate thứ hai không đổi counts/seq; backup mở được; dry-run không sửa DB; diff chỉ chứa index/field. Corrupt/incomplete migration marker không được kích hoạt semantic-only.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `node test/test_harness_history_authority.js`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Giữ event version=1, thêm optional identity payload fields mà validator chấp nhận. Migration marker dùng bảng harness_migration_state(session_id,version,complete); complete chỉ commit sau kiểm tra coverage. compareHistory so role, content, call IDs và provider metadata; không chuẩn hóa away khác biệt outcome. Task 1 chỉ shadow compare, chưa đổi nguồn history đang phục vụ model. Không cắt bỏ legacy tables.

- [x] **Step 4: Verify**
Run: `node test/test_harness_history_authority.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_migration_backup.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_protocol.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_replay.js`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `refactor: add identity-preserving semantic history projection`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

### Task 2: Atomic completion, recovery và cutover

**Files:**
- Modify: server/harness/sessions.js, server/harness/driver.js, server/harness/log.js, server/harness/projections.js
- Test: test/test_harness_session_commit.js, test/test_harness_replay.js, test/test_harness_controls.js, test/test_harness_subagents.js

**Interfaces:**
- Consumes: modelHistory()/coverage marker Task 1; receipt authority plan A.
- Produces: SessionStore.completeTurn({runId,finalMessage,step,status,uiMessage}) → {events,seq}; one SQLite transaction.
- Produces: SessionStore.recoverInterrupted() giữ signature và idempotent, outcome đọc từ receipt.
- Compatibility: messages/messages_json là UI/cache adapters; history không cần finalRow để xác nhận turn semantic đã complete.

- [x] **Step 1: Viết regression test**
Inject UI insert failure: semantic final message và turn/end đều rollback. Simulate restart tại các điểm trước body, sau body trước receipt, sau receipt trước completion: chưa có receipt → unknown, receipt đã commit giữ nguyên, body không chạy lại. Hai lần recovery không duplicate event. Transcript trước/sau restart bằng nhau; steering/child context đúng parent/session. Fixture từ Task 1 phải qua cutover và vẫn render lịch sử app.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `node test/test_harness_session_commit.js`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Commit final assistant, turn/end và UI mirror cùng transaction, emit SSE/session events sau COMMIT. Add compatibility adapters cho callers settle() hiện có. Dùng callId/messageId đối chiếu receipts, không lấy UI content để ghi đè authoritative transcript. Marker complete áp dụng cả new sessions khi seed semantic inputs đã durable. Recovery repair protocol, không thực thi tools. Document restore backup/old binary và không drop schema.

- [x] **Step 4: Verify**
Run: `node test/test_harness_session_commit.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_replay.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_controls.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_subagents.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `npm run test:harness`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `xvfb-run -a node_modules/.bin/electron --no-sandbox test/test_session_switch_ui.cjs`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `refactor: commit and recover turns from semantic session history`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

Implementation note: Đã triển khai và verify; chưa commit vì repo có harness chưa track cùng nhiều thay đổi trước task. Validation: docs/architecture/harness-upgrade-validation.md.
