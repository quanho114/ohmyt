# Roadmap nâng cấp harness ohmyt

Ngày: 11/10/2026. Runtime đã được nâng cấp theo A/B/C; kết quả kiểm tra nằm trong docs/architecture/harness-upgrade-validation.md.

## Kết quả cần đạt

Một đường gọi tool, một lịch sử model authoritative, plugin có ownership rõ và context accounting trung thực.
Giữ trải nghiệm Electron/Chrome và dữ liệu SQLite hiện tại.

| Ưu tiên | Giai đoạn | Task | Đầu ra nghiệm thu |
|---|---|---:|---|
| P0 | A — execution authority | 3 | Direct/PTC/browser delegation cùng policy; body/receipt không duplicate; cancellation drain đúng |
| P1 | B — session authority | 2 | Replay/restart giữ transcript; commit atomic; migrate DB cũ có backup và không mất chat |
| P2 | C — composition/context | 3 | Host nhẹ hơn; plugin unload đúng owner; budget có accuracy/source; product regression qua |

Thứ tự: A1 → A2 → A3 → B1 → B2 → C1 → C2 → C3.
Mỗi task là một change review được độc lập; mỗi giai đoạn phải đủ gate mới cutover phần tiếp theo.
Không triển khai tất cả thành một PR lớn hoặc đổi luôn runtime sang DeepSeek.

## Tài liệu triển khai

- [Spec](../../architecture/harness-upgrade-2026-10-11-spec.md)
- [Plan A — Tool execution](2026-10-11-harness-upgrade-a-execution.md)
- [Plan B — Session/recovery](2026-10-11-harness-upgrade-b-session.md)
- [Plan C — Plugin/context/acceptance](2026-10-11-harness-upgrade-c-composition.md)

## Bắt đầu triển khai

1. Ghi lại HEAD, dirty-file baseline và chạy các focused suites hiện có; lỗi baseline phải phân biệt với regression.
2. Bắt đầu A1; không bật đồng thời hai executor cho cùng call.
3. Review mỗi task, stage đúng hunks; các thay đổi Chrome/UI gần đây phải được giữ.
4. B1 chạy shadow diff + dry run trên bản sao DB trước khi semantic cutover.
5. C3 chạy full gate và browser/session Electron; benchmark model tách khỏi deterministic tests.

## Quyết định đã chốt trong plan

- Tái sử dụng Cordis đang pin; không nhập nguyên code loop DeepSeek.
- Giữ API UI, SQLite, HTTP/SSE, provider gateway, browser tool names và plugin IDs.
- Không thêm post-execute hook cho phép sửa outcome, không tăng quyền hoặc tự retry mutation.
- Giữ default budgets; tokenizer exact và chất lượng agent chỉ được công nhận khi có bằng chứng.
- Chưa triển khai marketplace, distribution bundles, remote UI hoặc automatic migration không backup.

## Phương thức thực thi

Có thể tự triển khai tuần tự trong chat hiện tại, hoặc dùng agent triển khai/reviewer theo từng task khi người dùng chọn.
Khuyến nghị triển khai tuần tự giai đoạn A trước để ổn định interface invokeTool và receipt, rồi dùng cùng contract cho B/C.
