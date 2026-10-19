# Biển đảo tí hon — thiết kế trải nghiệm cho ohmyt

Trạng thái: đề xuất để người dùng duyệt, chưa triển khai.
Ngày: 2026-10-19.

## 1. Mục tiêu và nguyên tắc

Một vùng biển pixel có đời sống riêng trên trang chủ: thuyền đi qua đảo, chim bay,
cá mập lượn, khủng long xuất hiện trong rừng và bạch tuộc tò mò với kho báu.
Cảm giác mong muốn là khám phá, tinh nghịch và thư giãn. Trải nghiệm lấy cảm hứng
phiêu lưu biển đảo; thế giới, nhân vật, tên gọi và hình ảnh là thiết kế riêng.

Chat vẫn là tác vụ chính. Không yêu cầu người dùng chơi, không có nhiệm vụ hằng
ngày, streak, thông báo thúc giục, mua vật phẩm hoặc cơ chế mất tiến độ. Không dùng
model/token, mạng hay công cụ agent để vận hành game.

Giả định thiết kế: nhìn từ trên xuống hơi nghiêng, pixel art màu dịu, mặc định chế
độ nền; âm thanh không có trong bản đầu. Tính năng xuất hiện ở Home hiện tại, chưa
xuất hiện trong chat đã có tin nhắn hoặc trang cài đặt.

## 2. Ba hướng và lựa chọn

| Hướng | Điểm mạnh | Đánh đổi |
|---|---|---|
| Cảnh biển tự chạy | Nhẹ, ít chiếm dụng, dễ hoàn thiện hình ảnh | Tương tác hạn chế |
| Cảnh nền + Ra khơi | Vừa để ngắm vừa chơi nhanh, phù hợp tinh thần Monocode | Cần xử lý focus, camera và lưu tiến độ |
| Game khám phá toàn diện | Có nhiều mục tiêu và hệ thống nâng cấp | Lấn át sản phẩm chat, thời gian và tài sản đồ họa lớn |

Chọn **cảnh nền + Ra khơi**. Bản đầu chỉ một vòng chơi khám phá; hệ thống chiến đấu,
cốt truyện, đóng tàu, thời tiết phức tạp và multiplayer nằm ngoài phạm vi.

## 3. Bố cục trong ohmyt

### Chế độ nền

- Một dải biển cao 180–220px ở đỉnh vùng nội dung Home, phủ hết chiều ngang vùng
  chat, không phủ sidebar hay thanh cửa sổ.
- Phía dưới dùng mask mờ dần 64–80px vào màu nền hiện tại, không có viền card.
- Thuyền và đảo chính nằm trong phần trên; không có sinh vật đi qua ô nhập.
- Nội dung Home vẫn nằm trên lớp riêng. Cần điều chỉnh khoảng đầu Home để không
  đè lên cảnh biển; tránh thêm 220px khoảng trống cứng trên màn hình thấp.
- Điều khiển DOM ở góc trên phải: icon la bàn + “Ra khơi”, nút tạm dừng. Luôn có
  thể thấy và dùng bằng bàn phím; hover chỉ tăng độ rõ, không phải điều kiện sử dụng.
- Cảnh tự chạy có màu dịu nhưng sinh vật vẫn nhận diện được. Chỉ mask vùng rìa,
  không giảm opacity cả cảnh tới mức cá mập/chim mất hình.
- Với chiều cao cửa sổ dưới 700px: dải biển thu về 120px. Với chiều rộng dưới
  600px: ưu tiên cảnh nền cao 110–130px; chưa cung cấp chế độ lái ở bản đầu.

### Chế độ Ra khơi

Mở lớp chơi ngay trong vùng nội dung chính, không toàn màn hình hệ điều hành.
Giữ sidebar và thanh cửa sổ; ẩn nội dung Home bên dưới khỏi tương tác/focus.
Khung chơi có tiêu đề ngắn, hướng dẫn và nút “Về chat” luôn hiển thị.
Khi thoát, giữ nguyên bản nháp composer, vị trí cuộn và focus vào nút Ra khơi.
Không tạo chat, tin nhắn hay lượt agent khi mở/đóng game.

### Chồng lớp

Từ dưới lên: màu nền → biển và đáy biển → đảo → sinh vật/thuyền → phản hồi tương tác
→ điều khiển DOM → cửa sổ nhật ký. Composer chỉ xuất hiện ở chế độ nền, không tham
gia hệ thống tọa độ game. Canvas không nhận phím khi đang soạn tin.

## 4. Art direction

### Ngôn ngữ hình ảnh

Pixel art với cạnh rõ, hạn chế bóng đổ mềm. Mỗi sprite có silhouette dễ phân biệt:
thuyền có cánh buồm, cá mập có vây tam giác, chim có cánh chữ V, bạch tuộc có đầu
tròn và xúc tu, khủng long có cổ/đuôi và tỷ lệ rõ ràng.

Dùng sprite gốc 16–32px, đảo ghép tile 16px với kích thước 80–160px. Hiển thị theo
bội số nguyên nếu có thể; không phóng sprite theo hệ số lẻ gây nhòe. Canvas có DPR
cap 2 và image smoothing tắt. Tỷ lệ pixel của các asset phải đồng nhất.

| Vai trò | Nền sáng, gợi ý | Nền tối, gợi ý |
|---|---|---|
| Biển nền | #E5F3F5 | #142D38 |
| Vùng nước sâu | #BCDDE3 | #1C4350 |
| Bọt/sóng | #F5FCFC | #789DA8 |
| Cát | #EAD5A5 | #A48D65 |
| Cây/rừng | #6DA18A | #4A796A |
| Thuyền/gỗ | #A47655 | #B08C6B |
| Buồm | #FFF4DA | #DCD4B8 |
| Điểm khám phá | #D8A451 | #E0BC72 |

Đây là bảng màu khởi điểm; kiểm tra trong app ở sáng/tối trước khi chốt. Điều khiển
và chữ dùng token của ohmyt; không lấy màu biển làm màu chữ. Outline cần phân biệt
sprite với mặt nước. Màu accent người dùng chỉ tác động nút/chọn, không nhuộm mọi đảo.

### Chuyển động

- Thuyền nhấp nhô 1–2px, buồm 2–3 frame; vệt nước tan sau khoảng 0,8 giây.
- Sóng có 3–4 frame với nhịp chậm lệch pha; tránh toàn biển chớp đồng thời.
- Chim vỗ cánh 3 frame; khủng long đi 4 frame; xúc tu 4–6 frame.
- Không rung màn hình, chớp sáng hoặc zoom đột ngột. Camera theo thuyền bằng
  nội suy nhẹ, có giới hạn tốc độ; khi bật giảm chuyển động dùng camera tức thời.

## 5. Bản đồ và quần đảo

Dùng một bản đồ hữu hạn được tạo từ seed, không cần thế giới vô tận. Mỗi seed có
4–6 cụm đảo, đường nước nối được, điểm khởi hành an toàn và tối thiểu một vùng biển
rộng. Rìa bản đồ có vùng đệm nước sâu và chuyển hướng; không teleport đột ngột.

Trước khi vào chơi, kiểm tra tuyến đường bằng flood-fill; nếu không hợp lệ dùng
bản đồ dự phòng được thiết kế tay. Chế độ nền tự điều hướng trên các điểm nước an
toàn của cùng bản đồ, không chạy mù qua đất.

| Khu vực | Hình ảnh | Sự kiện tiêu biểu |
|---|---|---|
| Bến Gió | Cầu gỗ, cây dừa, buồm nhỏ | Điểm bắt đầu, quay về an toàn |
| Đảo Rêu Cổ | Rừng dày, đá lớn, dấu chân | Khủng long ló đầu, đi tới bãi cát |
| Mũi Cánh Trắng | Đá cao, tổ chim, cỏ thấp | Chim bay thành đàn, đánh rơi lông |
| Rạn Vây Bạc | Nước xanh sâu, san hô | Vây cá mập lượn thành vòng |
| Vịnh Tám Tay | Đá ngầm, rong biển, rương | Bạch tuộc nâng rương rồi thả xuống |
| Đảo Đèn Xa (giai đoạn sau) | Hải đăng, sương mỏng | Điểm kết thúc chuyến thám hiểm |

Không tạo những đảo chỉ có tên nhưng nhìn giống nhau. Từng đảo cần một landmark
nhận diện được ngay trong dải nền thấp.

## 6. Hành vi và cá tính sinh vật

### Cá mập

Tuần tra rạn, thường chỉ thấy vây và vệt nước. Khi thuyền tới gần: vòng ngoài →
xoay nhìn → tiếp cận ngắn → rời đi. Trong chơi, vùng cảnh báo hiện vòng nước trước
ít nhất 0,8 giây; va chạm làm chậm thuyền và rơi một vật phẩm chưa ghi nhật ký,
không có máu hay chết vĩnh viễn. Cooldown tránh va liên tiếp.

### Khủng long

Ở trên đảo, không bơi đuổi thuyền. Đi trong vùng rừng, dừng ăn lá, ngó ra bờ biển.
Khi tới điểm quan sát, người chơi có thể “Quan sát” để ghi nhật ký. Điểm vui hiếm:
khủng long hắt hơi làm chim bay lên; không cần âm thanh.

### Chim

Bay giữa mỏm đá và cây, có một đàn nền và tối đa vài con nổi bật. Đôi lúc đậu lên
cột buồm rồi bay đi, hoặc dẫn thuyền tới một điểm khám phá. Không dùng lực cản hay
va chạm với chim.

### Bạch tuộc

Chu kỳ ẩn → bong bóng → xúc tu → hiện đầu → tương tác → lặn. Thỉnh thoảng cầm một
vỏ sò/rương nhỏ. Trong chơi có thể chờ đúng nhịp để nhặt vật phẩm; không cần đánh
nhau hay bấm liên tục. Không khóa đường đi duy nhất giữa các đảo.

### Thuyền

Một thuyền gỗ nhỏ với buồm trắng, có lá cờ riêng của ohmyt. Không dùng tàu, biểu
trưng hoặc nhân vật One Piece. Nền tự lái êm; vào chơi giữ vị trí hiện tại nếu an
toàn, nếu không chuyển mềm về bến.

## 7. Nhịp cảnh nền và vòng chơi

### Cảnh tự chạy

Mỗi thời điểm có một sự kiện chính; sự kiện nhỏ không tranh vùng nhìn. Khoảng
12–20 giây xuất hiện một khoảnh khắc: chim đậu, vây nổi hoặc xúc tu mở rương.
Khoảng 45–75 giây có sự kiện kết hợp hiếm. Thời gian dùng simulation time, không
cố bù các sự kiện đã bỏ qua khi ứng dụng bị ẩn. Không tự mở popup nhật ký.

### Ra khơi: vòng chơi 2–5 phút

1. Nhấn Ra khơi, focus vào vùng chơi và thấy hướng dẫn ngắn.
2. Lái thuyền tới landmark, nhặt vỏ sò/mảnh bản đồ hoặc quan sát sinh vật.
3. Sự kiện mới được lưu vào nhật ký bằng thông báo nhỏ, không chặn thao tác.
4. Mở nhật ký để xem những gì đã gặp, hoặc Về chat bất cứ lúc nào.

Không có đồng hồ ép thời gian. Một chuyến hoàn thành mềm khi khám phá 3 địa điểm;
người chơi có thể tiếp tục. Điểm khám phá chỉ cấp một lần cho mỗi mục, không spam
farm bằng đứng yên. Nền tự chạy không kiếm điểm, không tự mở khóa nhật ký.

### Điều khiển

- WASD hoặc mũi tên: điều hướng thuyền; gia tốc nhẹ, không xoay vật lý phức tạp.
- E hoặc Space: tương tác khi ở gần điểm hợp lệ; nút DOM tương ứng luôn hiện.
- Escape: đóng nhật ký trước, nếu không có nhật ký thì về chế độ nền.
- Nút Tạm dừng: dừng mô phỏng, mở bảng tiếp tục/về chat.
- Chỉ chặn phím khi vùng game được focus và ở chế độ chơi. Không chiếm phím từ
  textarea, input, contenteditable, modal cài đặt hoặc composer.
- Chuột dùng cho nút/UI; chưa có click-to-move trong bản đầu để tránh hai sơ đồ
  điều khiển và không vô tình điều khiển game khi bấm nền.

## 8. Nhật ký hải trình

Một bảng nhỏ dạng DOM: Đảo, Sinh vật, Kho báu. Mỗi mục có hình pixel, tên và mô tả
1–2 câu. Chưa khám phá hiện silhouette, không hiện toàn bộ chi tiết từ đầu.

Lưu local có version: seed bản đồ, danh sách ID đã khám phá, tùy chọn nền/chơi.
Không lưu tọa độ mỗi frame. Ghi khi khám phá mới, thoát chơi hoặc đổi tùy chọn;
bắt lỗi quota/storage, game vẫn hoạt động trong bộ nhớ nếu lưu thất bại.

Thêm “Quần đảo mới” với xác nhận rõ chỉ thay bản đồ; giữ bộ sưu tập nhật ký. Nếu
cần reset nhật ký, dùng thao tác riêng có xác nhận. Không đưa dữ liệu này vào chat,
SQLite ứng dụng hoặc bộ nhớ agent.

## 9. Cấu hình, khả năng tiếp cận và trạng thái

Giao diện → Trang chủ → Biển đảo: Tắt / Tĩnh / Sống động. Mặc định đề xuất là
Sống động nếu không có ảnh nền tùy chỉnh và không bật reduced motion. Nếu hệ điều
hành yêu cầu giảm chuyển động, hiển thị cảnh tĩnh và nút chơi do người dùng chủ
động bật; không tự bật chuyển động lại.

Ảnh nền chat có sẵn được ưu tiên: không tự chồng hai nền. Trong cài đặt giải thích
“Biển đảo xuất hiện khi không dùng ảnh nền”. Mascot Home vẫn là tùy chọn độc lập;
ở chế độ chơi nó không hiển thị. Trên màn hình thấp, thu mascot trước khi ép composer.

Trạng thái rõ ràng: disabled → static/ambient → playing → paused → ambient.
Document hidden hoặc window blur: dừng timer; chơi trở về trạng thái paused khi
focus lại, không tự chạy và làm người chơi va chạm. Ambient được tiếp tục khi
hiện lại. Unmount phải hủy RAF, observer và listener.

Canvas có mô tả văn bản ngắn; HUD/nhật ký/nút là DOM có nhãn và focus visible.
Không dùng màu làm tín hiệu duy nhất. Âm thanh không bắt buộc để hiểu sự kiện.

## 10. Kiến trúc tích hợp đề xuất

Không thêm engine game hoặc backend mới cho bản đầu. Canvas 2D cho cảnh, React
cho HUD, cài đặt và nhật ký. Đề xuất module sau khi duyệt thiết kế:

- `src/islandSea/model/`: seed/RNG, bản đồ, collision, simulation và sự kiện thuần.
- `src/islandSea/render/`: palette, sprite atlas, camera và vẽ canvas.
- `src/islandSea/ui/IslandSea.tsx`: vòng đời canvas, resize và đầu vào.
- `src/islandSea/ui/IslandSeaOverlay.tsx`: focus, chơi/tạm dừng và nhật ký.
- `src/islandSea/storage.ts`: schema/version và migrate preference/journal.
- `public/island-sea/`: sprite atlas do dự án sở hữu, không tải từ mạng.
- `HomeView.tsx`: gắn lớp nền và callback mở chơi; giữ Composer hiện tại.
- `appearance.ts` và trang Giao diện: chuẩn hóa tùy chọn mới với fallback hợp lệ.

Simulation dùng fixed step, render dùng RAF có giới hạn 30fps; delta clamp sau
resume để không nhảy vị trí. Canvas là consumer của trạng thái, không làm nguồn
sự thật cho collision hoặc khám phá. Lấy màu theme một lần khi theme thay đổi,
không gọi getComputedStyle cho mỗi sprite mỗi frame.

Tài nguyên được lazy-load khi hiệu ứng bật; tắt không tạo RAF. Tối đa khoảng 20–30
đối tượng động trong vùng nhìn, tái sử dụng sprite/particle, không setState mỗi
frame. Nhật ký chỉ cập nhật React khi có sự kiện mới.

## 11. Quan hệ với Monocode và nguồn tài sản

Đã khảo sát `TerminalGridBackground.tsx`, `gridArcade.ts`, `gridGames.ts` và
`EmptySession.tsx` của https://github.com/hardbeat920/monocode.

Học cách tách simulation/render, dừng khi ẩn và phân biệt ambient/play. Không mang
Snake/Pac-Man vào vì vòng chơi biển đảo khác. Nếu tái sử dụng đoạn code đáng kể,
phải giữ MIT license và bản quyền Nick, ghi commit và provenance vào notices.
Không lấy sprite/logo/provider mascot của Monocode vào bộ asset riêng.

Mọi asset mới cần manifest nguồn và quyền sử dụng. Phương án ưu tiên: atlas pixel
riêng cùng bảng màu; duyệt contact sheet với đủ thuyền, đảo và 4 loài trước khi
làm chuyển động. Không dùng placeholder hình học làm sản phẩm cuối mà vẫn gọi là
bản đã hoàn thiện hình ảnh.

## 12. Trình tự triển khai dự kiến và cổng nghiệm thu

### Giai đoạn A — chốt hình ảnh

Làm mockup Home sáng/tối, cảnh chơi và sprite contact sheet. Duyệt độ nổi của
biển, kích thước đảo, silhouette và vị trí composer trước khi phát triển game.
Đầu ra: bản hình ảnh được duyệt, palette/atlas và spacing cụ thể.

### Giai đoạn B — vertical slice

Một đảo, thuyền tự lái, một con chim, bật/tắt/tĩnh, resize và dừng khi ẩn. Chứng
minh cảm giác đẹp trên Home thật và không làm khó chat trước khi mở rộng nội dung.

### Giai đoạn C — quần đảo sống

Đủ bốn nhóm sinh vật, lịch sự kiện, bản đồ có seed và tuyến nước hợp lệ. Cảnh nền
không tự tạo tiến độ. Kiểm tra sáng/tối và máy cấu hình thấp.

### Giai đoạn D — Ra khơi và nhật ký

Input/focus, collision, tương tác, HUD, lưu dữ liệu, pause/resume và thoát về chat.
Không bỏ qua khôi phục composer và không cho thao tác game gây gọi tool/agent.

### Giai đoạn E — hoàn thiện

Điều chỉnh nhịp chuyển động, contrast, reduced motion, lỗi asset/storage, dọn RAF
và kiểm tra hiệu năng. Đóng gói notices và docs thao tác.

### Tiêu chí kiểm thử

- Unit: seed tái lập, đường nước nối được, collision, cooldown, discovery không
  lặp, migrate storage, thời gian pause và chặn delta quá lớn.
- Electron: bật/tắt, Home/chat/settings, resize, sáng/tối, ảnh nền tùy chỉnh,
  nhập composer không làm thuyền di chuyển, Esc trả focus đúng, bản nháp không mất.
- Accessibility: tab tới tất cả nút, thao tác chơi bằng bàn phím, reduced motion,
  nhãn screen reader và không có keyboard trap.
- Hiệu năng mục tiêu trên máy phát triển: ambient dưới 3ms CPU/frame ở 30fps,
  không render React mỗi frame, không có RAF khi tắt/ẩn; đây là budget cần đo,
  chưa phải kết quả đã xác nhận. Atlas nén mục tiêu dưới 500KiB, chunk code riêng.
- Xem ảnh/video thực: không có đường nối tile lộ, sprite mờ, clipping, nhảy camera
  hay animation giật khi đổi theme. Desktop 1280×800 và 1920×1080; màn hẹp 768px
  và mobile 390px ở chế độ nền.

## 13. Ranh giới của bản đầu

Bao gồm: nền sống, thuyền, 4 nhóm sinh vật, quần đảo có seed, chế độ tĩnh/tắt,
Ra khơi bằng bàn phím desktop, khám phá và nhật ký local.

Để sau: âm thanh, cảm ứng điều khiển game, thời tiết/ngày đêm theo giờ thực,
combat, nâng cấp tàu, nhiều người chơi, agent điều khiển thế giới và đồng bộ cloud.
Các mục này không phải điều kiện hoàn thành bản đầu.
