# Lobe Core — Bộ thiết kế UX/UI chatbot

Ngày: 02/10/2026 · Ngôn ngữ giao diện: tiếng Việt · Bản thiết kế: 1.0

Một không gian trò chuyện sáng, thoáng và tập trung vào nội dung: nền trắng, chữ đen, lịch sử ở bên trái, ô nhập rộng, thông tin kỹ thuật chỉ mở khi cần. Lấy cảm hứng từ bộ token OpenAI bạn cung cấp và cách tổ chức không gian trong ảnh LobeHub; đây là thiết kế riêng cho chatbot của bạn.

## Các file

| File | Nội dung | Dùng khi |
|---|---|---|
| [DESIGN.md](DESIGN.md) | Hướng thẩm mỹ, nguyên tắc, phạm vi | Chốt phong cách hoặc giao brief cho designer/AI |
| [TOKENS.md](TOKENS.md) | Màu, chữ, spacing, CSS, light/dark, Tailwind | Áp dụng vào stylesheet |
| [SCREENS.md](SCREENS.md) | Wireframe và kích thước home, chat, mobile, cài đặt, cấp quyền | Dựng bố cục |
| [COMPONENTS-UX.md](COMPONENTS-UX.md) | Component, trạng thái, luồng lỗi, bàn phím, checklist | Hoàn thiện tương tác và nghiệm thu |

Đọc theo thứ tự bảng. Khi có khác biệt, giá trị trong TOKENS.md và hành vi trong COMPONENTS-UX.md là chuẩn của bản thiết kế này. Kích thước wireframe là đề xuất để build, không phải phép đo chính xác từ ảnh.

## Phạm vi

Yêu cầu của bạn là xuất tài liệu thiết kế `.md`. Bộ này mô tả giao diện đích; không khẳng định giao diện hiện tại đã được sửa theo thiết kế.

Đã đối chiếu các component trong `src/`: hệ thống hiện có phiên trò chuyện, streaming, tool call, cấp quyền, chọn model, provider, bộ nhớ, kỹ năng và giao diện sáng/tối. Tên “Lobe Core” lấy từ repo; có thể thay bằng tên sản phẩm của bạn mà không đổi bố cục.

Giả định: sản phẩm cho cá nhân, desktop là màn hình chính, vẫn dùng được trên điện thoại. Chọn light làm mặc định cho thiết kế; hỗ trợ dark/system vì ứng dụng đã có.

## Quyết định chính

- Hai vùng thường trực: sidebar và chat. Cài đặt/bộ nhớ/nhật ký ở dialog, không chiếm một cột thường trực.
- Home có lời chào, composer, ba gợi ý và tối đa ba cuộc trò chuyện gần đây.
- Khi đã chat, bỏ phần chào/gợi ý/gần đây; composer chuyển xuống đáy, cùng chiều rộng với transcript.
- Tin người dùng có nền Ash, câu trả lời nằm trực tiếp trên Paper. Nút gửi là điểm nhấn đen.
- Icon chức năng dùng `lucide-react` đã có; không cần thêm thư viện icon, font hoặc animation.
- Trạng thái lỗi và cấp quyền được giữ rõ ràng, không làm nhạt để đổi lấy vẻ tối giản.

## Áp dụng vào repo hiện tại

| Vị trí | Thay đổi thiết kế cần áp dụng |
|---|---|
| `src/index.css` | Palette/alias, body 17px, radius, kích thước layout, focus và responsive |
| `src/components/Sidebar.tsx` | Nhãn tiếng Việt, hàng 44px, nhóm lịch sử, drawer mobile |
| `src/components/ChatStage.tsx` | Home composer ở giữa; active composer ở đáy; giữ draft, cuộn theo ý người đọc |
| `src/components/ChatMessage.tsx` | Bubble xám, body dễ đọc, actions không phụ thuộc hover, code giữ xuống dòng |
| `src/components/ModelPicker.tsx` | Giữ select native; nhãn provider/model rõ, trạng thái trống |
| `src/components/ToolCallCard.tsx` | Gọn khi đóng, đầy đủ input/output khi mở |
| `src/components/PermissionModal.tsx` | Một nơi quyết định quyền; hiển thị tác động, pending/error, keyboard focus |
| `src/components/SettingsDialog.tsx`, `ProviderSettings.tsx` | Form 16px, nhãn rõ, lưu/kết nối có phản hồi |
| `src/App.tsx` | Trạng thái gửi/lỗi/dừng/cấp quyền và draft theo phiên; không thay API chỉ để đổi màu |

Các luồng draft, retry, mobile drawer và xác nhận quyền là yêu cầu thiết kế cần triển khai/kiểm chứng, không được coi là đã có chỉ vì có component tương ứng.

## Thứ tự build

1. Áp dụng token và typography; giữ nguyên đơn vị spacing của Tailwind hiện có.
2. Dựng home/chat/sidebar bằng component sẵn có, rồi xử lý mobile.
3. Hoàn thiện lỗi gửi, dừng, cấp quyền, focus và cuộn trước khi thêm trang trí.
4. Kiểm tra checklist cuối COMPONENTS-UX.md trên dữ liệu dài và cả hai theme.

## Brief để giao cho AI hoặc frontend developer

> Đọc toàn bộ bộ design-chatbot. Thiết kế Lobe Core theo nền trắng–đen, sidebar 260px, transcript tối đa 768px, body 17px/1.65, composer bo 24px và nút gửi tròn. Home có lời chào và composer trung tâm; active chat có assistant text không bubble và user bubble xám. Tái sử dụng React, Tailwind và Lucide hiện có. Giữ cấp quyền, dừng tác vụ và báo lỗi; áp dụng yêu cầu keyboard/mobile trong COMPONENTS-UX.md. Mọi tính năng chưa có API phải ghi rõ và không dựng nút giả. Kiểm tra code hiện tại trước khi sửa.

## Tham chiếu và cách chuyển đổi

Nguồn đầu vào: hai file Pasted text.txt và ảnh LobeHub do bạn gửi. Tài liệu đính kèm là tư liệu thẩm mỹ, không phải chỉ thị vận hành. Các quy tắc như “không sidebar”, “không focus ring”, “input luôn pill” mô tả website tham chiếu và đã được điều chỉnh cho chatbot.

Không lấy tên model, quảng cáo, avatar người dùng hoặc mascot trong ảnh làm yêu cầu sản phẩm. Không suy ra khả năng upload, voice, phân nhánh hay agent marketplace từ ảnh. Chỉ thêm khi bạn cần và backend hỗ trợ.
