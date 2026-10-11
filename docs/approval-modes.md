# Chế độ phê duyệt trong chat

Menu cạnh nút + trong ô soạn tin có ba lựa chọn. Lựa chọn được lưu trong
`sessions.approval_mode`, riêng cho từng chat. Chat mới mặc định `ask`.
Trang chủ có thể chọn chế độ cho chat sắp tạo. Đổi chế độ chỉ áp dụng cho lần
chạy tiếp theo; cả UI và API chặn đổi khi chat đang chạy hoặc đã xếp hàng.

| Chế độ | Cách xử lý thao tác |
| --- | --- |
| Hỏi trước (`ask`) | Đọc/ghi tệp project theo phạm vi hiện có; hỏi với thao tác cần quyền, lệnh host, mạng và lệnh shell chưa được cấp quyền. |
| Tự xét duyệt (`auto`) | Giữ phạm vi như `ask`; thao tác `ASK` được gửi tới một lượt model độc lập, không có công cụ, với yêu cầu người dùng, ngữ cảnh ngắn và chính xác thao tác. |
| Truy cập đầy đủ (`full`) | Bỏ yêu cầu `ASK`; cho phép internet và lệnh trên máy qua các công cụ đang có. Quy tắc `DENY` và giới hạn khả năng của runtime vẫn áp dụng. |

Tự duyệt trả về allow/ask/deny và lý do tiếng Việt. Rủi ro cao không được tự
allow. Kết quả sai định dạng, lỗi model hoặc quá 20 giây chuyển sang hỏi người
dùng. Hủy run hủy lượt review. Quyết định chỉ áp dụng cho chính thao tác đang
xét, không tạo rule ALLOW lâu dài. Các event ApprovalReviewStarted và
ApprovalReviewed được ghi trong lịch sử xử lý. Từ chối được đưa lại cho agent
kèm yêu cầu không lách bằng công cụ khác; ba lần từ chối liên tiếp hoặc tổng
mười lần sẽ dừng tác vụ.

Yêu cầu người dùng duyệt không tự hết hạn; chờ đến khi người dùng quyết định
hoặc hủy run. Quyền ghi nhớ theo chat/project gắn với toàn bộ tham số thao tác,
bao gồm thư mục chạy lệnh, và vẫn không vượt quy tắc DENY. Web search có mặt
trong cả ba chế độ của project: ask hỏi người dùng, auto xét duyệt, full chạy
trực tiếp nếu không có quy tắc cấm.

`full` không bật một runtime bị quản trị viên tắt. `shell_host` cần daemon có
`hostEnabled`; `fs_*` và `shell_exec` vẫn là công cụ workspace. Để đọc/ghi ngoài
project hoặc dùng mạng không bị sandbox, agent dùng `shell_host` khi có.
Browser vẫn chỉ truy cập tab được browser bridge cung cấp. Đây là bản triển khai
trên kiến trúc ohmyt, không dùng reviewer nội bộ của Codex và không đảm bảo cùng
độ chính xác với Codex. Tự duyệt dùng model đang chọn nên có thêm lượt gọi model.

Tài liệu nghiên cứu (05/10/2026):

- [Codex sandbox và quyền](https://developers.openai.com/codex/concepts/sandboxing)
- [Codex auto-review](https://developers.openai.com/codex/concepts/sandboxing/auto-review)

Khác biệt: ohmyt giữ các rule DENY hiện có và hỏi với lệnh shell chưa cấp quyền;
reviewer được bổ sung metadata chỉ đọc của đích trong project (tồn tại, loại,
kích thước, số hard link), giữ ngữ cảnh tool call và kết quả gần đây. Không đọc
nội dung file, đường dẫn bí mật, symlink hoặc đích ngoài project. Reviewer vẫn
không có công cụ để tự tìm thêm ngữ cảnh tùy ý như Codex. Nếu thiếu thông tin,
reviewer phải chuyển sang hỏi người dùng. Đầu ra review bị giới hạn kích thước.

Kiểm tra: `node test/test_approval_modes.js`, `npx tsc --noEmit`, `npm run build`.
