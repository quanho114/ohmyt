# SCREENS — Bố cục màn hình

Các wireframe dưới đây mô tả phân vùng; không phải ảnh render. Mọi giá trị màu/chữ lấy từ TOKENS.md. Khoảng trắng ngoài nội dung vẫn là canvas, không dựng thêm khung card bao toàn app.

## 1. Khung ứng dụng

| Viewport | Sidebar | Main | Overlay |
|---|---|---|---|
| ≥1200px | 260px cố định | Gutter 32px, nội dung căn giữa vùng main | Dialog giữa main/viewport |
| 768–1199px | 240px; người dùng có thể đóng | Gutter 24px | Dialog rộng tối đa viewport trừ 48px |
| <768px | Ẩn; mở drawer rộng `min(280px, viewport - 48px)` | Gutter 16px; header có nút mở lịch sử | Cài đặt full-screen; quyền gần full-width |

Main dùng `min-width: 0`; vùng cuộn dùng `min-height: 0`. Shell dùng `100dvh`. Header và composer active không cuộn theo transcript; sidebar có vùng cuộn riêng. Đừng giữ rail icon 64px trên mobile vì lịch sử cần tên để nhận biết.

## 2. Home / trò chuyện trống

```text
┌──────────────────┬────────────────────────────────────────────────────┐
│ Lobe Core        │                         [Giao diện]                 │
│                  │                                                    │
│ + Trò chuyện mới │          Bạn muốn làm gì hôm nay?                   │
│ Tìm cuộc trò…    │                                                    │
│                  │          ┌──────────────────────────────────┐      │
│ Hôm nay          │          │ Nhắn cho trợ lý…                  │      │
│  Tóm tắt ghi chú │          │                                  │      │
│  Kiểm tra dự án  │          │ [Provider / Model ▾]         [↑]  │      │
│                  │          └──────────────────────────────────┘      │
│ 7 ngày qua       │          [Tóm tắt] [Giải thích] [Soạn nội dung]      │
│  …               │                                                    │
│                  │          Gần đây                                   │
│                  │          Tóm tắt ghi chú cuộc họp       Hôm nay     │
│                  │          Kiểm tra cấu trúc dự án        Hôm qua     │
│                  │                                                    │
│ Cài đặt          │                                                    │
└──────────────────┴────────────────────────────────────────────────────┘
```

Home max-width 960px; greeting/composer/gợi ý/gần đây cùng cột 768px, căn giữa trong home. Padding top 80px sau header; màn thấp dưới 700px dùng 32px và cho vùng home cuộn. Không ép nội dung vừa màn bằng cách giảm chữ.

- Greeting 48px desktop, 28px mobile; gap đến composer 24px.
- Composer home cao tối thiểu 144px, gồm textarea và toolbar; padding 16px, radius 24px.
- Gợi ý cách composer 16px; ba chip wrap tự nhiên, không carousel.
- Gần đây cách gợi ý 40px; tối đa ba hàng 56px, tiêu đề 16px, metadata 13px.
- Nếu không có lịch sử, bỏ vùng gần đây. Không dựng card rỗng hoặc lời giới thiệu dài.
- Gợi ý có prompt đầy đủ và chỉ điền draft, không gửi tức thì. Nhãn phổ thông ở wireframe là mẫu; với agent hiện tại có thể dùng “Liệt kê tệp”, “Đọc package.json”, “Kiểm tra Git”.

Chuyển sang active chat sau khi yêu cầu được nhận: greeting/gợi ý/gần đây biến mất, composer xuống đáy. Nếu gửi thất bại trước khi được nhận, draft vẫn ở composer.

## 3. Cuộc trò chuyện đang hoạt động

```text
┌──────────────────┬────────────────────────────────────────────────────┐
│ Lobe Core        │ Tóm tắt ghi chú cuộc họp            [Giao diện]     │
│ + Trò chuyện mới ├────────────────────────────────────────────────────┤
│ Tìm cuộc trò…    │                                                    │
│                  │                   ┌──────────────────────────┐     │
│ Hôm nay          │                   │ Tóm tắt các ý chính…      │     │
│ > Tóm tắt ghi…   │                   └──────────────────────────┘     │
│  Kiểm tra dự án  │                                                    │
│                  │          [mark] Trợ lý                             │
│                  │          Cuộc họp tập trung vào ba việc:            │
│                  │          1. Chốt phạm vi sản phẩm.                  │
│                  │          2. Phân công người phụ trách.              │
│                  │          3. Theo dõi tiến độ tuần tới.              │
│                  │          [Sao chép]                                │
│                  │                                                    │
│                  │          ▸ Đã đọc notes.md                         │
│                  │                                                    │
│                  │          ┌──────────────────────────────────┐      │
│                  │          │ Nhắn tiếp…                       │      │
│                  │          │ [Provider / Model ▾]         [↑]  │      │
│ Cài đặt          │          └──────────────────────────────────┘      │
└──────────────────┴────────────────────────────────────────────────────┘
```

Header min-height 56px; title 16px/500, truncate một dòng và có cách đọc tên đầy đủ. Chi tiết kết nối nằm trong lựa chọn model/cài đặt, không cần badge kỹ thuật thường trực.

Transcript 768px gồm cả avatar; assistant avatar 24px, gap 12px. User bubble căn phải, tối đa 80% cột; mobile 92%. Nội dung dài wrap, không cố giữ bubble trên một dòng. System message là status row riêng, không giả làm câu trả lời assistant.

Composer active min-height 112px; textarea tự tăng đến 200px rồi cuộn trong textarea. Bottom gutter 16px cộng safe-area. Vùng composer có nền canvas đặc, không overlay lên lượt trả lời cuối; dùng một hàng layout riêng dưới transcript.

## 4. Mobile

```text
┌────────────────────────────┐
│ [☰]  Tóm tắt ghi chú   [◐] │
├────────────────────────────┤
│             ┌────────────┐ │
│             │ Tóm tắt…   │ │
│             └────────────┘ │
│ Trợ lý                     │
│ Ba ý chính của cuộc họp…   │
│                            │
│ [Sao chép]                 │
│                            │
│ ┌────────────────────────┐ │
│ │ Nhắn cho trợ lý…       │ │
│ │ [Model ▾]         [↑]  │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

Ký hiệu trong wireframe là vị trí icon; implementation dùng icon hiện có. Target 44px; form input 16px. Tên model dài truncate phần trigger, nội dung select vẫn đọc đủ. Giữ model bên trái và gửi/dừng bên phải; chỉ wrap toolbar nếu zoom hoặc tên control thực sự không vừa.

Drawer mở trên canvas với backdrop, khóa tương tác phần sau, đóng bằng nút và Escape. Chọn cuộc trò chuyện đóng drawer. Focus trở về nút mở lịch sử khi đóng; mobile không autofocus textarea lúc vào màn để tránh bật bàn phím ngoài ý muốn.

Khi bàn phím xuất hiện, composer và lượt gần nhất còn tiếp cận được; kiểm tra trên trình duyệt/device thật. Tránh `100vh` cố định và bottom-position dựa vào chiều cao màn hình cũ.

## 5. Cài đặt, provider, bộ nhớ, kỹ năng và hoạt động

Trang cài đặt full-page tại `#settings/settings`, không phủ nền chat như modal.
Desktop sidebar 260px có tìm kiếm Việt/Anh và nút thu gọn; nội dung tối đa 960px,
header cố định, các card bo 12px/padding 20–24px/gap 20px trong vùng cuộn độc lập.
Dưới 768px dùng drawer điều hướng có backdrop; nội dung một cột, không tràn ngang ở 360px.

Các mục đang hoạt động: Giao diện, Nhà cung cấp AI, Bộ nhớ, Kỹ năng Agent, Timeline,
Thống kê. `SettingsPage` giữ các hash hiện có và back/forward. Workspace chat vẫn
mounted nhưng hidden/inert; quay lại trả focus về nút mở, giữ draft/run/SSE.
Nút dừng tác vụ tiếp cận được cả khi drawer mobile đang mở.

Giao diện gồm bảy card: cài đặt chung, palette ứng dụng, font, transition, hành vi chat,
code theme và Mermaid. Tùy chỉnh có hiệu lực thật và trạng thái lưu local trung thực;
provider-add là form inline, không thêm overlay che nút dừng.

Provider form có nhãn nhìn thấy: “Loại kết nối”, “Tên kết nối”, “Địa chỉ máy chủ”, “Khóa API”. Input 16px, cao ít nhất 44px; key là password. “Kiểm tra kết nối” và “Lưu” là hai thao tác rõ ràng. Kết quả test có chữ, thời gian và lỗi có thể xử lý; không hiển thị key.

Bộ nhớ là danh sách có search, category, nội dung và thao tác xóa rõ đối tượng. Kỹ năng là danh sách mô tả/công cụ cần dùng; không tự thêm toggle enable nếu API chưa hỗ trợ. Hoạt động là timeline đóng/mở chi tiết, không mở rộng mọi payload mặc định.

## 6. Cấp quyền cho agent

```text
┌────────────────────────────────────────────────────┐
│ Cần bạn cho phép                                [×]│
│ Trợ lý muốn ghi thay đổi vào tệp.                   │
│                                                    │
│ Tệp đích                                           │
│ /workspace/notes.md                                │
│ Tác động: nội dung tệp có thể bị thay đổi.           │
│ ▸ Xem tham số / nội dung được yêu cầu               │
│                                                    │
│ [Từ chối]                      [Cho phép một lần]   │
│ Tùy chọn khác: Luôn cho phép phạm vi này            │
└────────────────────────────────────────────────────┘
```

Max-width 560px, radius 24px, padding 24px; mobile margin 16px, action wrap hoặc stack. Target và command được chọn/copy, không truncate mất phần quan trọng. Nội dung dài cuộn trong vùng body, footer action luôn thấy.

Một request chỉ có một bộ action ở dialog. Transcript hiển thị “Chờ bạn cấp quyền” và nút mở lại dialog; không lặp nút Allow/Deny ở hai nơi. Đóng bằng ×/Escape chỉ ẩn dialog, request vẫn pending và agent chưa được phép chạy. Dừng tác vụ cũng tiếp cận được trong dialog pending.

“Cho phép một lần” là hành động chính. “Luôn cho phép” mở bước xác nhận phạm vi cụ thể; không cấp quyền bằng Enter ngoài ý muốn. Chi tiết hành vi và lỗi trong COMPONENTS-UX.md.
