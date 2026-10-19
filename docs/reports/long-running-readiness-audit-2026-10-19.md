# ohmyt: đánh giá khả năng làm việc dài hơi

Ngày đánh giá: 2026-10-19. Đọc trạng thái working tree hiện tại, gồm thay đổi chưa commit; HEAD `2c4109b41d5c0660bc76ee5af256ba7335c615d3`. Đây là đánh giá bằng mã nguồn, regression và tài liệu chính thức, không phải benchmark chất lượng giữa các sản phẩm.

## Kết luận

ohmyt đã có harness thực sự để thực hiện tác vụ nhiều bước, tiếp tục qua nhiều round và nén ngữ cảnh khi daemon còn hoạt động. Chưa đủ bằng chứng để khẳng định chất lượng hoàn thành tác vụ dài hàng giờ tương đương DeepSeek Harness, Codex CLI hoặc Claude Code. Không tìm thấy bằng chứng chạy đối chứng cùng nhiệm vụ, model, ngân sách và bộ chấm giữa bốn hệ thống.

Follow-up từ lượt sử dụng thật cùng ngày xác nhận một lỗi tích hợp Browser Use:
agent gọi navigate khi chưa có tab được phép, startup trả `NO_ALLOWED_TAB` nhưng
canonical invocation chuyển thành unknown và khóa mọi tool tiếp theo. Model còn
đưa ra kết luận repository không tồn tại sau các truy vấn Instant Answers không
đủ bằng chứng. Điều này cho thấy suite harness pass không thay thế kiểm chứng
workflow thực tế. Bản sửa phân loại thiếu tab là lỗi prerequisite có thể sửa bằng
`browser_open`, dọn session startup thất bại và giữ nguyên fence cho mutation đã
dispatch. Regression canonical và Electron + Python Browser Use thật đã pass cho
chuỗi thiếu tab → mở tab → navigate → đọc DOM. Hướng dẫn nguồn tìm kiếm cũng được
làm rõ; chưa chạy lại nghiên cứu GitHub bằng model live nên không suy ra chất
lượng trả lời của model đã được xác minh từ bản sửa này.

Ba khái niệm cần tách biệt:

1. **Chạy lâu được:** đã có cơ chế hỗ trợ, nhưng vẫn chịu budget và giới hạn công cụ.
2. **Giữ đúng mục tiêu và làm đến khi đạt:** đã có goal/plan/context hỗ trợ; mức thành công thực tế cần live evaluation.
3. **Tự tiếp tục xuyên crash/restart:** hiện không; recovery chủ động pause/disarm và yêu cầu resume. Đây là ranh giới an toàn có chủ đích.

## Bằng chứng trong implementation

| Khả năng | Bằng chứng | Ý nghĩa và giới hạn |
| --- | --- | --- |
| Tự tiếp tục nhiều vòng | `server/harness/goal_round_driver.js:12`, `server/harness/goals.js:47` | Reserve → run → settle tuần tự; mặc định goal 256 rounds, 60 model requests, 100 tools. 256 rounds không đồng nghĩa đủ budget chạy 256 rounds. |
| Context qua nhiều cửa sổ | `server/harness/compaction.js:4`, `server/harness/host.js:218` | Nén history và active turn, giữ input/steering và nhóm call/result; có reuse, chunk summary và xử lý output lớn. Không chứng minh summary giữ nguyên mọi ý nghĩa. |
| Durable history/inbox | `server/harness/sessions.js:117`, `server/harness/inbox.js:6` | Semantic events, receipt, transcript và message admission bền; recovery không replay mutation bất định. |
| Shared budget | `server/harness/budgets.js:1`, `server/harness/driver.js:33` | Requests/tools dùng chung cho children và summaries; chưa có tổng token/spend/wall-clock enforcement. `estimatedCost` là null. |
| Retry có giới hạn | `server/harness/attempts.js:3` | Tối đa 2 attempts, chỉ UNREACHABLE/TIMEOUT/ECONNRESET trước output. Chưa có backoff/jitter/Retry-After trong lớp này. |
| Unknown-effect fence | `server/harness/tool_invocation.js:60` | Chặn execution tiếp theo khi tác động chưa rõ, kể cả nested PTC và body đang chờ middleware/approval. |
| Steering/cancel/drain | `server/harness/driver.js:167`, `server/harness/agents.js:40` | Input được tiếp nhận tại boundary; giữ ownership cho đến cleanup. |
| Child agents | `server/harness/subagents.js:4` | Scope/capability/budget/cancel kế thừa; tối đa 3 child hoạt động/root, sâu 2. Registry hoạt động nằm RAM; không có durable child worker resume. |
| Nhắc khi lặp | `server/harness/progress.js:6` | Nhắc identical evidence và identical arguments tại các ngưỡng; advisory, chưa phải supervisor chứng minh tiến triển. |
| Xác minh hoàn thành | `server/harness/outcomes.js:5`, `server/harness/driver.js:461` | Có callback host `verifyTask` và evidence refs. Không tìm thấy đăng ký verifier production cho goal UI bình thường; các đăng ký quan sát được nằm trong test/eval. |

## Khoảng trống ảnh hưởng trực tiếp đến tác vụ dài

### 1. Goal completed có thể vẫn chưa được kiểm chứng độc lập

`goals.js:226` cho phép goal kết thúc với `reason: model_reported`. Điều này không làm TaskOutcome trở thành verified. Không nên suy từ plan steps đều done hoặc model gọi complete sang kết luận test thực tế đã đạt. Luồng `goal_progress finish:true` còn có hành vi review_required khi chưa verified; các đường kết thúc cần được diễn giải nhất quán trong sản phẩm.

Ưu tiên: gắn acceptance checks được người dùng/host chấp nhận vào pipeline hiện tại. Giữ riêng model-reported completion và verified completion; không dùng một LLM tự đánh giá làm bằng chứng độc lập mặc định. Với coding, check phải chạy trên revision/artifact thực tế và làm mất hiệu lực khi nội dung thay đổi.

### 2. Recovery an toàn nhưng cần người tiếp tục

`goals.js:238` chuyển goal active sang paused với restart_requires_resume. `sessions.js:117` đóng interrupted turn, ghi cancelled khi body chưa bắt đầu và unknown khi có thể đã có hiệu ứng. Không khôi phục tiến trình shell hay promise child cũ.

Giữ invariant này. Cải thiện nên là bản tóm tắt recovery: đã xác nhận gì, thao tác nào chưa rõ, cần kiểm tra gì trước resume. Chỉ thiết kế tự tiếp tục sau restart nếu có yêu cầu sản phẩm và mô hình ủy quyền rõ ràng; không bật auto-resume toàn cục để đuổi theo tính năng đối thủ.

### 3. Chưa đủ quản lý ngân sách và lỗi dịch vụ cho vận hành dài

Request/tool count hạn chế số effects nhưng không đảm bảo trần chi phí hay thời gian. Token meter theo dõi context không đồng nghĩa ngân sách tổng token. Retry mạng hiện đủ bảo thủ về partial output, nhưng không có chờ rate limit/quota reset hoặc backoff trong RequestAttempts.

Ưu tiên: deadline, optional token/spend ceiling với usage thiếu được xử lý rõ; backoff có cancellation cho lỗi được gateway phân loại là retryable, tuân thủ Retry-After. Không replay stream đã có output hoặc mutation outcome unknown.

### 4. Tiến trình lệnh dài còn hạn chế

`server/local_runtime.js:18` thực hiện host shell theo kiểu đợi kết thúc, mặc định 30 giây và tối đa 300 giây. Shell project đi qua sandbox riêng (`server/tools.js:288`); không được suy ra mọi provider có cùng giới hạn từ host implementation. Chưa thấy giao diện shell session/yield/poll tương đương background terminal của Codex trong đường thực thi đã đọc.

Nếu cần build/data job kéo dài, thêm contract job handle, poll output có giới hạn, cancellation/process-group cleanup và receipt vào sandbox/invocation hiện tại. Chỉ tăng timeout không giải quyết việc quan sát tiến độ hay phục hồi.

### 5. Chưa có chứng cứ chất lượng dài hơi tương ứng

`test/evals/harness/run.js` cấu hình 5 hoặc 8 steps và deadline 120 giây; `live_quality.cjs` dùng fixture nhỏ thuộc 6 domain, maxSteps 10. Có oracle độc lập là điểm tốt, nhưng thiết kế đó chưa đo một nhiệm vụ repo thực kéo dài nhiều giờ với nhiều lần compaction và thay đổi hướng.

## Đối chiếu tài liệu chính thức

- **DeepSeek Harness:** trang chính thức công bố nền tảng plugin, subagents và các khả năng background/scheduled; một số được đánh dấu experimental. ohmyt thực sự vendor lifecycle/fold/prompt goal có provenance, không chỉ sao chép lời nhắc. Tuy nhiên round driver, admission, budget, persistence là adapter ohmyt. Không suy ra tương đương toàn bộ upstream từ phần import đó. Nguồn: [DeepSeek Harness](https://deepseek.com/en/harness/), provenance local tại `server/vendor/deepseek-goal/README.md` và `server/vendor/deepseek-harness/README.md`. Web tool không đọc được file upstream tại pinned commit trong phiên audit; vì vậy không tuyên bố đã audit toàn bộ bản upstream mới nhất.
- **Codex CLI:** tài liệu mô tả resume, subagents, scripts/CI; tài liệu long-running hiện có `/goal` trong interactive CLI. Developer commands có `/compact`, `/ps`, `/stop` cho background terminals khi unified_exec được dùng. Đây là các mốc chức năng cụ thể để so với ohmyt, không phải chứng minh Codex luôn hoàn thành đúng. Nguồn: [CLI](https://learn.chatgpt.com/docs/codex/cli), [long-running work](https://learn.chatgpt.com/docs/long-running-work), [developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).
- **Claude Code:** tài liệu mô tả local session persistence/resume/fork, automatic compaction, steering và checkpoint file edits. Checkpoint không bao phủ mọi thay đổi: Bash, external effects và nhiều kiểu subagent edits có giới hạn. Chưa thấy chức năng rewind snapshot tương ứng trong phạm vi ohmyt đã đọc. Nguồn: [how Claude Code works](https://code.claude.com/docs/en/how-claude-code-works), [checkpointing](https://code.claude.com/docs/en/checkpointing).
- **Bài nghiên cứu engineering của Anthropic:** compaction đơn lẻ chưa đủ; cần feature checklist, incremental progress, handoff artifacts và end-to-end verification. Đây là workflow nghiên cứu trên Agent SDK, không phải mọi tính năng đã được đảm bảo mặc định trong Claude CLI. Nguồn: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

## Kế hoạch kiểm chứng đề xuất

1. Chọn 3–5 nhiệm vụ trên checkout tạm: feature nhiều file, bug khó tái hiện, research có nguồn mâu thuẫn, job dữ liệu dài. Đóng băng yêu cầu và hidden acceptance checks trước khi chạy.
2. Tách hai câu hỏi: cùng model/tool/budget để đo harness khi có thể; model mặc định của từng sản phẩm để đo trải nghiệm toàn hệ thống. Không trộn hai kết quả thành một bảng xếp hạng.
3. Mỗi nhiệm vụ chạy nhiều trial, đặt ngân sách 30–120 phút như một thiết kế đo đề xuất; ép nhiều lần compaction và inject lỗi mạng, output lớn, steering muộn, kill tại effect boundary. Chưa chạy những thử nghiệm này trong audit.
4. Đo task success độc lập, false completion, lost constraints, duplicate mutations, lần cần can thiệp, requests/tools/tokens, thời gian và chi phí khi dữ liệu đáng tin. Chấm restart là pause an toàn + resume đúng, theo invariant hiện tại.
5. Ưu tiên verifier integration và recovery handoff trước; sau đó long command jobs, backoff/budget và cải thiện strategy dựa trên failure trace. Chưa có lý do từ audit này để viết lại harness hoặc bổ sung một scheduler cạnh tranh.

## Kiểm thử đã thực hiện

Node v26.8.1. Các lệnh sau kết thúc exit 0:

- `npm run test:harness` — toàn bộ chuỗi trong package.json, gồm test:harness:upgrade và 26 architecture acceptance scenarios.
- `npm run test:goal` — 6 suite, gồm 4 điểm SIGKILL thật tại reserved/admitted effects/terminal/settled và kiểm tra recovery không replay.
- Các regression bổ sung: `test_harness_active_compaction.js`, `test_harness_request_budget.js`, `test_harness_uncertainty_fence.js`, `test_harness_cleanup.js`.

Không chạy live eval vì dùng provider cấu hình/credentials thật; không chạy riêng toàn bộ UI/Electron, Browser Use, sandbox matrix, npm test hoặc build vì không sửa runtime/UI. Acceptance suite có thể tự chạy một số kiểm tra UI nhưng không thay thế toàn bộ UI matrix. Không cài optional runtime. Không sửa implementation hoặc dữ liệu ứng dụng; chỉ thêm tài liệu audit này. Fixture pass chứng minh control logic trong phạm vi đã chạy, không chứng minh chất lượng model hay độ bền vận hành nhiều ngày.
