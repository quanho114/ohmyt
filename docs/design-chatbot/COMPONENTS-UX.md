# COMPONENTS & UX — Hành vi để build

Tài liệu này mô tả trạng thái đích. Tận dụng component/API hiện có; những hành vi bổ sung phải được triển khai và kiểm chứng trước khi coi là hoàn thành.

## 1. Sidebar và lịch sử

Sidebar thứ tự: brand nhỏ → Trò chuyện mới → Tìm cuộc trò chuyện → lịch sử → Cài đặt. Không đưa số tools, SQLite hoặc engine vào footer người dùng; chúng thuộc cài đặt.

Nhóm lịch sử theo ngày địa phương của người dùng: Hôm nay, Hôm qua, 7 ngày qua, Cũ hơn. Phiên mới nhất trước; không dùng ngày UTC để phân nhóm. Search hiện tại lọc theo tiêu đề, vì vậy copy không hứa tìm toàn bộ nội dung.

Selected row nền Ash, weight 500 và `aria-current="page"`. Menu/xóa xuất hiện khi hover, keyboard focus và luôn tiếp cận trên touch. Nút xóa là control riêng, không lồng trong nút chọn phiên.

| Trạng thái | Hiển thị / hành vi |
|---|---|
| Loading | Skeleton cho vài hàng; không báo “Chưa có” trước khi tải xong |
| Không có lịch sử | “Chưa có cuộc trò chuyện. Bắt đầu bằng một tin nhắn.” |
| Search không khớp | “Không tìm thấy cuộc trò chuyện.” và nút xóa query |
| Tải thất bại | “Chưa tải được lịch sử.” + Thử tải lại |
| Xóa | Dialog ghi tên cuộc trò chuyện; nếu API không undo thì nói rõ không khôi phục |
| Xóa thất bại | Giữ hàng/dữ liệu, báo lỗi ngay cạnh hoặc trong dialog |

Đổi tên/ghim chỉ xuất hiện khi đã có cơ chế lưu thật. “Trò chuyện mới” mở draft trống; nếu gửi/agent còn đang chạy, áp dụng luồng chuyển phiên ở mục 7.

## 2. Composer

Textarea có accessible label “Tin nhắn”, placeholder không thay cho label. Toolbar: model picker bên trái, gửi/dừng bên phải. Text helper về provider là ngắn và đúng thực tế; không gắn “Memory active” khi chưa biết bộ nhớ đã sẵn sàng.

| State | Nội dung | Primary action |
|---|---|---|
| Empty | Placeholder; textarea nhập được | Gửi disabled |
| Draft | Giữ nguyên xuống dòng, không trim nội dung hiển thị | Gửi enabled nếu có ký tự khác whitespace |
| Submitting | “Đang gửi…”; chặn gửi lặp | Disabled cho đến có run hoặc lỗi |
| Streaming / tool running | Cho sửa draft cho lượt tiếp theo | Dừng, không gửi lượt song song |
| Waiting approval | Draft vẫn sửa được | Dừng + mở request quyền |
| Send failed trước khi nhận | Giữ/khôi phục draft; “Chưa gửi được tin nhắn.” | Thử gửi lại do người dùng bấm |
| Aborting | “Đang dừng…” | Chặn click dừng lặp |
| Aborted | Giữ nội dung đã có, status “Đã dừng” | Gửi khi backend xác nhận kết thúc |

Chỉ xóa draft đã gửi khi backend nhận yêu cầu. Nếu người dùng đang nhập draft mới trong lúc gửi, không để phản hồi async xóa draft mới. Draft được giữ riêng theo phiên trong phiên sử dụng ứng dụng; lưu bền qua restart không thuộc yêu cầu mặc định.

Desktop Enter gửi, Shift+Enter xuống dòng. Không gửi khi `isComposing` hoặc IME đang hoàn tất chữ. Mobile Enter xuống dòng, nút gửi thực hiện gửi. Không chặn paste nhiều dòng. Một lượt gửi không được tự lặp khi network timeout chưa rõ backend đã nhận hay chưa.

Không hiện attach/voice/search toggle chỉ vì ảnh tham chiếu có. Chỉ thêm control khi khả năng thật được hỗ trợ và có trạng thái lỗi tương ứng.

## 3. Model picker và kết nối

Giữ `<select>` native của ModelPicker. Nhóm “Trên máy”, “Trực tuyến”, “Tùy chỉnh”; option hiển thị provider / model, không chỉ tên model. Các model disabled không chọn được.

| Trạng thái | Cách xử lý |
|---|---|
| Đang tải | “Đang tải model…”; không nhảy về một tên giả |
| Có model | Hiển thị model hiệu lực cho phiên hiện tại |
| Chưa cấu hình | “Chưa có model” + action mở Model & kết nối |
| Provider lỗi | Báo kết nối chưa sẵn sàng; không âm thầm đổi sang dịch vụ khác |
| Đổi model | Giữ lựa chọn cũ đến khi lưu thành công; lỗi thì báo và phục hồi |
| Đang chạy | Không đổi model của run hiện tại; disable picker với giải thích ngắn |

Nếu hệ thống có fallback engine thực sự hoạt động, cho biết rõ “Chế độ dự phòng” và giới hạn; không giả hiển thị model AI được chọn. Khi mở lại một phiên, tải model hiệu lực của phiên đó; không giữ override từ phiên trước.

Provider trực tuyến cần helper “Tin nhắn sẽ được gửi tới kết nối này.” Local chỉ dùng “Chạy trên máy” khi endpoint thực sự local; type tùy chỉnh tự nó không chứng minh dữ liệu ở local.

## 4. Message, code và tool call

User: bubble Ash, căn phải, không avatar bắt buộc. Assistant: tên/mark nhỏ, nội dung trên canvas, action phía dưới. Timestamp 13px Graphite, không nhấn mạnh. Cho chọn/copy văn bản, kể cả target trong quyền.

Markdown: đoạn, heading, list, bold, inline code và fenced code theo khả năng renderer. Table/Math/citation chỉ xuất hiện với renderer hỗ trợ thật; không hứa render hoàn chỉnh từ parser hiện tại. Dùng heading/list semantic, không chỉ style `<div>` để giống chúng.

Code block dùng nền Ash, radius 6px, border hairline, monospace 14px; preserve whitespace, cuộn ngang bên trong. Header có ngôn ngữ và Sao chép. Copy thành công đổi thành “Đã sao chép” trong 2 giây; nếu clipboard lỗi thì hiện “Chưa sao chép được” và giữ nội dung có thể chọn thủ công.

Link nội dung có underline, label có nghĩa; link mở tab mới có thông báo phù hợp. Không render raw HTML từ model, không cho URL thực thi script. Luôn phân biệt nội dung model với control thực hiện hành động.

Tool card mặc định đóng: icon chức năng + hành động + trạng thái + thời gian nếu đã biết. `fs_read` có thể hiện “Đọc tệp”; tên kỹ thuật còn trong chi tiết.

| Tool state | Nhãn | Chi tiết |
|---|---|---|
| running | “Đang thực hiện…” | Input đã biết; chưa có output thì không giả success |
| completed | “Hoàn tất” | Input/output, duration nếu backend cung cấp |
| blocked | “Không được phép thực hiện” | Lý do nếu có; không coi là network error |
| error | “Thực hiện thất bại” | Lỗi thực tế, không tự chạy lại thao tác ghi |

Toggle có `aria-expanded`, mở được bằng keyboard. Output dài giới hạn vùng cuộn hoặc mở “Xem đầy đủ”; không cắt dữ liệu âm thầm. Luồng hoạt động không gọi summary là “toàn bộ suy nghĩ” của model.

## 5. Quyền và hành động nhạy cảm

Dialog quyền thể hiện: hành động, target/command chính xác, ảnh hưởng, tham số, phạm vi quyết định. Copy giải thích dễ hiểu trước, thông tin kỹ thuật sau. Risk/policy lấy từ backend; regex frontend chỉ là hỗ trợ hiển thị và không được xác nhận một lệnh là an toàn.

| Thao tác | Hành vi |
|---|---|
| Từ chối | Gửi DENY; chờ backend xác nhận trước khi chuyển trạng thái |
| Cho phép một lần | Gửi ALLOW_ONCE cho đúng request; không ảnh hưởng các request khác |
| Luôn cho phép | Hiển thị phạm vi policy cụ thể và xác nhận bổ sung; không preselect |
| Không có scope tin cậy | Không bật “Luôn cho phép”; giải thích bằng chữ |
| Đang phản hồi | Disable các action quyết định, status “Đang gửi quyết định…” |
| Phản hồi lỗi | Giữ request, báo “Chưa gửi được quyết định. Agent vẫn đang chờ.” |
| × / Escape | Ẩn dialog; vẫn có request row trong chat để mở lại |
| Dừng tác vụ | Yêu cầu abort; chỉ xóa request khi backend xác nhận hoặc request hết hiệu lực |

Focus ban đầu ở tiêu đề hoặc “Từ chối”, không ở nút cấp quyền. Focus được giữ trong dialog; nền inert. Một request đã kết thúc không được quyết định lại bằng UI cũ. Nếu nhiều request, trình bày từng request theo ID, không ghi đè âm thầm.

Ảnh LobeHub không thay thế yêu cầu kiểm soát agent trong repo. Tối giản chrome nhưng giữ rõ cấp quyền và dừng.

## 6. Streaming, cuộn và phục hồi lỗi

Khi người dùng gửi, đưa lượt mới vào vùng đọc và theo nội dung nếu họ đang ở cuối. Khi họ cuộn lên, ngừng kéo xuống; hiện “Về tin nhắn mới” khi có nội dung phía dưới. Ngưỡng bám cuối đề xuất 80px; không smooth-scroll trên từng token.

Mất SSE: hiện “Mất kết nối cập nhật. Tác vụ có thể vẫn đang chạy.” Không suy ra run đã kết thúc. Làm mới trạng thái/lịch sử theo API sẵn có trước khi cho retry. Dừng thất bại cũng không ghi “Đã dừng”.

RunFailed giữ phần trả lời đã nhận, hiển thị lỗi và bước tiếp theo. Không tự retry tool có side effect. Nếu chưa có API resume/idempotency, chỉ cho gửi yêu cầu mới sau khi đã xác định run cũ kết thúc và nói rõ nó sẽ tạo lượt mới.

Status live region chỉ thông báo thay đổi quan trọng như bắt đầu, chờ quyền, hoàn tất và lỗi. Không đọc lại cả câu trả lời mỗi token bằng screen reader.

## 7. Chuyển phiên và thao tác quản lý

Nếu không có run hoạt động, chuyển phiên ngay và giữ draft riêng. Nếu có run và backend/UI chưa hỗ trợ theo dõi nhiều run, dialog ghi “Tác vụ đang chạy trong cuộc trò chuyện này.” với “Ở lại” và “Dừng rồi chuyển”. Chỉ chuyển sau khi abort được xác nhận; nếu abort lỗi, ở lại và hiển thị lỗi.

Áp dụng cùng quy tắc cho Trò chuyện mới và xóa phiên đang chạy. Không tạo session mới rồi để run/permission cũ gắn sai vào màn mới. Backend hỗ trợ chạy nền và tracking theo session mới là điều kiện để bỏ bước dừng khi chuyển.

Xóa provider và ký ức cần nêu rõ đối tượng; API lỗi thì dữ liệu vẫn còn trong UI. Provider form giữ field khi lưu thất bại, báo lỗi sát field; thay key bằng password, không đưa key vào timeline hoặc toast.

## 8. Accessibility và responsive

- Normal text tối thiểu 4.5:1; icon/boundary chức năng tối thiểu 3:1 với màu kề. Border trang trí có thể nhẹ; placeholder vẫn là text cần đủ tương phản. Theo [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) và [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- Mục tiêu thiết kế: hit target 44×44px; icon có accessible name; không dùng tooltip làm tên duy nhất.
- Tab order theo luồng đọc; drawer/dialog trap focus, đóng trả focus đúng trigger. Không dùng phím shortcut toàn cục nếu chưa có nhu cầu.
- Actions xuất hiện với focus và touch, không chỉ hover. Disabled có lý do dễ tìm.
- Text zoom 200% không mất nút gửi/dừng; reflow ở 320px không cuộn ngang toàn app. Code/table được cuộn riêng.
- Reduced motion bỏ pulse/slide/smooth scroll; active state vẫn nhận biết bằng chữ và hình dạng.

## 9. Checklist nghiệm thu

Các check này dành cho bản implementation tương lai, không phải báo cáo rằng app hiện tại đã pass.

- [ ] Home 1440×900: composer dễ thấy; sidebar 260px; heading/gợi ý không lấn vùng nhập.
- [ ] Desktop 1024×768 và mobile 390×844: đọc được lịch sử, không chồng composer lên tin nhắn.
- [ ] 320px/zoom 200%: target chính còn thấy; code và đường dẫn dài không làm tràn viewport.
- [ ] Light/dark/system: text, placeholder, focus và user bubble đúng semantic; không còn CTA xanh ngoài trạng thái được chỉ định.
- [ ] Tin trống/whitespace không gửi; Shift+Enter và IME không gửi nhầm; double-click tạo tối đa một request.
- [ ] Gửi lỗi giữ draft; SSE lỗi không giả đã dừng; stop lỗi không mở gửi song song.
- [ ] Cuộn lên khi streaming không bị kéo xuống; nút về cuối hoạt động.
- [ ] Chuyển phiên giữ đúng draft/model; run và quyền không xuất hiện nhầm phiên.
- [ ] Dialog quyền chỉ có một nơi quyết định; Escape không auto-allow; lỗi phản hồi giữ pending.
- [ ] “Luôn cho phép” có scope rõ và bước xác nhận; quyền do backend kiểm soát.
- [ ] Copy lỗi có phản hồi; code giữ whitespace; URL và nội dung model không thực thi script.
- [ ] Form provider báo loading/success/error, không lộ key, không xóa field khi lưu lỗi.
- [ ] Tất cả thao tác chính dùng được bằng Tab/Enter/Escape và touch; screen reader không đọc từng token.
