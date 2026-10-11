# Document Workspace — implementation and verification

Ngày kiểm tra: 11/10/2026. Phase 1 và Phase 2 đã triển khai theo phạm vi preview dưới đây. Phase 3 có snapshot context và đề xuất sửa Markdown có duyệt; workflow sửa Office chưa triển khai. Phase 4 chưa triển khai. Không coi đây là bộ Office editor đầy đủ.

## A. Repository audit

Tái sử dụng App, TopBar, ChatStage, Composer, BrowserPane, React/Lucide, Electron preload, daemon, tool registry, permission pipeline và stream tool activity. Không tạo vòng Agent mới. Workspace có các thay đổi Harness/Browser/Settings đang tồn tại; không hoàn nguyên các thay đổi đó.

Thành phần mới: `electron/documents.cjs`, `src/components/DocumentWorkspace.{tsx,css}`, các adapter trong `src/documents/`, `server/document_proposals.js` và bốn file kiểm tra `test/test_document*`.

Điểm tích hợp thay đổi: `electron/main.cjs`, `electron/preload.cjs`, `src/vite-env.d.ts`, `src/App.tsx`, `TopBar.tsx`, `ChatStage.tsx`, `Composer.tsx`, `ChatMessage.tsx`, `BrowserPane.tsx`, `server/tools.js`, `server/permissions.js`, `server/api.js`, `package.json` và lockfile. Một số file tích hợp còn chứa thay đổi của công việc khác.

## B. Architecture

- Tài liệu mở hiển thị thành tab, nút + mở thêm file, đóng riêng từng tab. Chuyển tab giữ nháp Markdown; đóng nháp có xác nhận. Bỏ tên file lặp và hướng dẫn dài khỏi preview; thao tác reveal/reload dùng icon. Tabs được xóa khi đổi chat.
- App shell giữ sidebar trái và chat giữa; icon góc phải mở panel Files mặc định 440px, kéo/keyboard resize và mở rộng. Đóng panel giữ file/nháp trong phiên hiện tại. Đổi chat xóa scope và state; nháp chưa lưu không được khôi phục khi đổi chat.
- Màn hình <=1100px dùng drawer để giữ chiều rộng chat, chừa vùng composer. Khi mở browser ở màn hình nhỏ, panel tài liệu đóng. Desktop browser mở rộng được thu về khi mở tài liệu.
- Electron main sở hữu filesystem. Renderer chỉ nhận bridge hẹp. Grant UUID gắn chat, realpath, identity của root; chặn traversal, symlink/hardlink, secret và `.git`. Không cấp filesystem tùy ý cho renderer.
- Cây thư mục tải theo lần mở; search có giới hạn. Có tạo Markdown/thư mục, đổi tên, hiện trên máy và xóa vào trash qua xác nhận native.
- Read giới hạn 25MB; OOXML kiểm tra archive trước parse (5000 entries, 20MB/entry, 60MB expanded), từ chối mã macro/encrypted. Đây là giới hạn tài nguyên, không phải chứng nhận an toàn cho mọi tài liệu đối kháng.
- Lưu Markdown kiểm tra SHA256 phiên bản, serialize cùng file, backup, temp và atomic rename. Kiểm tra trước ghi giảm race nhưng không cung cấp filesystem transaction với tiến trình khác.
- Adapter nặng tải lazy; workbook parse trong worker; PDF.js worker đóng khi unmount. DOCX dùng iframe sandbox/CSP, Markdown không chạy HTML hay tải ảnh/link bên ngoài.
- Mở tài liệu tự lấy snapshot giới hạn 16000 ký tự, lưu context riêng trong backend theo session; không hiện chip ở composer, không ghép nội dung vào prompt/message DB. Driver đưa snapshot vào message context riêng ngay trước câu hỏi, dưới marker untrusted/read-only, vẫn dùng Harness hiện tại. Chuyển tab cập nhật file active; đóng tab gỡ snapshot; đổi chat xóa context scope cũ. Tối đa 10 snapshot/backend session. PDF mặc định lấy tối đa 10 trang đầu; scan chưa có OCR. Context chỉ gửi đến model khi người dùng gửi tin nhắn, không tự gọi model khi mở file.
- Gửi tin nhắn chờ tác vụ trích xuất/upload context của đúng chat hoàn tất để tránh race. Prompt nói rõ Agent có quyền đọc snapshot của file đang mở, không cần yêu cầu upload lại. Adapter Gemini có kiểm tra JSON request giả lập. Kiểm tra live bổ sung dùng model đang cấu hình `ag/gemini-3.8-flash-high`, file Dataset_Details.docx thật (998 ký tự trích xuất): model nhận đúng tên file và tóm tắt Bank Marketing. Đây là một lượt kiểm tra trực tiếp Gateway, không ghi tin nhắn vào chat người dùng. Kết quả: `output/document-workspace/live-document-check.json`.
- Kiểm tra backend context: isolation, giới hạn, xóa tab/clear; bài Electron xác nhận model nhận Reference trong context riêng trước câu hỏi trong khi DB user message chỉ có nội dung người dùng viết và composer không có thẻ tài liệu.
- Panel tự mở file có đề xuất Agent hợp lệ trong cùng thư mục đã cấp quyền, khi không có nháp chưa lưu. Đã bỏ tùy chọn checkbox để giữ giao diện gọn.
- Tool `document_propose` chạy qua registry/Harness/permission hiện tại, chỉ tạo đề xuất và không ghi file. Snapshot có scope/path/version/grant; panel kiểm tra trước/sau, duyệt lưu, từ chối hoặc lưu bản sao. DENY policy vẫn được tôn trọng. Luồng này không giới hạn các tool filesystem sẵn có của Agent ngoài Document Workspace.

## C. Dependencies

| Package | Version | License | Công dụng |
|---|---|---|---|
| react-markdown | 10.1.0 | MIT | Markdown local |
| remark-gfm | 4.0.1 | MIT | Table, task list |
| pdfjs-dist | 6.4.299 | Apache-2.0 | PDF canvas/text/worker |
| docx-preview | 0.4.1 | Apache-2.0 | DOCX DOM |
| xlsx | 0.20.3, official SheetJS tarball | Apache-2.0 | XLSX/XLS parse |
| fflate | 0.8.3 | MIT | PPTX ZIP |

Không cần Microsoft Office, tài khoản Office, LibreOffice hay native runtime mới. Preview assets được bundle local. npm audit còn 14 cảnh báo từ các dependency khác; không tuyên bố toàn repo sạch lỗ hổng.

Build quan sát: lazy Markdown khoảng154KB (46KB gzip), Word172KB (49KB gzip), PDF engine430KB (129KB gzip), cộng worker/asset riêng. Main bundle khoảng1.68MB (458KB gzip), vẫn có cảnh báo chunk lớn. Các số là kích thước output build, không phải mức RAM hay benchmark so sánh baseline.

## D. Feature matrix

| Loại | Preview | Sửa tay | Agent sửa có duyệt | Offline | Giới hạn |
|---|---|---|---|---|---|
| MD | Có, GFM | Có | Có | Có | HTML/link/ảnh ngoài bị vô hiệu; lưu <=2MB |
| PDF | Có | Không | Không | Có | Canvas từng trang, text/search/zoom/fit; không OCR/annotation |
| DOCX | Có | Không | Không | Có | docx-preview; không cam kết fidelity Word tuyệt đối |
| XLSX/XLS | Có | Không | Không | Có | Sheet, merge, selection, formula/cached value; 150 rows/page, <=100 cols; không recalc hoặc đủ style/chart |
| PPTX | Cơ bản | Không | Không | Có | Text, PNG/JPEG, shape đơn giản; không theme/master/chart/animation/layout phức tạp; slide theo tên part số |

Các định dạng đều có thể trích nội dung vào chat trong giới hạn snapshot. Agent không có công cụ sửa Office có cấu trúc trong thay đổi này.

## E. Verification

- TypeScript và production build: qua.
- Unit tests: grant isolation, traversal, symlink, secret, oversized file, filename search, stale version, backup nhiều lần; ZIP hợp lệ/hỏng/traversal/macro/expansion; proposal schema/scope/path, registry và permission DENY: qua.
- Electron với daemon/Harness/tool pipeline/SSE thật và provider fixture có kịch bản: preview sáu định dạng, folder navigation, Markdown save, context chip, Agent proposal, approve, reject, save copy, create/rename/cancel delete, đóng/mở và responsive. Provider fixture không phải kiểm chứng chất lượng suy luận của model thật.
- Chặn HTTP ngoài loopback trong bài Electron; preview không cần kết nối ngoài. Fixture dùng file thật được sinh trong thư mục tạm; không phải corpus tài liệu Office thực tế đa dạng.
- Harness suite, project isolation, projects, stream lifetime, approval modes và browser bounds: qua trong lần kiểm tra này.
- Đã sửa regression browser: CSS đóng panel cũ ghi đè flex allocation làm chat nhảy ngay; selector mới giữ animation khi đóng. Khung native dùng chiều rộng cố định cả khi mở/đóng để tránh sai số làm tròn 1px gây resize Chromium. `test:html-preview` đã qua cả native paint, rapid reopen, reduced motion và geometry 900/1200/1440px. Không nới lỏng assertion. Test app đăng ký handler window-is-maximized như app thật để tránh IPC error giả.
- `npm test` toàn bộ chuỗi kiểm tra mặc định (bao gồm Harness/upgrade), `npm run test:documents` và `npm run test:html-preview`: qua sau sửa lỗi. Logs mới: `output/document-workspace/fix-{all,documents,preview}.log`.
- Quan sát trên fixture: mở MD ~340ms, XLSX ~380ms, XLS ~48ms, PPTX ~335ms, PDF ~391ms, DOCX ~343ms (bao gồm polling của test). Không phải benchmark trên file lớn hoặc đo memory leak. Chưa có soak test/RAM baseline.

Screenshot thực tế ở `output/document-workspace/`: closed, explorer, folder-expanded, markdown, excel, xls, pdf, word, powerpoint, agent-processing, change-review và các kích thước 1366x768, 1280x800, 1024x768, 1920x1080. Screenshot default 1440x900. Kiểm tra trực quan PPTX đã xác nhận chữ render ở kích thước đọc được.

Chạy lại: `npm run build`, `npm run test:documents`, `npm run test:harness`. Linux UI tests dùng xvfb/Electron; không cần model cloud cho fixture tests.

## F. Remaining work

Phase 3 tiếp theo: kiểm thử model thật, structured Office proposals, adapters ghi Office có review/backup và fidelity tests; cơ chế khôi phục nháp theo chat. Phase 4: quyết định engine Office editor dựa trên license/size/fidelity, không đưa nút chỉnh sửa giả vào UI.

Cần corpus DOCX/XLSX/PPTX phức tạp, file lớn, test Office round-trip, kiểm tra hỗ trợ Tauri (bridge hiện tại dành Electron), đo RAM/soak. Chưa có căn cứ tuyên bố không memory leak hoặc hỗ trợ mọi tài liệu.
