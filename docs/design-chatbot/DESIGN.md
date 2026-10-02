# DESIGN — Một bàn làm việc cho cuộc trò chuyện

## Mục tiêu

Người dùng mở ứng dụng, biết ngay nơi nhập câu hỏi, nhận câu trả lời dễ đọc và tìm lại cuộc trò chuyện cũ. Khi agent làm việc với tệp hoặc terminal, họ nhìn thấy việc đang diễn ra và chủ động cho phép hoặc dừng.

Ấn tượng mong muốn: sạch, yên tĩnh, nhẹ và có chủ đích. Sự đẹp đến từ độ rộng cột chữ, khoảng cách, nhịp typography và trạng thái nhất quán.

## Ba hướng đã cân nhắc

| Hướng | Điểm mạnh | Đánh đổi |
|---|---|---|
| Chat tập trung, sidebar lịch sử — chọn | Ít chrome, dễ hỏi/đọc, tái sử dụng cấu trúc đang có | Các công cụ quản trị cần mở cài đặt |
| Workspace ba cột thường trực | Xem chat và hoạt động cùng lúc | Thu hẹp cột đọc, nhiều thông tin khi không cần |
| Home dashboard nhiều card | Dễ giới thiệu nhiều tính năng | Làm chậm hành động chính là bắt đầu chat |

Chọn hướng đầu tiên. Một dialog cài đặt chứa các chức năng phụ; tool đang chạy xuất hiện ngay trong transcript.

## Học gì từ tham chiếu

| Từ bộ token OpenAI | Từ ảnh LobeHub | Chuyển thành Lobe Core |
|---|---|---|
| Paper, Obsidian, Graphite | Sidebar bám trái, nội dung rộng | Canvas trắng, sidebar tint nhẹ |
| Chữ là trọng tâm | Lời chào và prompt nổi bật | Heading đủ lớn, ô nhập luôn dễ thấy |
| Viền hairline, ít shadow | Toolbar chọn model trong composer | Viền mảnh, model là secondary control |
| Pill cho control nhỏ | Danh sách gần đây nhẹ | Chip pill, lịch sử dạng hàng |
| Nhịp whitespace rộng | Gợi ý tách khỏi navigation | Ba gợi ý ngắn, không thêm dashboard |

Không bê bố cục website bài viết, footer nhiều cột, CTA marketing hoặc hình hero vào chatbot. Ảnh cung cấp hướng không gian; bộ màu cung cấp vật liệu.

## Nguyên tắc thị giác

1. **Nội dung đứng trước chrome.** Assistant trả lời trên nền canvas. Tên, thời gian, tool status nhỏ hơn body.
2. **Một hành động chính mỗi ngữ cảnh.** Chat: gửi; đang chạy: dừng; form: lưu; dialog quyền: cho phép một lần. Các hành động còn lại dùng outline/ghost.
3. **Phân vùng bằng khoảng cách.** Chỉ dùng border cho control, tool card, code, vùng overlay hoặc nơi cần nhận biết tương tác.
4. **Bo góc theo công dụng.** Card kỹ thuật 6px; row 6px; composer và user bubble 24px; chip/button nhỏ pill. Không bo mọi thứ thành viên thuốc.
5. **Body có nhịp đọc.** 17px/1.65 desktop; 16px/1.65 mobile. 18px/1.32 dành cho tiêu đề ngắn, không dùng cho đoạn trả lời dài.
6. **Trạng thái có chữ.** “Đang trả lời”, “Chờ cấp quyền”, “Mất kết nối”, “Đã dừng”; màu hoặc spinner chỉ hỗ trợ.

## Màu sắc và độ nổi

Trong trạng thái bình thường, palette gần như hoàn toàn trắng–đen. Sidebar dùng Whisper trên nền trắng; selected row và user bubble dùng Ash. Text và icon có chức năng dùng Obsidian/Graphite.

Nút gửi đen, biểu tượng trắng. Dark đảo thành nút sáng trên canvas tối qua semantic token. Red/amber chỉ là ngoại lệ cho lỗi, hành động phá hủy và cảnh báo quyền; không dùng làm brand accent, nền section hay bubble thông thường.

Không gradient, glass, glow hoặc shadow dày. `shadow-sm` chỉ được phép trên overlay khi cần phân biệt lớp; mặc định composer và card không shadow. Dialog được tách bằng backdrop và outline.

## Chữ và icon

Giữ stack OpenAI Sans mà bạn cung cấp, nhưng nếu không có font được phép dùng thì sử dụng system-ui; không tải font từ website tham chiếu. Kiểm tra đủ dấu tiếng Việt: “Trò chuyện”, “Đã dừng”, “Từ chối”, “Bộ nhớ”.

Weights 400 cho nội dung, 500 cho nhãn/điều khiển, 600 cho heading và nhấn mạnh trong câu trả lời. Không thêm serif hay font display mới. Code dùng monospace hệ thống.

Tái sử dụng Lucide trong repo, icon UI 18px, stroke 1.75; nút gửi 20px. Target của nút vẫn 44px, độc lập kích thước icon. Avatar assistant 24px bằng mark hiện có hoặc monogram; không cần mascot lớn, emoji hoặc hình trang trí mới.

## Nội dung giao diện

| Ngữ cảnh | Copy |
|---|---|
| Home | “Bạn muốn làm gì hôm nay?” |
| Composer | “Nhắn cho trợ lý…” |
| New conversation | “Trò chuyện mới” |
| Search | “Tìm cuộc trò chuyện” |
| Generation | “Đang trả lời…” |
| Tool | “Đang đọc tệp…” hoặc tên hành động thực tế |
| Permission | “Cần bạn cho phép” |
| Local model | “Chạy trên máy” |
| Cloud model | “Dùng dịch vụ trực tuyến” |

Tên model/provider giữ nguyên từ cấu hình. Không hardcode tên hoặc khả năng trong ảnh. Không ghi “Mọi dữ liệu chỉ ở trên máy” khi người dùng chọn provider trực tuyến; vị trí lưu lịch sử và nơi gửi prompt là hai thông tin khác nhau.

## Chuyển động

Hover/focus chuyển màu 140ms. Drawer xuất hiện 180ms; không animate chiều rộng transcript theo từng token. Streaming cập nhật nội dung bình thường, không hiệu ứng gõ chữ bổ sung hay scroll smooth liên tục.

Tôn trọng reduced motion: bỏ chuyển động drawer, cursor pulse và smooth scroll. Không stagger danh sách tin nhắn hoặc animate lại lịch sử khi mở phiên.

## Tiêu chí nhìn một lần

- Home có một tiêu đề, một composer và ba gợi ý; nhận ra ô nhập trước cài đặt.
- Chat có một cột đọc tối đa 768px; không tràn cả chiều rộng màn hình lớn.
- UI thông thường chỉ có điểm nhấn hành động đen; bubble không xanh.
- Trạng thái cấp quyền vẫn dễ nhận ra khi bỏ toàn bộ màu cảnh báo.
- Desktop, mobile và dark giữ cùng thứ bậc nội dung và cách thao tác.
