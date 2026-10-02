# Trang Giao diện theo LobeHub cho ohmyt

## 1. Mục tiêu và phạm vi đã duyệt

Người dùng chọn **Trang Giao diện đầy đủ**, không thay toàn bộ UX/UI app. Thiết kế trong chat được duyệt bằng câu “duyệt”. Tham chiếu: ảnh 1–5 là các vị trí cuộn của trang LobeHub `/settings/appearance`; ảnh 6 là modal hiện tại của ohmyt.

Kết quả cần đạt: thay modal cài đặt nhỏ bằng trang cài đặt có bố cục và tương tác sát mẫu, bổ sung đầy đủ các nhóm tùy chỉnh xuất hiện trong ảnh. Mọi điều khiển phải áp dụng thật, không chỉ đổi preview. Thay đổi áp dụng ngay, được lưu trên thiết bị và giữ sau tải lại.

Giữ thương hiệu ohmyt, backend local-first, dữ liệu phiên, provider/model, bộ nhớ, kỹ năng, timeline, streaming, phê duyệt quyền và dừng tác vụ. Không sao chép tên người dùng, tài khoản, gói đăng ký, thanh toán, nút nâng cấp hoặc trạng thái đồng bộ cloud của LobeHub. Không dựng menu dẫn tới trang chưa tồn tại.

## 2. Phương án và quyết định

- Mở rộng modal hiện tại: ít đổi bố cục nhưng không đạt trải nghiệm trang dài trong mẫu.
- **Trang cài đặt riêng trong app: chọn.** Tái sử dụng các mục cài đặt và engine hiện có; thay lớp trình bày và nối các tùy chỉnh vào các consumer thật.
- Thay toàn bộ UI bằng thư viện LobeHub: không chọn; vượt phạm vi và tăng phụ thuộc không cần thiết.

Dùng React, TypeScript, CSS/Tailwind và lucide-react đã có. Dùng điều khiển HTML native cho select, range và radio khi đáp ứng trải nghiệm. Chỉ bổ sung thư viện chuyên dụng cho syntax highlighting và Mermaid, vì renderer hiện tại không có hai khả năng này; không tự viết parser ngôn ngữ lập trình hoặc parser Mermaid. Không thêm UI framework, state framework hay dịch vụ cloud.

## 3. Bố cục và điều hướng

### Desktop

- Trang cài đặt chiếm không gian ứng dụng, không có nền chat tối đi như modal hiện tại.
- Sidebar rộng khoảng 260 px; đầu sidebar có quay lại chat, tiêu đề Cài đặt và nút thu gọn.
- Ô tìm kiếm lọc các mục điều hướng hiện có theo nhãn Việt/Anh, không phân biệt hoa thường và dấu tiếng Việt. Khi không khớp có thông báo rõ; không tự chuyển trang hay bỏ thay đổi.
- Các nhóm: Cá nhân với Giao diện; Mô hình & Engine với Nhà cung cấp AI, Bộ nhớ, Kỹ năng Agent, Timeline. Chỉ giữ mục thực sự hoạt động.
- Vùng nội dung có tiêu đề Giao diện cố định, nội dung cuộn độc lập và các thẻ căn giữa, rộng tối đa khoảng 960 px.
- Thẻ nền trắng trong light mode, viền xám mảnh, bo góc khoảng 12 px, padding 20–24 px, khoảng cách giữa thẻ khoảng 20 px. Dark mode dùng cùng phân cấp bề mặt và độ tương phản, không đảo màu máy móc.
- Các hàng có nhãn/mô tả bên trái và điều khiển bên phải; preview nằm dưới hàng liên quan.
- Trạng thái lưu ghi “Đã lưu trên thiết bị”, không dùng “Đã tải phiên bản mới nhất” hay biểu tượng ngụ ý đồng bộ cloud.

### Mobile và bàn phím

- Dưới 768 px, sidebar thu gọn thành điều hướng có thể mở bằng nút; các hàng chuyển thành một cột, palette và segmented control tự xuống hàng.
- Không có cuộn ngang toàn trang tại chiều rộng 360 px. Preview code/diagram được phép cuộn ngang bên trong.
- Nút quay lại và Escape trở về chat. Khi menu hoặc select đang mở, Escape đóng lớp đó trước, không thoát cả trang.
- Có focus rõ, nhãn cho điều khiển, trạng thái selected/checked đọc được bằng screen reader và thao tác bàn phím theo chuẩn native. Sau quay lại chat, focus về nút mở cài đặt nếu còn tồn tại.

### Tích hợp app

Giữ địa chỉ `#settings/settings` và các hash của providers/memory/skills/timeline hiện có; không tạo hệ routing thứ hai. Điều hướng back/forward và mở trực tiếp hash phải hoạt động. Mở cài đặt không hủy run, ngắt SSE, xóa nội dung nhập hay mất trạng thái chat. Các chức năng cài đặt hiện có tiếp tục hoạt động. Khi run đang chạy, vẫn có nút Dừng tác vụ truy cập được từ trang cài đặt.

## 4. Cài đặt chung

### Chủ đề

Ba thumbnail Sáng, Tối, Tự động; lựa chọn hiện tại có viền và dấu chọn. Tự động theo `prefers-color-scheme` và phản ứng với thay đổi hệ thống. Giữ lựa chọn theme đã lưu của người dùng; không reset khi bổ sung các tùy chỉnh mới. Nút đổi theme nhanh hiện có phải cập nhật cùng nguồn trạng thái với trang này.

### Ngôn ngữ giao diện

Select: Theo hệ thống, Tiếng Việt, English. Theo hệ thống chọn tiếng Việt khi ngôn ngữ trình duyệt bắt đầu bằng `vi`, còn lại chọn English. Áp dụng cho trang cài đặt, điều hướng và các section hiện có trong trang đó; không dịch lại lịch sử chat, tên model/provider, dữ liệu người dùng hay đầu ra công cụ. Không mở rộng thành redesign toàn bộ app.

### Hoạt ảnh phản hồi

Segmented control: Tắt, Nhanh nhẹn, Thanh lịch. Nội dung streaming vẫn hiện đầy đủ ngay khi nhận; khác biệt nằm ở hiệu ứng xuất hiện/cursor, không trì hoãn token hay tạo hàng đợi typewriter. Tắt loại bỏ hiệu ứng phản hồi. Khi hệ thống yêu cầu giảm chuyển động, hiệu ứng phải tắt bất kể lựa chọn đã lưu.

### Menu chuột phải

Segmented control: Tắt, Mặc định. Tắt giữ menu trình duyệt. Mặc định bật menu của app trong vùng tin nhắn với Sao chép phần đang chọn hoặc Sao chép tin nhắn khi không chọn chữ. Không chặn menu native của input, textarea, liên kết hoặc code/diagram có điều khiển riêng. Menu đóng khi chọn hành động, click ngoài hoặc Escape và không tràn viewport.

### Ngôn ngữ phản hồi AI

Select: Tự động, Tiếng Việt, English. Tự động không thêm chỉ dẫn ngôn ngữ; các lựa chọn còn lại gửi mã ngôn ngữ cùng yêu cầu run và thêm chỉ dẫn vào system context, không sửa prompt người dùng đã lưu. Backend chấp nhận thiếu trường để giữ các caller hiện có; trường có giá trị sai bị từ chối tại API boundary. Không đổi model, công cụ hoặc quyền chạy. Model có thể không tuân thủ tuyệt đối; UI không hứa ép dịch đầu ra hay ngụ ý rằng đầu ra công cụ được dịch. Lựa chọn áp dụng từ run tiếp theo, không thay run đang chạy.

## 5. Giao diện ứng dụng

- Preview sơ đồ bố cục chat, dùng đúng màu theme/accent/neutral đang chọn; không phải screenshot cố định.
- Màu chủ đề: mặc định trung tính và các swatch đỏ, cam, vàng, lime, xanh lá, cyan, xanh da trời, xanh dương, tím, magenta, coral. Swatch có tên và dấu chọn, không chỉ phân biệt bằng màu.
- Màu trung tính: mặc định, slate, gray, zinc, neutral, stone. Áp dụng cho nền, sidebar, thẻ, viền và chữ cả light/dark.
- Accent áp dụng vào trạng thái lựa chọn, focus, link và điều khiển chính; không thay màu cảnh báo, lỗi hay thành công mang ý nghĩa riêng.
- Màu mặc định giữ tính tối giản gần ảnh mẫu. Văn bản và focus phải có tương phản đọc được ở mọi palette cung cấp.

## 6. Phông chữ

- Font Antialiasing: toggle grayscale font smoothing. Mô tả rõ chỉ có tác dụng trên macOS; trên Windows không hứa có khác biệt thị giác. Không đổi font hệ thống hay tải font bên ngoài.
- Cỡ chữ tin nhắn: slider 12–20 px, bước 1 px, chuẩn 14 px. Có giá trị hiện tại, nhãn nhỏ/lớn và preview câu chào. Áp dụng cho nội dung tin nhắn, gồm inline code, danh sách và tiêu đề theo tỷ lệ; không phóng to toàn bộ điều hướng.
- Giá trị ngoài phạm vi trong dữ liệu local phải được chuẩn hóa về phạm vi hợp lệ.

## 7. Hoạt ảnh chuyển tiếp

Segmented control: Không có, Hiện dần, Mượt mà; preview có tiêu đề và danh sách như ảnh mẫu. Không có bỏ animation; Hiện dần dùng opacity; Mượt mà dùng opacity và dịch chuyển nhẹ. Áp dụng cho chuyển section cài đặt và xuất hiện tin nhắn mới, không animate lại toàn bộ lịch sử khi mỗi token tới. `prefers-reduced-motion` luôn ưu tiên hơn hiệu ứng đã chọn. Hiệu ứng chuyển tiếp không điều khiển tốc độ nhận dữ liệu từ AI.

## 8. Hành vi trò chuyện

- Tự động cuộn khi AI phản hồi: mặc định bật. Tắt không ép cuộn theo streaming/tool events; bật chỉ bám đáy khi người dùng đang ở gần đáy, không giật người dùng đang đọc lịch sử xuống. Chuyển phiên vẫn đưa tới vị trí phù hợp của phiên; cuộn do người dùng điều khiển không bị vô hiệu.
- Mở rộng bước công cụ đang chạy: mặc định tắt. Bật tự mở chi tiết công cụ khi chuyển sang running; trạng thái đóng/mở người dùng chủ động chọn không bị ghi đè ở mỗi render/token. Không sửa hay che kết quả/lỗi công cụ.
- Hiển thị biểu tượng trong liên kết tin nhắn: mặc định bật. Render biểu tượng link/repository phù hợp và preview liên kết LobeHub/GitHub; dùng icon local, không request favicon tới bên thứ ba. Tắt bỏ icon, vẫn giữ link và text. Chỉ chấp nhận URL http/https, giữ `noopener noreferrer` khi mở tab mới.

## 9. Chủ đề tô sáng mã

Select: Lobe Theme, GitHub, Nord. Lobe Theme là palette gần ảnh mẫu và theo light/dark; GitHub cũng theo light/dark; Nord là palette tối. Preview TypeScript có tô màu token thật, dùng cùng renderer với fenced code trong chat. Ngôn ngữ không hỗ trợ hiển thị plain text an toàn; không cố đoán bằng parser tự viết. Giữ khả năng sao chép nguyên văn và giữ khoảng trắng. Lựa chọn theme áp dụng vào lịch sử đã có, không rewrite dữ liệu trong SQLite.

## 10. Chủ đề Mermaid

Section có thể thu gọn, select gồm Lobe Theme, Default, Neutral, Forest, Dark. Lobe Theme lấy màu theme/accent/neutral hiện tại; các lựa chọn còn lại dùng theme tương ứng của Mermaid. Preview sequence diagram Alice/John như ảnh mẫu, được render thật.

Fenced block `mermaid` trong chat dùng cùng renderer và theme. Dùng chế độ bảo mật strict, không cho nội dung tin nhắn bật HTML tùy ý, script, điều hướng callback hoặc external resource. Trong khi streaming, block chưa hoàn chỉnh hiển thị nguồn; sau hoàn chỉnh mới render. Diagram không hợp lệ có thông báo lỗi ngắn và nguồn để đọc/sao chép, không làm crash chat. Đổi theme vẽ lại diagram hoàn chỉnh; async render cũ không được ghi đè kết quả mới. Không đưa SVG chưa được xử lý an toàn trực tiếp từ nội dung tin nhắn vào DOM.

## 11. Trạng thái và lưu trữ

- Một nguồn trạng thái appearance ở cấp app; các section settings, chat, code và diagram dùng cùng giá trị. Không tạo bản sao cài đặt độc lập ở từng component.
- Mở rộng cơ chế theme hiện có và giữ tương thích dữ liệu theme đã lưu. Các lựa chọn khác lưu trong một object localStorage có giá trị mặc định rõ ràng; không lưu secrets ở đây.
- Mặc định: theme kế thừa hiện tại hoặc system; locale system; response animation snappy; context menu default; response language auto; accent/neutral mặc định; antialiasing bật; font 14; transition fade; auto-scroll bật; auto-expand tools tắt; link icons bật; code/mermaid Lobe Theme.
- Lưu sau thay đổi; F5 phải khôi phục toàn bộ lựa chọn. Giá trị JSON hỏng hoặc enum không hợp lệ dùng mặc định từng field, không crash app hay reset field còn hợp lệ.
- Khi localStorage không ghi được, tùy chỉnh vẫn áp dụng cho phiên hiện tại; trạng thái báo “Chưa lưu được trên thiết bị”, không báo đã lưu sai sự thật.
- Theme và palette được áp dụng sớm lúc bootstrap để tránh flash sai theme. Không thêm persistence backend hoặc đồng bộ giữa thiết bị.

## 12. Bề mặt code dự kiến

- `src/App.tsx`: nguồn appearance, trang cài đặt và truyền cấu hình cho consumer; giữ nguyên vòng đời run/SSE và trạng thái phiên.
- `src/components/SettingsDialog.tsx`: thay phần trình bày modal bằng trang cài đặt, tái sử dụng logic providers/memory/skills/timeline. Tên file/component có thể đổi khi cutover và phải cập nhật mọi import/caller; không giữ wrapper modal cũ để tương thích giả.
- `src/useTheme.ts`, `src/index.css`, `index.html`: persistence, theme bootstrap, CSS variables, palette, typography, animation và responsive layout.
- `src/components/ChatStage.tsx`, `ChatMessage.tsx`, `ToolCallCard.tsx`: auto-scroll, render response, context menu, liên kết, font, mở tool và renderer code/Mermaid dùng chung với preview.
- `src/api.ts`, `server/api.js`, `server/agent_loop.js`: thêm ngôn ngữ phản hồi theo run và validation; không thay schema SQLite hay provider contract.
- `package.json` và lockfile: chỉ các dependency cần cho syntax highlighting/Mermaid.
- Tests hiện có và README/design docs: cập nhật hợp đồng cài đặt mới và cách sử dụng. Không tạo framework hoặc test chỉ kiểm tra wording/source text.

Danh sách này xác định bề mặt thay đổi, không phải yêu cầu phải tạo một file cho mỗi nhóm điều khiển. Ưu tiên ít file, helper render dùng chung và không abstraction một implementation.

## 13. Tiêu chí nghiệm thu và kiểm chứng

1. Tại `#settings/settings`, trang cài đặt full-page có sidebar/search, title cố định, các thẻ theo đúng thứ tự ảnh 1–5; light/dark/mobile không đè layout.
2. Các section hiện có truy cập được; quay lại chat/back/forward/direct hash hoạt động; mở trang trong lúc streaming không làm mất run, text input hoặc session.
3. Chọn light/dark/system và đổi theme hệ thống cập nhật app thật. Palette/neutral cập nhật cả app và preview; lựa chọn giữ sau F5.
4. Locale cập nhật trang cài đặt thật; ngôn ngữ phản hồi đến system context của run tiếp theo, prompt lưu nguyên văn; ngôn ngữ sai bị API từ chối. Smoke dùng model/provider thực nếu có kết nối; nếu không có, kiểm tra request/context và báo giới hạn quan sát output model.
5. Font slider đổi cỡ tin nhắn đang có, không chỉ preview. Antialiasing được kiểm tra thuộc tính áp dụng; trên Windows báo giới hạn quan sát macOS.
6. Response/transition modes khác biệt trên surface thật, chế độ reduced-motion tắt hiệu ứng và không mất token.
7. Auto-scroll tắt giữ vị trí khi token tới; bật bám đáy đúng và không kéo khi đang đọc phía trên. Auto-expand phản ứng với running và không ghi đè lựa chọn thủ công.
8. Link icons và context menu hoạt động đúng phạm vi; copy trả lại nội dung thật, input/menu native không bị chặn.
9. Code theme và Mermaid theme đổi preview và tin nhắn thật. Thử code không hỗ trợ, Mermaid hợp lệ/không hợp lệ, block đang streaming và nội dung nguy hiểm để kiểm tra fallback/bảo mật.
10. Thử reload, localStorage hỏng và lỗi ghi storage; UI không crash hay báo lưu sai.
11. Smoke trên trình duyệt ở desktop và 360 px, quan sát thực tế và lấy bằng chứng hình ảnh. Chạy build/type-check phù hợp repo và các kiểm tra hành vi liên quan sau tích hợp; không coi build hoặc snapshot/source-text assertions là bằng chứng UI.
12. Giữ kiểm tra hồi quy nhỏ cho những biên hành vi dễ hỏng (storage normalization, scroll transitions, response-language validation hoặc unsafe rendering), theo convention repo; không thêm test chỉ lặp lại wiring/default/nhãn.

## 14. Ngoài phạm vi

Không thay toàn bộ chat/sidebar theo LobeHub, không thêm billing/account/subscription, cloud sync, analytics, notification/device management, connectors, prompt marketplace hoặc model routing mới. Không thay engine offline, quyền công cụ, database schema hay model selection vì lý do trang trí. Không cam kết pixel-perfect ở browser/OS khác nhau; mục tiêu là sát bố cục, phân cấp thị giác và tương tác trong ảnh mẫu, không sao chép browser chrome.

## 15. Trạng thái duyệt

Thiết kế trong chat và bản spec này đã được người dùng duyệt (câu trả lời “duyệt spec”). Chưa có thay đổi code sản phẩm; kế hoạch triển khai được viết từ bản spec đã duyệt và cần được review/chọn cách thực thi trước khi bắt đầu.
