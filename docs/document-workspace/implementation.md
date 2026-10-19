# Document Workspace — implementation and verification

Cập nhật viewer: 15/10/2026. Kiểm tra triển khai ban đầu: 11/10/2026. Phase 1 và Phase 2 đã triển khai theo phạm vi preview dưới đây. Phase 3 có snapshot context và đề xuất sửa Markdown có duyệt; workflow sửa Office chưa triển khai. Phase 4 chưa triển khai. Không coi đây là bộ Office editor đầy đủ.

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
- Preview dùng Flyfish 3.2.1 cho Markdown, PDF, DOCX, XLSX/XLS và PPTX. Đã bỏ năm component viewer cũ và dependency trực tiếp `docx-preview`. Mỗi file được nạp vào entry `document-viewer.html` trong iframe `sandbox="allow-scripts"` (opaque origin, không `allow-same-origin`). Entry và renderer được nạp theo nhu cầu, không mount khi đóng panel.
- Iframe chỉ nhận tên hiển thị và bản sao bytes qua MessageChannel; không nhận grant, đường dẫn, scope hay token daemon. CSP chặn tài nguyên ngoài, API, frame con, form và script inline trong bản production. Link tài liệu bị chặn điều hướng. CSS của tài liệu nằm trong iframe.
- Opaque iframe dùng Worker proxy qua MessagePort. Host chỉ tạo bốn Worker URL cố định trong `/file-viewer/vendor/` (DOCX, spreadsheet, PPTX, PDF), giới hạn tám Worker/frame; Worker nhận CSP chỉ cho assets. ArrayBuffer được transfer khi relay; dispose iframe/panel dừng mọi Worker do host sở hữu. Chưa coi đây là bằng chứng không memory leak.
- Vite copy đúng assets của renderer (Worker, font, CMap/WASM và notices) từ package cùng phiên bản vào `public/file-viewer/` khi dev và `dist/file-viewer/` khi build. Thư mục public sinh tự động được gitignore. Daemon cho phép CORS origin `null` chỉ với GET/HEAD assets công khai; API vẫn từ chối. Asset thiếu trả 404 thay vì SPA fallback.
- Trích snapshot AI vẫn dùng parser độc lập `pdfEngine.ts`, `sheet.worker.ts` và `fflate`; không dùng DOM preview làm dữ liệu tin cậy. Các dependency này được giữ cho tính năng context, không phải viewer cũ.
- Mở tài liệu tự lấy snapshot giới hạn 16000 ký tự, lưu context riêng trong backend theo session; không hiện chip ở composer, không ghép nội dung vào prompt/message DB. Driver đưa snapshot vào message context riêng ngay trước câu hỏi, dưới marker untrusted/read-only, vẫn dùng Harness hiện tại. Chuyển tab cập nhật file active; đóng tab gỡ snapshot; đổi chat xóa context scope cũ. Tối đa 10 snapshot/backend session. PDF mặc định lấy tối đa 10 trang đầu; scan chưa có OCR. Context chỉ gửi đến model khi người dùng gửi tin nhắn, không tự gọi model khi mở file.
- Gửi tin nhắn chờ tác vụ trích xuất/upload context của đúng chat hoàn tất để tránh race. Prompt nói rõ Agent có quyền đọc snapshot của file đang mở, không cần yêu cầu upload lại. Adapter Gemini có kiểm tra JSON request giả lập. Kiểm tra live bổ sung dùng model đang cấu hình `ag/gemini-3.8-flash-high`, file Dataset_Details.docx thật (998 ký tự trích xuất): model nhận đúng tên file và tóm tắt Bank Marketing. Đây là một lượt kiểm tra trực tiếp Gateway, không ghi tin nhắn vào chat người dùng. Kết quả: `output/document-workspace/live-document-check.json`.
- Kiểm tra backend context: isolation, giới hạn, xóa tab/clear; bài Electron xác nhận model nhận Reference trong context riêng trước câu hỏi trong khi DB user message chỉ có nội dung người dùng viết và composer không có thẻ tài liệu.
- Panel tự mở file có đề xuất Agent hợp lệ trong cùng thư mục đã cấp quyền, khi không có nháp chưa lưu. Đã bỏ tùy chọn checkbox để giữ giao diện gọn.
- Tool `document_propose` chạy qua registry/Harness/permission hiện tại, chỉ tạo đề xuất và không ghi file. Snapshot có scope/path/version/grant; panel kiểm tra trước/sau, duyệt lưu, từ chối hoặc lưu bản sao. DENY policy vẫn được tôn trọng. Luồng này không giới hạn các tool filesystem sẵn có của Agent ngoài Document Workspace.

## C. Dependencies

| Package | Version | License | Công dụng |
|---|---|---|---|
| @file-viewer/core, @file-viewer/react | 3.2.1 (pin) | Apache-2.0 | Core và React shell trong iframe |
| @file-viewer/renderer-word, renderer-spreadsheet, renderer-presentation, renderer-pdf, renderer-text | 3.2.1 (pin) | Apache-2.0, kèm notices dependency | Năm renderer, không Full/preset-office |
| @file-viewer/vite-plugin, assets-standard | 3.2.1 (pin), dev dependencies | Apache-2.0, kèm notices assets | Build và assets offline theo renderer |
| pdfjs-dist | 6.4.299 | Apache-2.0 | PDF snapshot cho AI |
| xlsx | 0.20.3, official SheetJS tarball | Apache-2.0 | XLSX/XLS snapshot cho AI |
| fflate | 0.8.3 | MIT | OOXML validation/extraction |

Không cần Microsoft Office, tài khoản Office, LibreOffice hay Office server. Giữ `react-markdown`/`remark-gfm` vì phần chat còn sử dụng chúng. License/nguồn Flyfish được ghi trong `THIRD_PARTY_NOTICES.md`; assets build giữ notices đi kèm. Assets offline tăng dung lượng bản phân phối; lazy-load không chứng minh RAM thấp. Chưa có benchmark so sánh trên corpus file thật hoặc đo RAM/soak.

## D. Feature matrix

| Loại | Preview | Sửa tay | Agent sửa có duyệt | Offline | Giới hạn |
|---|---|---|---|---|---|
| MD | Flyfish | Có | Có | Có | HTML được sanitize; link và tài nguyên ngoài bị chặn; lưu <=2MB |
| PDF | Flyfish | Không | Không | Có | PDF.js renderer, search/zoom/navigation; không OCR |
| DOCX | Flyfish | Không | Không | Có | Worker, external resources/links và altChunks bị chặn; không cam kết fidelity Word tuyệt đối |
| XLSX/XLS | Flyfish | Không | Không | Có | Virtualized grid, sheet tabs và định dạng do renderer hỗ trợ; không còn bảng HTML 150 hàng/100 cột của ohmyt; không cam kết đầy đủ Excel/recalc |
| PPTX | Flyfish | Không | Không | Có | Parser/renderer PPTX trong Worker; cần kiểm tra fidelity với file thật, không cam kết đủ PowerPoint |

Các định dạng đều có thể trích nội dung vào chat trong giới hạn snapshot. Agent không có công cụ sửa Office có cấu trúc trong thay đổi này.

## E. Verification

Các kết quả dưới đây là kiểm tra triển khai ban đầu ngày 11/10; số đo viewer cũ không đại diện cho Flyfish. Kiểm tra chuyển đổi ngày 15/10 được ghi riêng bên dưới.

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

## G. Flyfish migration (15/10/2026)

- Kiểm tra Electron ở cả production và Vite dev (`OHMYT_DOCUMENT_TEST_DEV=1 xvfb-run -a electron --no-sandbox --ozone-platform=x11 test/documents/test_document_workspace_app.cjs`). Vite prebundle `xlsx` để lần trích context đầu không gây full reload.
- `npx tsc --noEmit`, `npm run build` và `npm run test:documents` kiểm tra bản chuyển đổi; bài Electron dùng daemon thật và fixture provider, chặn network ngoài loopback.
- Regression Worker kiểm tra URL allowlist, relay, terminate và cleanup khi đóng; regression HTTP kiểm tra opaque origin bị từ chối ở API, chỉ lấy được public assets, asset thiếu không trả app HTML.
- Bài Electron kiểm tra nội dung preview, workbook parsed/canvas, các định dạng, khôi phục tab, Markdown save/review/copy, context AI, isolation DOM/desktop bridge và API bị CSP chặn. File PPTX fixture được bổ sung content types và relationships hợp lệ để chạy parser thật.
- Chưa kiểm tra file Excel người dùng chụp màn hình vì chưa có file gốc; fixture không chứng minh fidelity mọi tài liệu, RAM hoặc chất lượng model live.

### Preview bootstrap recovery

Host chờ thông báo ready gắn nonce và đúng `event.source` từ opaque iframe trước khi transfer MessagePort/bytes. Không dùng iframe load làm tín hiệu mã viewer đã sẵn sàng: load có thể thuộc about:blank hoặc đến trước khi module async khởi tạo. Bootstrap báo lỗi import, host hiển thị lỗi và nút Thử lại; retry tạo channel/nonce mới và dọn Worker cũ. Regression Electron chủ động phát load sớm, gửi ready giả từ parent, chặn một lần module startup rồi kiểm tra retry và khôi phục tab.
