# Plan tổng: ohmyt AI Assistant Workspace

Cập nhật: **12/10/2026**. Đây là nơi theo dõi toàn bộ phạm vi từ brief MonoCode/Monos và những việc còn lại sau đợt nâng chat. Tạo plan không đồng nghĩa các task chưa làm đã được triển khai.

## 1. Mục tiêu và cách dùng

ohmyt trở thành workspace có assistant với danh tính lâu dài, trò chuyện và ghi nhớ, chạy công việc theo lịch, giao nhiệm vụ cho agent khác, mở coding workspace khi cần. **Ưu tiên hoàn thiện trải nghiệm chat trước, sau đó mở rộng tính năng.**

Trạng thái task:

- `[x]`: đã triển khai và có kiểm tra trong phạm vi ghi rõ; không suy ra đã đạt toàn bộ nghiệm thu sản phẩm.
- `[ ]`: chưa làm, làm một phần hoặc chưa đủ bằng chứng nghiệm thu. Đọc ghi chú để phân biệt.
- Task ghi **vướng môi trường** cần giải quyết môi trường hoặc chạy ở hệ thống phù hợp; không bỏ assertion để đổi thành pass.

Mỗi task có mã để giao việc riêng. Khi hoàn tất, cập nhật checkbox, ngày và liên kết bằng chứng ngay trong file này. Mỗi chặng có thể chia thành nhiều PR nhỏ; không buộc một chặng tương ứng đúng một PR. Không tự đánh dấu xong cả chặng chỉ vì code đã build.

Bằng chứng hiện tại: [chat-fluidity.md](../chat-fluidity.md). Harness đã có kế hoạch và kết quả riêng: [deepseek-harness-upgrade-plan.md](deepseek-harness-upgrade-plan.md). Tái sử dụng các phần đã có trong harness; không chạy lại toàn bộ kế hoạch đó như công việc mới.

Các trạng thái bên dưới phản ánh **đợt triển khai trong cuộc trò chuyện này**. Các tính năng tương lai chưa được audit lại toàn bộ workspace đang có chỉnh sửa đồng thời. Trước mỗi chặng, xác minh những gì đã tồn tại rồi thu hẹp task; không xây chức năng trùng.

## 2. Ràng buộc kiến trúc và sản phẩm

- Giữ Cordis/native harness, model gateway, canonical tool invocation, permissions, SQLite scoped memory, semantic session events, MCP, skills, browser/computer use và document workspace.
- Tách identity assistant khỏi phiên model; dùng `agents`, `profiles`, `memories`, `SessionStore` hiện có. Không tạo agent loop thứ hai.
- SQLite là nguồn dữ liệu authoritative. Markdown có thể dùng cho import/export hoặc context, không thay database bằng roster trong localStorage.
- Scheduler thuộc daemon; UI chỉ hiển thị/điều khiển trạng thái. Unattended jobs dùng quyền tối thiểu theo capability, project và hành động.
- Driver selection phải đi từ session/API tới runtime; thêm adapter mà không nối đường thực thi chưa được coi hoàn tất.
- Giữ phong cách sạch, ít khung và bố cục chat + tài liệu. Không chuyển Electron sang Tauri để giải quyết motion.
- Không đụng dirty checkout, tự bypass approval, coi lời model là outcome đã xác minh hoặc tự công bố/deploy/merge.
- Đọc source tham chiếu MonoCode thực tế trước khi port; bảo toàn license cho phần được sử dụng.

## 3. Thứ tự và phụ thuộc

| Chặng | Phạm vi | Trạng thái hiện tại | Phụ thuộc |
|---|---|---|---|
| C1 | Chat fluidity | Có triển khai; chưa nghiệm thu đầy đủ | Nền chat hiện có |
| C2 | Workspace & navigation motion | Một phần | C1 |
| C3 | Agent working experience | Một phần | C1; hoàn thiện cùng C2 |
| C4 | Performance & nghiệm thu chat | Có baseline và fixture; còn việc | C1–C3 |
| A1 | Persistent assistants | Chưa triển khai trong đợt này | Gate chat C4 |
| A2 | Memory lifecycle | Chưa triển khai trong đợt này | A1 |
| A3 | Assistant delegation | Chưa triển khai trong đợt này | A1; dùng memory A2 khi phù hợp |
| A4 | Daemon-owned Habits | Chưa triển khai trong đợt này | A1, A3 |
| A5 | External CLI runtime | Chưa triển khai trong đợt này | A1, A3 |
| A6 | Git/worktree/checkpoints/review | Chưa triển khai trong đợt này | A5 |
| A7 | Coding workspace | Chưa triển khai trong đợt này | A5, A6; bảo toàn C2 |
| A8 | Triggers/GitHub/CI | Chưa triển khai trong đợt này | A3–A6 |
| A9 | SSH remote hosts | Chưa triển khai trong đợt này | A5, A6; các gate quyền và recovery |

Thứ tự mặc định: **C1 → C2/C3 → C4 → A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9**. Có thể chuẩn bị nghiên cứu/test trước, nhưng không mở rộng implementation làm gián đoạn mục tiêu chat đang ưu tiên.

## 4. Breakdown: hoàn thiện chat

### C1 — Chat fluidity

- [x] **C1.01** Đọc source `useBottomChatMotion`, `wordFade`, `useComposerDockMotion`, `PanelStack`, `TranscriptPool` tại MonoCode `889579b`. Bằng chứng: báo cáo chat.
- [x] **C1.02** Dựng baseline renderer với 500 messages, code blocks, 5 sessions và 4 tốc độ chunk. Đo frame intervals/React commits; lưu JSON.
- [x] **C1.03** Bỏ hàng đợi characters-per-second và độ trễ cuối stream; dùng fade 120–400 ms theo cadence. Đồng bộ preview trong Settings.
- [x] **C1.04** Spring follow và nút về tin mới nhất; ngừng follow khi đọc lịch sử; tôn trọng auto-scroll off. Kiểm tra renderer Chrome đã qua.
- [x] **C1.05** Composer empty → dock, message entrance cho tin mới, cleanup animation và reduced motion. Kiểm tra docking đã qua.
- [x] **C1.06** Giữ vị trí cuộn của 5 phiên gần đây và draft text/images/goal mode khi chuyển phiên trong vòng đời renderer. Draft chưa bền qua restart.
- [ ] **C1.07** Kiểm tra thêm burst dài, mạng đứng rồi tiếp tục, Unicode/emoji, Markdown chuyển cấu trúc, code fences/math/tables và cancel giữa chunk. Xác minh không mất/nhân đôi chữ, không replay fade cả nội dung cũ.
- [ ] **C1.08** Kiểm tra nested code scrolling, scrollbar drag, touch, keyboard và resize lúc đang follow trong app thật. Không kéo người đọc trở lại đáy ngoài ý muốn.
- [ ] **C1.09** Kiểm tra entrance/handoff live → saved, first send và reload history trong app thật; sửa nếu có nhảy bố cục hoặc animation lịch sử.

**Nghiệm thu C1:** chữ theo dữ liệu nhận, không mất/nhân đôi nội dung; scroll không giành quyền của người đọc; không còn animation/frame/timer sau teardown; tất cả chế độ motion và auto-scroll hoạt động đúng.

### C2 — Workspace & navigation

- [x] **C2.01** Thêm motion tokens, đồng bộ một số hover/menu/sidebar timing; Settings page có slide/fade và cancellation.
- [ ] **C2.02** Audit toàn bộ navigation hiện có: sidebar expand/collapse/reorder, session/tab switch, mở/đóng panel và popover. Ghi rõ chỗ đã có, lỗi thực tế và phạm vi cần bổ sung; không thêm tab system trùng.
- [ ] **C2.03** Hoàn thiện motion sidebar và reorder đang có; animation không bounce quá mức, hit target không lệch và không chặn thao tác.
- [ ] **C2.04** Hoàn thiện panel stack có entrance/exit, interruption và teardown. Panel bị che không nhận focus; đóng panel trả focus về opener.
- [ ] **C2.05** Popover/picker đổi nội dung theo kích thước đo thực; xử lý đổi nhanh, resize và vị trí sát mép cửa sổ; tôn trọng reduced motion.
- [ ] **C2.06** Bảo toàn draft, caret/focus và trạng thái panel khi chuyển chat, Settings, tài liệu, browser và branch view; kiểm tra keyboard navigation.
- [ ] **C2.07** Kiểm tra split-pane resize ở màn hình nhỏ/lớn; chat giữa và tài liệu phải không giật, không có khung nền thừa; không phá native browser bounds.

**Nghiệm thu C2:** điều hướng không mất trạng thái/focus; exit hoàn tất trước teardown khi cần; không có layer vô hình chặn click; resize ổn định cả khi interrupt animation.

### C3 — Agent working experience

- [x] **C3.01** Working status gọn với text sweep, activity mặc định thu gọn; tool/reasoning vẫn mở lại được; giữ auto-expand preference.
- [ ] **C3.02** Chuẩn hóa projection cho thinking, tool running, subagents, progress, approval, paused, cancelled, failed và completed. Dựa runtime events/outcomes, không đoán từ text.
- [ ] **C3.03** Kiểm tra chuỗi nhiều tool calls và subagents; nhóm hoạt động ngắn gọn, không đẩy thinking dài vào chat và không dùng spinner tròn làm chỉ báo chính.
- [ ] **C3.04** Kiểm tra completion tự thu gọn, vẫn mở được output/error/evidence sau reload; không báo verified nếu chỉ có model final text.
- [ ] **C3.05** Kiểm tra hoạt động nhiều session, thông báo hoàn tất và chuyển tới đúng run; không làm mất trạng thái approval/cancellation.
- [ ] **C3.06** Kiểm tra VI/EN, screen reader/live region và reduced motion; thông báo trạng thái không lặp gây nhiễu khi stream.
- [x] **C3.07** Port source giao diện Goal dock/checklist/editor từ DeepSeek `d743267`; CSS gốc, icon/tooltip/editor/state dot và adapter API ohmyt. Typecheck, build và renderer UI test đã qua; chưa nghiệm thu native Electron. Chi tiết: [source và adaptations](../../src/vendor/deepseek-goal/README.md).

- [x] **C3.08** Nâng cấp Goal runtime theo source DeepSeek: canonical tools, tiếp tục nhiều vòng, blocker liên tiếp, await-input, completion provenance, admission và truy vấn Goal riêng. Xem [chi tiết và giới hạn](goal-deepseek-runtime.md). Chưa xác nhận chất lượng bằng provider thật hoặc mức tương đương 99–100%.

**Nghiệm thu C3:** trạng thái ngắn gọn, đúng lifecycle; người dùng có thể xem đầy đủ evidence; completion/error/partial/blocked/unverified không bị đánh đồng.

### C4 — Performance và gate nghiệm thu chat

- [x] **C4.01** Memoize historical messages và ổn định callback forwarding. Baseline/after cho thấy stream hiển thị đủ chữ; đo frame, commit và session switching.
- [ ] **C4.02** Đo lại production renderer nhiều lượt: React commits, Markdown parsing/highlighting, stream update cadence, input latency, heap, frame time và dropped frames. Tách warm/cold switches khỏi streaming.
- [ ] **C4.03** Tối ưu đổi phiên dài theo bottleneck đã đo. Đánh giá bounded transcript cache/pool; chỉ giữ nếu cải thiện có bằng chứng và memory budget chấp nhận được.
- [ ] **C4.04** Đánh giá virtualization khi cache/memoization chưa đủ; bảo toàn scroll anchors, selection, tìm kiếm, accessibility và code block state.
- [ ] **C4.05** Stress 500 messages nhiều code blocks, nhiều tool calls, 5 sessions; stream 10/30/60/120 provider tokens/s hoặc trace có token telemetry. Fixture hiện tại chỉ đo word chunks/s.
- [ ] **C4.06** Chạy trên máy 60Hz thực: mục tiêu phần lớn animation đạt 60fps; ghi p95 frame time và dropped frames. Hover/click phản hồi mục tiêu ≤100 ms; không coi headless Chrome là chứng nhận hardware.
- [ ] **C4.07** Giải quyết lỗi Electron startup `2147483651` hoặc chạy trên máy phù hợp; nghiệm thu app thật, native browser/document panes và focus. **Vướng môi trường tại lần chạy trước.**
- [ ] **C4.08** Xử lý/kiểm chứng lại lỗi typecheck `MiniGoal.tsx` đã có từ trước; nếu phần đó được sửa đồng thời, chạy lại trên trạng thái mới. Không tắt typecheck để pass.
- [ ] **C4.09** Làm regression isolation/migration chạy đúng Windows hoặc chạy ở OS phù hợp: symlink `EPERM`, POSIX file-mode assertion và temporary-directory cleanup `EPERM`. Không suy ra migration pass từ renderer tests.
- [ ] **C4.10** Chạy matrix Windows/macOS/Linux, reduced motion, DPI và cửa sổ nhỏ/lớn; lưu thiếu môi trường nào nếu chưa chạy được.
- [ ] **C4.11** Rà regression native agent, history replay, cancel, project isolation, migration và document/browser navigation. Đối chiếu behavior với MonoCode bằng workload tương đương.
- [ ] **C4.12** Cập nhật số đo và bằng chứng; chốt gate chat đạt/chưa đạt từng tiêu chí. Chỉ sau gate này chuyển ưu tiên sang A1.

**Hiện trạng đo:** Chrome headless p95 frame interval 33,3 → 16,8 ms, đủ chữ ở bốn tốc độ synthetic chunk. Đổi phiên còn dao động; chưa chứng minh ngang MonoCode, chưa nghiệm thu cross-platform. Chi tiết và cách chạy lại nằm trong báo cáo chat.

## 5. Breakdown: assistant và hệ sinh thái

### A1 — Persistent assistants

- [ ] **A1.01** Audit `agents`, `profiles`, sessions và UI roster; thiết kế quan hệ assistant ↔ nhiều projects và main conversation; xác định domain ownership.
- [ ] **A1.02** Migration/schema/index và backup, tương thích dữ liệu cũ; định danh assistant độc lập provider session.
- [ ] **A1.03** Service/API CRUD identity, profile binding, project bindings và main conversation; validation và project isolation.
- [ ] **A1.04** Nối prompt/context builder tới identity/profile hiện có; reset chat giữ identity và memory; không tạo runtime mới.
- [ ] **A1.05** UI chọn/quản lý assistant, project bindings và mở lại conversation; loading/empty/error thực.
- [ ] **A1.06** Test restart, reset, migration, xóa/unbind, scope boundaries và history replay.

**Nghiệm thu:** conversation tồn tại sau restart; reset không mất identity/memory; assistant nhiều projects không gây lẫn dữ liệu.

### A2 — Memory lifecycle

- [ ] **A2.01** Audit memory save/search và scope; định nghĩa topic notes, source/provenance, timestamps, expiry và version.
- [ ] **A2.02** Migration giữ SQLite authoritative; thêm update/remove/supersede và conflict handling không ghi đè ngoài ý muốn.
- [ ] **A2.03** Tool/API lifecycle có argument validation, authorization, audit receipt và project boundaries.
- [ ] **A2.04** Recall/context fitting: giới hạn payload, topic on demand, hash/version; chỉ bỏ nội dung trùng khi đúng semantics của provider/session.
- [ ] **A2.05** UI xem/sửa/xóa/topic/expiry và import/export cần thiết; xử lý expired/superseded entries.
- [ ] **A2.06** Test conflicts, secrets, cross-project leaks, expiry, restart và recall accuracy. Gọi đúng FTS5 là lexical search; chỉ thêm embeddings khi có nhu cầu và benchmark riêng.

**Nghiệm thu:** không mất dữ liệu/lộ secrets; memory có nguồn và lifecycle; không bơm context trùng hoặc bỏ nhầm context cần thiết.

### A3 — Assistant delegation

- [ ] **A3.01** Audit Subagents/Goals; thống nhất coordinator cho native children và independent sessions; định nghĩa ownership/correlation IDs.
- [ ] **A3.02** Durable delegation records, idempotency và duplicate-worker prevention; parent/child budget và capability subset.
- [ ] **A3.03** Actions start/send/read/stop theo scope; propagate cancel/approval/error; xử lý parent shutdown/restart.
- [ ] **A3.04** Completion batching/notification và outcome evidence; có cơ chế nhận kết quả khi parent không đang chạy.
- [ ] **A3.05** UI giao việc, theo dõi và mở worker/results; tránh status giả và duplicate completion reports.
- [ ] **A3.06** Test retry races, orphan recovery, depth/concurrency limits, budget, isolation và chỉ báo hoàn thành sau outcome.

**Nghiệm thu:** không tạo worker trùng; ownership khôi phục được; cancel thật; kết quả nhận đúng parent và không tự suy ra verified.

### A4 — Daemon-owned Habits

- [ ] **A4.01** Schema schedule/timezone, permissions, run policy và durable job runs; xác định missed-run/overlap behavior.
- [ ] **A4.02** Daemon scheduler với claim/lease/dedup và recovery; không phụ thuộc React mount/window ownership.
- [ ] **A4.03** Nối job execution tới coordinator/budget/permissions; mặc định least privilege; approval cần người dùng được lưu/chuyển về chat.
- [ ] **A4.04** Pause/resume/cancel, notification batching và history; tác vụ chạy khi đóng UI chỉ nếu daemon vẫn hoạt động.
- [ ] **A4.05** UI tạo/sửa lịch và xem job runs/failure; hiển thị timezone và lần chạy tiếp theo đúng dữ liệu.
- [ ] **A4.06** Test restart, clock changes/DST, missed runs, duplicate claims, overlapping runs, permission expiry và shutdown.

**Nghiệm thu:** restart không chạy trùng; pause/cancel tác dụng thực; quyền tối thiểu; thông báo dựa durable outcome.

### A5 — External CLI runtime: Codex trước, Claude sau

- [ ] **A5.01** Audit driver contracts và đường chọn default driver; thiết kế session/API/runtime selection có validation.
- [ ] **A5.02** Process supervisor: argv/cwd/env an toàn, process ownership, output limits, kill tree, shutdown/recovery.
- [ ] **A5.03** Codex adapter: start/resume, persisted provider session IDs, streaming events, usage, cancel, steer và approval mapping theo CLI thực tế.
- [ ] **A5.04** Nối native/external routing từ assistant/session/profile; error khi runtime chưa cài/chưa login thay vì fallback âm thầm.
- [ ] **A5.05** Chuẩn hóa protocol/task/verification status, history và artifacts; giữ canonical tool/authorization boundary phù hợp từng driver.
- [ ] **A5.06** UI runtime/model selection và trạng thái setup/quota/approval; telemetry phân biệt provider-confirmed, estimated, context occupancy, rate-limit/subscription và child usage.
- [ ] **A5.07** Test resume/restart/cancel/approval/cleanup, malformed output, command injection, malicious project content và process leaks.
- [ ] **A5.08** Claude adapter sau khi Codex đạt gate; đánh giá OpenCode/Pi riêng trước khi bổ sung, không hứa hỗ trợ khi chưa test.

**Nghiệm thu:** lựa chọn driver chạy đúng end-to-end; session IDs bền; không orphan process; approval và resume đúng hành vi thật.

### A6 — Git/worktree/checkpoint/code review

- [ ] **A6.01** Audit Git services và dirty-checkout policy; thống nhất ownership/checkpoint format.
- [ ] **A6.02** Worktree create/attach/list/archive/recover; giữ dirty checkout và file chưa track của người dùng.
- [ ] **A6.03** File checkpoints với digest và audit trail; rollback có preflight, phát hiện conflict và bảo toàn dữ liệu.
- [ ] **A6.04** Diff/review artifacts, comment locations và evidence; link đúng file/revision.
- [ ] **A6.05** Nối delegation/CLI sessions tới worktree/cwd và lifecycle cleanup.
- [ ] **A6.06** Test paths có dấu/khoảng trắng, symlink, dirty files, conflict, cancellation và Windows/macOS/Linux.

**Nghiệm thu:** không đụng dirty checkout; rollback không ghi đè việc mới; conflicts được báo; cleanup/recovery có bằng chứng.

### A7 — Coding workspace

- [ ] **A7.01** Audit layout hiện có; thiết kế editor/terminal/split panes cùng chat/document/browser; chọn dependency theo nhu cầu thật.
- [ ] **A7.02** Editor đọc/sửa/save file thật; dirty indicator, external change/conflict, encoding và scoped paths.
- [ ] **A7.03** Terminal session thực với process ownership, bounded output, resize và cleanup; quyền truy cập theo project/runtime.
- [ ] **A7.04** Tabs/split panes/focus/keyboard và session restoration; áp dụng motion system đã nghiệm thu.
- [ ] **A7.05** Nối editor/terminal/review tới artifacts và agent sessions; lỗi backend được hiển thị rõ.
- [ ] **A7.06** Test không phá chat/document pane, resize/focus, unsaved work, process teardown và accessibility.

**Nghiệm thu:** control hoạt động thật; không mất unsaved work; layout/focus ổn định; không rò terminal process.

### A8 — Automation triggers, GitHub inbox, CI repair

- [ ] **A8.01** Thiết kế event sources và scoped credentials; revocation và permissioned actions.
- [ ] **A8.02** Durable inbox/event dedup/cursor/retry; nối triggers tới scheduler/coordinator thay vì chạy trực tiếp trong UI.
- [ ] **A8.03** GitHub/CI inbox: fetch, filter, read state, evidence và liên kết issue/PR/run.
- [ ] **A8.04** CI repair workflow trong worktree: reproduce → fix → tests → reviewable result; push/PR/merge chỉ theo quyền đã cấp.
- [ ] **A8.05** Audit trail, notifications và rate-limit/backoff; xử lý revoked credentials/malformed events.
- [ ] **A8.06** Test event replay, dedup, retry races, prompt injection từ issue/log và không tự publish hành động thiếu quyền.

**Nghiệm thu:** mỗi event tạo đúng một tác vụ theo policy; credentials không lộ; thay đổi có evidence và approval boundary rõ.

### A9 — Remote execution qua SSH

- [ ] **A9.01** Host registry, fingerprint authentication, scoped credentials và revocation; tránh lưu secrets vào transcript/artifacts.
- [ ] **A9.02** Remote driver/process supervisor: durable run ownership, host-local session IDs/cwd và capability negotiation.
- [ ] **A9.03** Reconnect/output replay/cancel/cleanup; xác định hành vi khi mất mạng, daemon restart hoặc host bị revoke.
- [ ] **A9.04** Remote project/worktree/artifact paths, download/review và permissions; không nhầm local/remote scope.
- [ ] **A9.05** UI chọn host và connection/error states, approval routing và job ownership.
- [ ] **A9.06** Test host key mismatch, revoke khi chạy, network partitions, duplicate reconnect, orphan processes và adversarial paths.

**Nghiệm thu:** host được xác thực; revoke có hiệu lực; reconnect không tạo duplicate run; ownership/cancel vẫn xác định được khi mất mạng.

## 6. Gate chất lượng áp dụng cho mọi chặng

- [ ] **Q.01** Trước khi sửa: xác minh Git state, hướng dẫn dự án, source/domain liên quan và những implementation đã tồn tại. Giữ nguyên thay đổi đồng thời.
- [ ] **Q.02** Sau thay đổi: build/typecheck và targeted functional tests; ghi exit codes/kết quả. Lỗi cũ/môi trường phải nêu riêng.
- [ ] **Q.03** Thay đổi runtime/schema: native-agent regression, project isolation, cancellation, history replay, migration/backup/recovery.
- [ ] **Q.04** Thay đổi process/network: adversarial arguments, malicious external content, auth/revocation, capability subset, secret redaction và cleanup.
- [ ] **Q.05** Audit Electron hardening, gồm cờ `no-sandbox`, trước khi mở rộng unattended/external execution; project sandbox không thay Chromium sandbox. Đánh giá compatibility trước khi sửa startup flags.
- [ ] **Q.06** UI: keyboard/focus/labels/contrast, loading/empty/error/success, reduced motion, resize và pane state.
- [ ] **Q.07** Telemetry/evaluation: phân biệt usage xác nhận/ước lượng, protocol completion/task outcome/verification; không dựng dashboard bằng số giả.
- [ ] **Q.08** Review diff, license, generated files và secrets; cập nhật docs, checklist và bằng chứng trước khi bàn giao từng chặng.

Q là checklist lặp lại theo từng chặng, không phải các task được tick vĩnh viễn sau một lần chạy.

## 7. Gói công việc tiếp theo để giao agent

| Gói | Task chính | Đầu ra phải bàn giao |
|---|---|---|
| NEXT-01 | C1.07–C1.09 | Regression stream/scroll/handoff trong app thật; fixes có bằng chứng nếu phát hiện lỗi |
| NEXT-02 | C2.02–C2.07 | Audit interaction và implementation navigation/panel/resize còn thiếu; ảnh/test focus |
| NEXT-03 | C3.02–C3.06 | State/event projection và working UI đầy đủ lifecycle; regression tool/subagent/completion |
| NEXT-04 | C4.02–C4.06 | Production profile nhiều lượt; tối ưu switch dài có số đo trước/sau và memory budget |
| NEXT-05 | C4.07–C4.12 | Gỡ vướng kiểm thử, OS matrix, report gate chat theo từng tiêu chí |
| NEXT-06 | A1.01–A1.06 | Persistent assistant đầu tiên dùng nền dữ liệu/runtime hiện có |

Các gói chỉ là cách chia việc để giao tiếp; không tự spawn agent, chạy đồng thời, commit hay mở PR. Chọn task chưa đạt đầu tiên, đọc bằng chứng hiện tại và cập nhật plan khi hoàn thành.
