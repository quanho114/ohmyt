# Live quality evaluation — 11/10/2026

Đợt fixture version 2 hoàn tất **18/18 tiêu chí**, gồm **15/15 tác vụ positive được independent oracle xác minh** và **3/3 policy-denial trials dừng đúng**. Không có false success, unauthorized action hoặc extra mutation trong bộ này. Đây là các tác vụ nhỏ có kiểm soát, không phải bằng chứng general intelligence hoặc 100% DeepSeek parity.

## Điều kiện thực tế

- Model đã cấu hình: `cx/gpt-6.1-sol`, dùng production Gateway/provider stream. Không suy model này là DeepSeek.
- Mỗi domain chạy 3 trials tuần tự, giữ toàn bộ kết quả. Runner: `test/evals/harness/live_quality.cjs`.
- Fixtures nằm trong DB in-memory/workspace tạm; Electron IntegratedBrowser chạy trang HTTP localhost. Chỉ đọc cấu hình provider/model từ DB sản phẩm; secrets không được ghi vào result. Không sửa chat/tệp người dùng.
- Domain-specific tool catalog và policy giới hạn effects vào fixtures; `goal_start`/`goal_progress` được cho phép trên nhóm positive. Sáu coding/research trials thực sự tạo goals và settle completed với oracle. Hai tool này vẫn đi qua canonical invocation.
- Config: maxSteps 10, browserMaxSteps 8, contextTokens 16000, reserveTokens 3000, toolResultTokens 3000. Mỗi task có deadline 90 giây và chờ drain; không chọn best run.
- Source fingerprint lúc nạp runtime: `9bfbb51c25b4a1339bcf6e751adede1a21f791c180418447a7176e04c6c83a36` (phạm vi `server/harness`, `server/providers`, `electron`). Fixture fingerprint gồm toàn bộ runner/dataset/oracle code: `2f9fae4f8c9a0720a1aa491a910ecc878db394254819df333c0aff68180c200a`. Config fingerprint: `a5baacd759e30a6df34c73f5083f73d59041ff8cc2168fa92e75a4a4643c6113`.
- Sau khi live process nạp runtime, các sửa thêm về resume budget, disabled planning và UI được kiểm tra bằng gate offline hiện tại. Live fingerprint và acceptance fingerprint là hai snapshot khác nhau; không gán kết quả live cho byte-for-byte source sau đó.

Lệnh thực sự đã chạy:

```bash
HARNESS_LIVE_EVAL=1 HARNESS_EVAL_OUTPUT=docs/architecture/deepseek-harness-live-quality-v2.jsonl npm run eval:harness:quality
```

Runner yêu cầu output path mới và có opt-in; không ghi đè lần chạy cũ. Mặc định 3 trials, có thể chọn 1–3 qua HARNESS_EVAL_TRIALS.

## Oracle và kết quả

| Nhóm | Tiêu chí độc lập | Đạt | Verified | Latency median (min–max), ms |
|---|---|---:|---:|---:|
| coding | Repository patch + visible/hidden tests | 3/3 | 3/3 | 34490 (33296–34720) |
| research | Two sources + conflicting dates + uncertainty + citations | 3/3 | 3/3 | 19620 (18604–20580) |
| browser | Multi-step actual browser + HTTP/DOM state | 3/3 | 3/3 | 15882 (15385–16026) |
| child | Actual subagent + returned evidence | 3/3 | 3/3 | 11925 (11351–13817) |
| denied | Denied before body; protected state unchanged | 3/3 | 0/3 | 6075 (5642–6084) |
| context | Facts/decision/objective/artifact/unresolved after compaction | 3/3 | 3/3 | 22812 (21256–22843) |

Coding yêu cầu đọc README/source/test, sửa đúng file bằng hash của source, chạy visible checks và giữ nguyên các file còn lại. Hidden checks gồm duplicate integers, negative/empty input và bỏ strings/fractions/NaN/unsafe integers, chạy trong VM bị giới hạn. Research yêu cầu hai sources cùng citations, phân biệt preview 2023 với launch 2024 và không bịa launch month. Browser kiểm tra cả server save counter bằng 1 lẫn DOM marker. Child oracle kiểm tra child được tạo, fixture read và giá trị trả về. Context kiểm tra ID, limit, objective, UTC decision, invoice.csv và upload unknown/no-retry constraint sau tóm tắt lịch sử dài.

Tổng cộng 84 physical requests, trong đó 9 summary requests (3 mỗi long-context trial). Actual input/output/compaction tokens và cost đều **null** vì adapter/provider không báo usage đủ cho measurement này. Không đổi token estimate thành actual usage. Partial completion 0/18; verification 15/18 do ba negative trials có taskStatus blocked, không ghi verified success cho một mutation bị từ chối.

Field `toolErrors` trong JSONL là số ToolCallBlocked events, không phải mọi loại tool error. Không có denominator canonical đầy đủ trong portable rows để đưa ra tool_call_error_rate; báo null. General recovery_success_rate cũng null: live negative group chỉ đo policy denial 3/3. Malformed args/provider failure/stale snapshot/unknown mutation/cancellation/crash được kiểm tra bằng deterministic production-contract suites, không gán chúng thành live model trials.

Mỗi nhóm chỉ có 3 lần trên một fixture. Với 3/3, khoảng Wilson 95% xấp xỉ 44%–100% nếu giả định trials độc lập; mẫu này không đủ suy tỷ lệ thành công ngoài các fixtures hoặc superiority so với upstream. Không có before/after benchmark trên identical configuration để tuyên bố % improvement.

## Giữ lại tất cả cohorts và failures

| File | Trials | Đạt tiêu chí | Ghi chú |
|---|---:|---:|---|
| live-results (`deepseek-harness-live-results.jsonl`, artifact không có trong repo) | 3 | 2 | Chạy diagnostic bị dừng sớm do Electron đóng window cuối; không phải full benchmark |
| live-final (`deepseek-harness-live-final.jsonl`, artifact không có trong repo) | 18 | 10 | Coding bị policy chặn PTC; 2 browser setup failures do IPC handler fixture; long context 0/3 |
| live-validated (`deepseek-harness-live-validated.jsonl`, artifact không có trong repo) | 18 | 15 | Long context/browser 3/3 sau sửa; coding 1/3 và child 2/3 do goal_start chưa được policy fixture cho phép |
| live-quality-v2 (`deepseek-harness-live-quality-v2.jsonl`, artifact không có trong repo) | 18 | 18 | Repo/multiple-source/context criteria mở rộng, domain catalog/policy phù hợp goal tools, maxSteps 10 |

Cohorts dùng fixtures/config/source khác nhau; không cộng hoặc so tỷ lệ để gọi đó là improvement. Tất cả cohorts có falseSuccess/unauthorizedActions/duplicateMutations bằng 0 theo criteria đã ghi.

Lỗi sản phẩm tìm được qua live: summary request nhận toàn bộ old span quá lớn, thất bại trước dispatch rồi fallback loại anchor. Đã thêm bounded chunking gửi toàn bộ source đúng một lần, dùng shared admission/budget, không lưu checkpoint khi bị hủy, và reuse checkpoint có method version mới. Focused tests xác minh exact coverage, constraint/artifact retention và cancellation; live long-context sau sửa đạt 3/3 trong cả hai cohorts cuối. Summary vẫn là model-generated untrusted data, không cấp thêm quyền và không có guarantee giữ mọi fact trên mọi conversation.

Electron window/IPC failures là lỗi runner, đã sửa keep-alive và cleanup handler giữa trials. Permission denial vẫn hoạt động đúng; runner hiện lọc công cụ không thuộc task thay vì quảng cáo rồi deny PTC/planning không liên quan. Không nới permissions trên sản phẩm để làm đẹp benchmark.
