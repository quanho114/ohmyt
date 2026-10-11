# Thiết kế nâng cấp harness ohmyt

Ngày: 11/10/2026. Trạng thái: thiết kế đề xuất; chưa triển khai.
Phạm vi: củng cố runtime hiện tại, tham khảo DeepSeek Harness tại commit d743267388641bc76f17c45ce8b4c231aed1d32c.

## Mục tiêu và giới hạn

Thống nhất quyền thực thi, lịch sử model và ownership tài nguyên để thêm plugin/driver mà không phải hiểu toàn bộ daemon.
Giữ Electron/React, SQLite, HTTP/SSE, provider gateway, browser native và các API công khai hiện có.
Không nhập nguyên agent loop DeepSeek, đổi storage backend, thêm marketplace, remote executable UI, hoặc viết lại Chrome trong đợt này.
Không tuyên bố chất lượng agent tăng nếu chỉ thay kiến trúc; benchmark là phép kiểm tra riêng.

## Hiện trạng đã đối chiếu code

- HarnessHost dùng @deepseek-ai/cordis, có plugin effects, scoped tools, agent handles, inbox, PTC, subagents và compaction.
- driver.js và callScopedTool() gọi authorizeTool() trước executeTool(); executeTool() tạo ToolPipeline với authorize trả ALLOW. Đây là seam đang phân tán, không phải bằng chứng quyền đang bị bỏ qua.
- SessionStore.history() phối hợp bảng messages, harness_turns và event projection. messages_json có vai trò tương thích; không được xóa ngay.
- TokenCounters có registry nhưng fallback hiện là ước lượng ký tự và allowance ảnh; estimateTokens() không phải tokenizer chính xác.
- Host tự tạo child sessions, chuyển tiếp approval, lắp tool groups và services, làm composition root biết nhiều implementation.
- scheduler đã có giới hạn song song và ordering; không thay bằng Promise.all cho mọi tool.

## Thiết kế đích

### A. Một đường thực thi tool

Mọi model call, PTC subcall và browser_use_task/custom action đi qua ToolInvocationService.invoke({call, context}).
Context gồm runId, sessionId, agentId, scope, scopeId, signal; server tra run context, không tin trường quyền do model truyền.
Call gồm id, name, arguments. Trả canonical ToolResult hiện có:
callId, status, modelContent, artifactRefs, executionReceipt, output.
Giữ status: success, error, denied, cancelled, unknown.

Thứ tự: validate scope/schema → đóng băng call → ghi intent → authorize → deny-only guards → middleware execute → body một lần → canonical receipt → observer.
Invalid schema/scope không chạy body; ghi denied receipt nếu call có id hợp lệ và run đã tồn tại.
Authorization đúng một lần cho mỗi call, kể cả PTC và browser delegation.
Guard chỉ abstain/deny, không thể nâng quyền; pre/around middleware không đổi approved arguments.
Body đã khởi chạy phải settle trước khi disposer release resources. Abort trước body là cancelled; side effect chưa xác minh sau abort là unknown.
Không thêm arbitrary result-rewriting hook ở giai đoạn này. Observer không sửa receipt authoritative.
Dùng callId để chống double settlement, không dùng dedup để tự chạy lại mutation.

### B. Event log sở hữu lịch sử model

Các phiên đã migration hoàn tất lấy transcript từ semantic events; UI messages/activity là projection hoặc compatibility data.
Thêm messageId/turnId/callId làm identity; không dùng nội dung text để dedup.
Turn completion ghi final assistant event + turn/end + UI projection trong một transaction.
Tool receipt sở hữu outcome; adapter đưa receipt thành model message, không append một outcome trái ngược.
Tiếp tục bảo toàn call/result adjacency, metadata provider và pending user messages.
Recovery đóng turn gián đoạn, dùng receipt đã commit nếu có, tạo unknown result cho call chưa có receipt; không tự retry mutation.
Migration có backup, marker version, dry-run diff, chạy lại idempotent. DB cũ không drop messages/messages_json.
Rollback code phải giữ đọc được dữ liệu cũ: không xóa bảng/cột; migration checkpoint chỉ là marker của semantic coverage.

### C. Composition và context

HarnessHost chỉ lắp service/plugin, lifecycle và facade tương thích; moved implementations không mất API.
Tách plugins tools, subagents, artifacts theo owner; giữ các core/ service keys và plugin IDs hiện có.
Subagent giữ scope cha, chỉ giảm capabilities, dùng budget chung và cancel/quiescence của cha.
Profiles vẫn là preset SQLite hiện tại; chưa chuyển thành hệ boot YAML của DeepSeek.
Token accounting qua TokenCounters.countRequest(): tokens, accuracy exact|estimated, source.
Không có tokenizer route phù hợp thì giữ estimated và hiển thị đúng nhãn, không gán exact.
Reserve tính cả schemas và allowance ảnh; context overflow phải ra kết quả chẩn đoán rõ.
Giữ default maxSteps=5, browserMaxSteps=20, contextTokens=24000, reserveTokens=4000, toolResultTokens=4000 cho đến khi benchmark chứng minh cần đổi.

## Nghiệm thu

A: direct/PTC/browser delegation đều cùng một authorization và receipt; denied body=0; mutation không duplicate.
B: restart/replay tạo transcript cùng identity và outcome; migration không mất chat, attachment, steering hay tool metadata.
C: unload không gỡ tool của owner khác; driver thay được; child không nâng quyền; counter không giả exact.
Mỗi phần qua focused suites trước; cuối chương trình chạy npm test, npm run build và Electron critical flows.
Acceptance fixtures không gọi model thật; benchmark chất lượng riêng dùng cùng route/model, fixture version, budgets và 5 lượt mỗi scenario.

## Rủi ro và xử lý

- Denial semantics có thể khác direct/PTC: test outcomes tại canonical seam và giữ wrapper formatting ở adapter.
- Crash sau body trước receipt: unknown, không suy đoán thành success hoặc retry.
- Event projections lệch UI: shadow diff trước cutover, không đọc snapshot legacy rồi tự ghi đè log.
- Plugin unload giữa tool đang chạy: drain hoặc báo busy, không dispose sớm.
- Page/browser snapshot là UI transient: không đưa PNG/base64 vào durable model history chỉ để phục vụ animation.

## Nguồn tham khảo

- docs/architecture/deepseek-harness-research.md
- docs/architecture/harness-full-spec.md (bối cảnh; đợt này chỉ củng cố các subsystem trên)
- https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/architecture.md
- https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/tool-execution-pipeline.md
