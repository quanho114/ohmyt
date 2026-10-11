# Thiết kế cách ly project trong ohmyt

Trạng thái: đã triển khai phạm vi mặc định đóng; các mở rộng có chủ động chia sẻ còn chưa triển khai. Ngày: 05/10/2026.

## 1. Mục tiêu và phạm vi bảo vệ

Một lượt agent trong project A chỉ được dùng lịch sử, bộ nhớ, file và quyền thuộc A. Đổi sang B không chuyển ngầm thông tin hoặc quyền của A. Giao diện và dịch vụ phải cùng sử dụng một phạm vi do backend xác định.

Đây là bảo vệ khỏi truy cập nhầm, prompt injection và agent thao tác ngoài project trong phạm vi ứng dụng. Không cam kết bảo mật tuyệt đối trước chủ máy, mã độc trên máy, lỗ hổng hệ điều hành hoặc nhà cung cấp model. Người dùng vẫn có quyền mở mọi project của mình trong UI. File được gửi tới model cloud chịu chính sách của provider đó; cách ly thư mục không giữ dữ liệu hoàn toàn trên máy.

Project cách ly với project khác; các session trong cùng project có lịch sử riêng nhưng được dùng chung bộ nhớ của project. Nếu cần session độc lập hoàn toàn, đó là chế độ riêng, không phải mặc định của thiết kế này.

## 2. Hiện trạng đã kiểm tra

- Session có `project_id`, nhánh chat giữ project gốc; ToolRegistry tạo riêng cho mỗi run.
- File tools kiểm tra đường dẫn nằm trong root và kiểm tra symlink. Đây chưa phải bảo vệ đầy đủ trước thay đổi filesystem đồng thời giữa kiểm tra và mở file.
- Linux shell dùng bubblewrap; chỉ mount project, cô lập network và có theo dõi process khi hủy run.
- `forWorkspace()` hiện giữ `hostEnabled` và sao chép tool bổ sung. Vì vậy `shell_host` hoặc tool chưa khai báo phạm vi có thể vượt project.
- Bộ nhớ lưu/tìm và hồi tưởng theo `agent_id`, chưa lọc project.
- Quyền “luôn cho phép” lưu mẫu `tool:*` toàn ứng dụng.
- Có API chuyển tiếp nội dung giữa session; đây là đường truyền dữ liệu cần kiểm soát.
- Một SQLite chứa mọi project. Thiết kế này cách ly logic, không cung cấp mã hóa riêng hoặc tách database vật lý.

## 3. Các quy tắc bắt buộc

1. Backend lấy project từ session đã lưu; model và tool arguments không được chọn project.
2. Session project không được đổi project sau khi đã có lịch sử hoặc run. Chuyển dữ liệu phải là thao tác sao chép riêng của người dùng.
3. Không thấy project, root mất, root đổi hoặc thiếu sandbox: dừng run với lỗi rõ ràng. Không tự dùng thư mục mặc định hay shell host.
4. Project run không có `shell_host` trong danh sách tool, và việc gọi trực tiếp tên tool này vẫn bị chặn ở dispatcher.
5. Tất cả tool, kể cả plugin, phải khai báo và thực thi phạm vi. Tool chưa khai báo bị chặn trong project run.
6. Quyền của A không áp dụng cho B. Duyệt quyền không được vô hiệu hóa ranh giới project.
7. Bộ nhớ ngoài project không được tự hồi tưởng. Đọc và ghi đều phải lọc phạm vi.
8. Lịch sử, event, approval, stream và process phải gắn với đúng session/run. Các run song song không dùng root hoặc context mutable dùng chung.

## 4. Context duy nhất cho từng run

Backend tạo context bất biến từ `session_id`:

```ts
type RunScope = {
  runId: string;
  sessionId: string;
  agentId: string;
  scopeId: string; // project:<id> hoặc standalone:<session-id>
  projectId: string | null;
  canonicalRoot: string;
  rootIdentity: string; // định danh filesystem tại thời điểm đăng ký
  policyVersion: number;
};
```

RunScope được truyền xuyên suốt prompt assembly, memory, tools, permission, event và audit. Không lấy scope từ text người dùng, prompt, URL file hoặc input do model tạo. Scope không đổi khi UI chuyển chat.

Chat ngoài project sử dụng phạm vi session riêng, không còn mặc định chia sẻ trí nhớ với mọi project qua agent chung. Cấu hình hành vi của agent có thể dùng chung; nội dung dữ liệu của agent thì không.

## 5. Dữ liệu và migration

| Thành phần | Thay đổi |
|---|---|
| projects | Lưu canonical path và root identity; phát hiện đường dẫn trùng/lồng nhau |
| memories | Thêm `scope_id NOT NULL`; index `(scope_id, agent_id, created_at)` |
| memory FTS | Mọi kết quả phải JOIN bảng memories và lọc scope trước khi trả; không lọc sau LIMIT |
| policies | Thêm scope, tool, resource pattern và thời điểm; quyền project có phạm vi riêng |
| runs / approvals | Gắn scope snapshot và policy version vào context/audit |
| sessions | Project là liên kết cố định; branch kế thừa project và model |
| attachments / exports | Ghi nguồn project và hành động chia sẻ khi có chuyển dữ liệu |

Bộ nhớ cũ chưa có scope được chuyển sang `legacy:unassigned`; agent không tự dùng nữa. Người dùng phân loại hoặc chủ động chép vào project. Không suy đoán project từ nội dung bộ nhớ.

Quyền ALLOW cũ không tự cấp cho các project. DENY toàn ứng dụng vẫn là lớp chặn tối thiểu; quyền thao tác project được cấp lại theo project. Migration chạy trong transaction, có backup database nhất quán gồm dữ liệu WAL qua SQLite backup API hoặc checkpoint phù hợp. Có kiểm tra phiên bản schema và kế hoạch khôi phục trước migration.

## 6. File và thư mục

- Chấp nhận đường dẫn tương đối trong root hoặc tuyệt đối nằm trong root. Chặn `..`, symlink/junction ra ngoài và hardlink không hỗ trợ.
- Không chỉ kiểm tra chuỗi prefix; dùng đường dẫn canonical và quan hệ ancestor thực tế.
- Chặn đăng ký hai project có root giống hoặc lồng nhau trong chế độ cách ly. Nếu A bao trùm B thì A vốn đã đọc được B.
- File tools cần mở file thông qua broker trong sandbox hoặc primitive mở theo directory handle an toàn. Kiểm tra realpath rồi mở thông thường vẫn có race; không tuyên bố xử lý xong race bằng cách thêm một lần realpath.
- Root identity thay đổi sau xóa/tạo lại hoặc thay bằng symlink: khóa project, yêu cầu người dùng đăng ký lại thư mục.
- Không tự mount home, thư mục ohmyt/data, project khác hoặc thư mục thông tin xác thực vào sandbox.
- Root project không được là thư mục chứa database/vault của ohmyt trong chế độ cách ly.
- Secret trong chính project cần denylist thống nhất giữa fs_read, fs_list và shell; hiện che một số `.env` chỉ cho shell là chưa đủ. Mặc định chặn `.env*` chứa secret, private keys và cấu hình credentials; có cơ chế người dùng cấp đọc một file cụ thể cho một run. Các file public như `.env.example` được khai báo riêng.

Không dựa vào denylist secret để bảo đảm mọi bí mật đều được phát hiện. Người dùng phải biết file được cấp cho agent có thể đi vào prompt cloud.

## 7. Shell, mạng và tool bổ sung

| Năng lực | Mặc định trong project |
|---|---|
| Đọc/list file | Cho phép trong root, trừ file bị chặn |
| Ghi file | Hỏi trước, chỉ trong root |
| Shell sandbox | Hỏi trước, mount project, network tắt |
| Shell host | Chặn cứng |
| Web search / HTTP | Tắt; quyền mạng riêng khi người dùng bật |
| Memory | Chỉ scope hiện tại |
| Plugin/tool mới | Chặn cho tới khi có hợp đồng phạm vi và kiểm thử |

Nếu bật network, phải nói rõ dữ liệu có thể rời máy. Cài dependencies, Git fetch và package scripts vẫn chạy trong sandbox. Không tự chuyển sang host để tránh lỗi.

Linux dùng sandbox thực tế đã kiểm chứng. Windows/macOS chỉ bật shell khi có adapter sandbox đáp ứng cùng contract; nếu chưa có thì shell bị tắt. Hệ thống hiển thị năng lực thực tế, không gắn nhãn “cách ly” cho native shell.

Mỗi run có workspace mount, thư mục tạm và process group riêng; dừng run dọn process con. Không chia sẻ cache chứa dữ liệu project cho run khác. Sandbox có giới hạn thời gian, lượng output và tài nguyên phù hợp.

## 8. Quyền và duyệt thao tác

Thứ tự: hard boundary → DENY toàn ứng dụng → DENY của project → grant cụ thể của project → ASK. Bất kỳ ALLOW nào cũng không vượt hard boundary.

Đổi “Luôn cho phép” thành “Cho phép trong project này”. Grant lưu tool và resource đủ hẹp: file/path hoặc capability đã hiển thị; không tự biến duyệt một lệnh thành cho phép mọi lệnh shell của mọi project.

Approval chứa project, root, run, tool và input đã chuẩn hóa. Backend xác minh approval thuộc run đang chạy và chưa hết hạn. Không áp dụng approval của A cho B, kể cả sau chuyển tab. Hủy run phải hủy cả approval đang chờ.

UI hiển thị tên project ngay trên hộp duyệt. Với shell phải hiển thị lệnh và môi trường chạy; với file phải hiển thị đường dẫn thực sự.

## 9. Chuyển tiếp, nhánh, kỹ năng và prompt injection

- Branch mặc định giữ project gốc; không có lựa chọn âm thầm tạo nhánh sang project khác.
- Forward cùng project được phép theo thao tác người dùng. Forward sang project khác cần thao tác chia sẻ rõ ràng với nguồn/đích và nội dung cụ thể. Agent không được tự làm việc này qua tool.
- API không tin `projectId` do frontend gửi khi thao tác lên session đã tồn tại; lấy project từ session, so khớp nguồn/đích tại backend.
- Bộ nhớ, kết quả tools, README, skills của project và tài liệu được đọc là dữ liệu không đáng tin; không thể thay quyền hoặc phạm vi chỉ bằng chỉ dẫn trong file.
- Project skills chỉ được load từ project đó hoặc thư viện cấu hình chung đã được người dùng bật. Skills không được yêu cầu đọc memory/data của project khác.
- UI quản lý bộ nhớ có bộ lọc project; nội dung global chỉ dùng nếu người dùng chủ động chia sẻ. Không dùng bộ nhớ global làm đường vòng cho dữ liệu project.

## 10. Giao diện

Sidebar giữ luồng “Thêm project → chọn thư mục → chat”. Trong chat hiển thị project và trạng thái thực tế: “Phạm vi: project”, “Shell cách ly” hoặc “Shell chưa khả dụng”.

Cài đặt project gồm bộ nhớ, quyền, file được chia sẻ và network. Có mục “Dữ liệu đã chia sẻ sang project khác”. Không dùng nhãn “bảo mật tuyệt đối”.

Nếu root không còn đúng: thông báo “Thư mục project đã thay đổi. Chọn lại thư mục để tiếp tục.” Nếu shell chưa được cách ly: báo năng lực chưa khả dụng thay vì mời cấp quyền host.

## 11. Kiểm thử bắt buộc trước khi bật

1. A/B có marker khác nhau: prompt recall, memory_search, memory_save và FTS chỉ thấy đúng marker.
2. Session/run/SSE/approval xen kẽ, chuyển tab, reload và abort: không có event hoặc quyền chéo.
3. Paths: `..`, prefix gần giống, symlink, hardlink, junction, case khác nhau, root thay đổi và race kiểm tra/mở.
4. Chặn project root trùng/lồng nhau và root chứa dữ liệu ứng dụng.
5. Sandbox không đọc home/vault/project B; không kết nối mạng khi network tắt; process con dừng khi abort.
6. `shell_host` bị chặn cả khi model gọi tên trực tiếp, có ALLOW cũ hoặc plugin cố đăng ký lại.
7. File secret bị chặn nhất quán qua fs và shell; grant một run không dùng lại ở run khác.
8. Prompt injection trong README/kết quả tool không thay scope, không cấp quyền, không forward dữ liệu.
9. Migration giữ lịch sử; memory chưa phân loại không xuất hiện; quyền toàn ứng dụng cũ không rò sang project.
10. Forward nguồn/đích khác project bị chặn khi chưa có thao tác chia sẻ được xác nhận tại backend.
11. Không có sandbox hoặc adapter lỗi: dừng an toàn, không chạy native shell thay thế.
12. Mock tests kiểm tra routing/context; các khẳng định về sandbox cần test thực thi thật trên từng OS được hỗ trợ.

## 12. Thứ tự triển khai và điều kiện hoàn tất

Giai đoạn 1: RunScope, memory scope + migration, chặn shell_host/tool chưa khai báo, project permissions, khóa root trùng/lồng nhau và kiểm soát forward. Giai đoạn này chưa được quảng bá là cách ly đầy đủ nếu file race hoặc shell adapter còn thiếu.

Giai đoạn 2: broker filesystem an toàn, root identity, secret policy thống nhất, sandbox per-run và capability theo OS; kiểm thử thực thi thật.

Giai đoạn 3: UI quản lý bộ nhớ/quyền/chia sẻ, audit redaction, recovery và kiểm thử hồi quy toàn luồng.

Hoàn tất khi các test ranh giới đều qua, backend là nơi cưỡng chế phạm vi, lỗi luôn dừng an toàn và UI phản ánh đúng năng lực đã kiểm chứng. Audit mặc định chỉ lưu scope/tool/resource/kết quả trạng thái, không thêm log toàn bộ secret hoặc prompt ngoài lịch sử cần thiết; thời hạn lưu và xóa dữ liệu phải rõ ràng.

## 13. Phạm vi thực tế đã triển khai

Đã có RunScope bất biến, bộ nhớ/FTS/recall theo scope, migration và backup; quyền
ALLOW chính xác theo scope; chặn shell_host/web/plugin; file broker trong bubblewrap
Linux; root identity; kiểm tra root lồng nhau/dữ liệu ứng dụng; che file secret/hardlink;
forward cùng project; nhánh giữ model; approval khớp run và bị hủy cùng run; bộ lọc
bộ nhớ, nhãn project trong approval và kiểm thử sandbox thực thi thật.

Các lựa chọn mở rộng chưa có: bật mạng cho project, grant đọc một secret, chia sẻ
chéo project, kỹ năng/plugin có scope, và sandbox Windows/macOS. Tất cả các năng lực
này hiện bị chặn thay vì âm thầm nâng quyền. UI quản lý bộ nhớ cho phép gán memory vào project, lọc theo phạm vi và thu hồi từng grant project.

Sandbox không bảo vệ trước chủ máy/mã độc thay đổi filesystem đồng thời. File broker
không thực thi thao tác host, nhưng root/secret inventory không được coi là chống
mọi kiểu đua tạo hardlink của actor ngoài ứng dụng. Không dùng thiết kế này làm
ranh giới giữa nhiều người dùng hệ điều hành. Các giới hạn tài nguyên hiện là timeout,
output và số entry kiểm tra; chưa có quota CPU/RAM/disk theo project.

Runtime file broker trong sandbox dùng đúng executable của dịch vụ. Với Electron,
mount riêng các thư viện `.so`, `icudtl.dat` và dữ liệu snapshot V8 cạnh executable,
rồi bật `ELECTRON_RUN_AS_NODE`. Không mount toàn bộ thư mục cài đặt ứng dụng.
Các quy tắc mount được truyền qua descriptor của bubblewrap; cây có nhiều tệp
nhạy cảm được che theo nhánh để không vượt giới hạn số đối số của bubblewrap.

Kiểm thử lặp lại bằng `npm run test:sandbox` (Node và Electron Node mode) và
`npm run test:sandbox:desktop` (Electron utility process giống dịch vụ desktop).
Trên Linux không có màn hình, chạy lệnh desktop với `xvfb-run -a`.
