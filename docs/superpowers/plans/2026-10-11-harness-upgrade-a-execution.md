# Harness A — Unified tool execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Mọi đường gọi tool dùng một policy seam và một outcome authoritative.

**Architecture:** Thêm service quanh PermissionEngine và registry hiện có; chuyển callers từng đường, giữ façade executeTool cho tương thích. Không mở rộng parallelism trong đợt này.

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

- Approval provider vắng mặt hoặc abort khi đang ASK phải deny/cancel — Task 1.
- PTC/browser wrapper không được authorize hai lần hoặc chạy body trực tiếp — Task 2.
- Middleware đổi args/outcome không được vượt quyền — Task 1.
- Crash/abort sau mutation chưa xác minh không được báo success — Task 3.
- Unload khi body còn chạy phải đợi quiescence — Task 3.

---
### Task 1: Canonical invocation và deny-only guards

**Files:**
- Create: server/harness/tool_invocation.js
- Modify: server/harness/authorization.js, server/harness/tool_pipeline.js, server/harness/host.js, server/harness/tool_results.js
- Test: test/test_harness_invocation.js, test/test_harness_authority.js

**Interfaces:**
- Produces: ToolInvocationService({resolveRun, authorize, tools, pipeline, record})
- Produces: invoke({call, context}) → Promise<ToolResult>; context dùng server run context của spec.
- Produces: registerGuard(id, guard) → disposer; guard({call,context}) → null | {action:'DENY',reason}.
- Consumes: validateToolResult() và authorizeTool(loop, args) hiện có; tham số reviewer lấy từ resolveRun(runId).

- [x] **Step 1: Viết regression test**
Trong test/test_harness_invocation.js tạo fake registry + authorize callback có counters, không gọi LLM.
Assertions: ALLOW → approvals=1/body=1/receipt=1; ASK thiếu provider → body=0; guard DENY thắng mọi middleware; sửa frozen args ném lỗi hoặc không làm đổi body args; lỗi scope/schema → body=0. Thêm body trả success:false, hook trả success:true nhưng canonical result vẫn error.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `node test/test_harness_invocation.js`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Service validate call/scope trước, clone/freeze args rồi authorize cùng snapshot. Intent được ghi trước authorization cho call hợp lệ. Chạy guards deny-only sau authorize. Pipeline sở hữu duy nhất receipt; observer nhận frozen receipt. Không dùng ALLOW giả để thay policy của caller. Cập nhật authority tests để invoke qua service mới.

- [x] **Step 4: Verify**
Run: `node test/test_harness_invocation.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_authority.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_pipeline.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_approval_modes.js`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `refactor: centralize authoritative tool invocation`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

### Task 2: Chuyển direct, PTC và browser delegation

**Files:**
- Modify: server/harness/driver.js, server/harness/host.js, server/browser_integration.js
- Test: test/test_harness_invocation_paths.js, test/test_harness_ptc_pipeline.js, test/test_browser_integration.js

**Interfaces:**
- Consumes: invoke({call,context}) từ Task 1.
- Produces: HarnessHost.invokeTool(call, runTools, context) → Promise<ToolResult>.
- Compatibility: executeTool(call,runTools,context) → Promise<output> giữ signature cũ; chỉ delegate vào invokeTool, không có body bypass.
- Compatibility: callScopedTool(name,args,context) giữ trả raw output/throw để PTC binding không đổi.

- [x] **Step 1: Viết regression test**
Test cùng một tool mutation qua direct/PTC/browser custom action: mỗi call approvals=1, executions=1, durable receipt=1. Parent tool wrapper được authorize riêng với child callId khác. Denied subcall không tạo side effect; ảnh browser vẫn đi đến model; schema lỗi ở cả ba đường bị chặn giống nhau. Dùng fixtures createDaemon({dbPath:':memory:',port:0,plugins:[...]}) của suite hiện có.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `node test/test_harness_invocation_paths.js`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Driver nhận canonical result rồi map sang protocol/provider message; bỏ authorizeTool() riêng cho đường đã chuyển. PTC/browser atomic action gọi cùng service; wrapper không thay kết quả con hoặc tự retry. Giữ PermissionRequired/ToolCallStarted/Completed/Blocked cho UI qua adapter, không thành execution seam thứ hai.

- [x] **Step 4: Verify**
Run: `node test/test_harness_invocation_paths.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_ptc_pipeline.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_browser_integration.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_protocol.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_agents.js`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `refactor: route agent and delegated tools through invocation service`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

### Task 3: Cancellation, quiescence và ordering

**Files:**
- Modify: server/harness/tool_invocation.js, server/harness/scheduler.js, server/harness/agents.js, server/harness/host.js
- Test: test/test_harness_invocation_lifecycle.js, test/test_harness_lifecycle.js, test/test_harness_scheduler.js

**Interfaces:**
- Consumes: invocation service Tasks 1–2.
- Produces: drain({runId}) → Promise<void>; invocation service tracks in-flight body promises theo runId.
- Produces: owner/plugin disposal chỉ thành công sau drain hoặc báo busy theo changePlugins policy hiện có.

- [x] **Step 1: Viết regression test**
Fake body chờ controllable promise: abort trước body → cancelled/body=0; abort sau start giữ run chưa drain cho đến promise settle; nếu body throw khi signal aborted → unknown. Scope/plugin unload không dispose resources trước settle. Exclusive mutations không overlap, safe reads giữ maxParallel hiện có. Observer throw không sửa outcome hoặc tạo receipt thứ hai.

- [x] **Step 2: Chạy test mới trước khi sửa**
Run: `node test/test_harness_invocation_lifecycle.js`. Expected: FAIL ở assertion mới; không coi thiếu dependency hoặc fixture setup là failure hợp lệ.

- [x] **Step 3: Implement**
Không Promise.race abort để bỏ body đang chạy rồi giải phóng tài nguyên. Giữ scheduler mặc định exclusive nếu tool chưa khai báo safe. Gắn drain vào agent/host shutdown; một failed observer chỉ log diagnostic. Cập nhật docs contract của cancellation để outcome unknown không bị formatter biến thành cancelled chắc chắn.

- [x] **Step 4: Verify**
Run: `node test/test_harness_invocation_lifecycle.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_lifecycle.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `node test/test_harness_scheduler.js`. Expected: PASS, không thay fixture để che behavior lỗi.
Run: `npm run test:harness`. Expected: PASS, không thay fixture để che behavior lỗi.

- [x] **Step 5: Review diff và lưu thay đổi phần task**
Commit đề xuất: `fix: drain tool execution before disposing run resources`. Stage đúng file/hunk của task; không commit các thay đổi UI/browser đang có ngoài phạm vi.

Implementation note: Đã triển khai và verify; chưa commit vì repo có harness chưa track cùng nhiều thay đổi trước task. Validation: docs/architecture/harness-upgrade-validation.md.
