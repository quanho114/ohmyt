# sky — Trợ lý AI Local-First trên máy của bạn

Tên sản phẩm hiện tại là **sky**, với [logo thiên hà PNG gốc](public/sky.png)
và [bản SVG nhúng ảnh gốc](public/sky.svg).
Các khóa lưu trữ và thư mục dữ liệu cũ được giữ tương thích khi đổi tên;
xem [quy ước thương hiệu và dữ liệu](docs/architecture/sky-brand.md).

Trên Linux, chạy `npm run desktop:install` để đăng ký icon sky trong menu ứng dụng
và dock; `npm run desktop` vẫn dùng để chạy bản phát triển.

sky là trợ lý AI chạy trực tiếp trên máy cá nhân: chat với nhiều model
(Ollama local hoặc API cloud qua proxy của bạn), đọc/ghi tệp, chạy lệnh
terminal, tìm kiếm web và ghi nhớ dài hạn — với phê duyệt của bạn trước
mọi thao tác nhạy cảm.

- **Màn home kiểu LobeHub:** lời chào, composer lớn, gợi ý, chủ đề gần đây.
- **Nhiều provider & model:** Ollama, OpenAI, Anthropic, Google Gemini,
  OpenAI-compatible, Custom — thêm/sửa API key trong Cài đặt, key lưu mã
  hóa AES-256-GCM trên máy (`data/secrets.enc.json`).
- **Agent Loop thật:** gọi tool đa bước với ngân sách request/tool cấu hình được, streaming
  token qua SSE, lỗi API báo thẳng ra chat.
- **Human-in-the-loop:** chính sách `ALLOW / ASK / DENY` theo mẫu lệnh,
  modal phê duyệt, nút Take Control dừng tác vụ tức thì.
- **Bộ nhớ dài hạn:** SQLite + FTS5 (profile / semantic / episodic), tự
  hồi tưởng vào system prompt.
- **Giao diện:** sáng/tối + chỉnh accent, neutral, font chữ, code theme,
  Mermaid; code highlight + render sơ đồ ngay trong chat.
- **Projects:** bấm Thêm project ở sidebar để chọn thư mục trên desktop hoặc nhập đường dẫn tuyệt đối trên máy chạy sky ở bản web. Project được lưu cùng dữ liệu ứng dụng; thêm xong mở chat ngay, nút + tạo thêm chat trong project. Agent dùng thư mục project cho thao tác tệp và lệnh; chat tách nhánh giữ project gốc.
- **Menu phiên:** hover/focus dòng phiên để hiện nút ba chấm; đổi tên lưu trên máy,
  xem lịch sử, copy Session ID/liên kết, chuyển folder, xuất JSON và xóa có xác nhận.
  Liên kết `#session/<id>` mở đúng phiên sau tải lại; Back/Forward chuyển giữa Home và phiên.
  Menu hỗ trợ phím mũi tên, Home/End và Escape; đổi tên lỗi giữ draft, đóng dialog không
  để phản hồi cũ ghi đè dialog mới. Xuất JSON giữ nguyên nội dung lịch sử.

---

## 🚀 Cài đặt & chạy

```bash
npm install
npm start        # build frontend + chạy daemon ở http://localhost:3188
```

Chế độ phát triển (2 terminal):

```bash
npm run daemon   # backend :3188
npm run dev      # frontend :5173 (proxy /api về :3188)
```

## Gợi ý tác vụ có bước duyệt

Bấm một trong bốn gợi ý sẽ vào chat ngay: tìm hiểu dự án, rà soát thay đổi,
tóm tắt tài liệu và soạn email. Agent đọc context rồi gọi `request_user_input`
khi thiếu thông tin hoặc cần người dùng chọn. Câu hỏi và gợi ý do agent tạo cho
từng tình huống, hiển thị ngay trong chat; người dùng có thể chọn, nhập câu trả
lời hoặc trả lời bằng ô soạn tin. Tool chờ câu trả lời rồi tiếp tục cùng lượt.

Nếu thiếu project, agent gọi `request_project` để người dùng chọn project có sẵn
hoặc mở bộ chọn thư mục. Ứng dụng dừng lượt standalone và tiếp tục yêu cầu gốc
trong chat mới của project, giữ ranh giới scope. `read_open_documents` đọc đúng
snapshot trong chat, kể cả tài liệu vừa mở sau câu hỏi. Không có popup hoặc form
đầu vào dựng sẵn cho bốn tác vụ.

Trong các chat bắt đầu từ gợi ý, backend buộc thao tác sửa dữ liệu, lệnh shell
và công cụ bên ngoài chờ người dùng duyệt, kể cả chế độ auto/full hoặc quyền đã
lưu. Quy tắc giữ qua lượt tiếp theo, restart, nhánh chat và agent con; DENY vẫn
có ưu tiên. Các công cụ đọc và tạo preview tiếp tục theo quyền thông thường.
Gửi email chỉ khả dụng khi người dùng cấu hình công cụ gửi; gợi ý không cung cấp
tích hợp email riêng. Việc AI hỏi thêm hoặc trình bày đúng bản đề xuất còn phụ
thuộc model; quyền thực thi được chặn bằng code.

Kiểm tra: `npm run test:tasks` và `npm run test:tasks:ui`. Các suite dùng model
giả lập, kiểm tra quyền bằng file thật trong thư mục tạm và UI thật trong Chrome;
không chứng nhận chất lượng bản nháp hay phân tích của model thật.

## Nghiên cứu nguồn trên web

Agent có thể đọc trực tiếp tài liệu công khai và mã nguồn bằng `web_fetch`,
không cần mở trình duyệt hoặc đăng nhập. `source_list` và `source_read` tra lại
bản nội dung đã đọc trong đúng chat/scope, kể cả khi ngữ cảnh đã được nén.
Các lượt đọc vẫn qua kiểm tra quyền và chặn địa chỉ mạng nội bộ; redirect cần
một lượt đọc được duyệt riêng cho URL đích.

Khi bản nháp nghiên cứu thiếu dẫn nguồn đã đọc, harness cho sửa một lần chỉ bằng
văn bản trong ngân sách hiện có. Nếu vẫn thiếu bằng chứng, câu trả lời hiện thông
báo chưa xác minh. Có citation không đồng nghĩa mọi nhận định đã được chứng minh.
Chi tiết và giới hạn kiểm thử: [source research](docs/reports/source-research-2026-10-19.md).

## Browser Use (tùy chọn)

Browser Use có thể bật ngay trong khung Chrome của sky, mặc định tắt. Vào Cài đặt → Tìm kiếm web → Browser Use · Chrome. Cài đặt,
cấu hình domain, quyền, giới hạn và cách tắt nằm trong [docs/browser-use.md](docs/browser-use.md).
Browser hiện tại vẫn hoạt động độc lập; backend mới chưa bật cho chat project.

## 🧪 Kiểm thử

```bash
npm test
```

`npm test` chạy `test_core_real` (DB, FTS5, permission, tool, agent loop, abort),
`test_e2e_suite` (HTTP/SSE, phê duyệt, validation ngôn ngữ, prompt nguyên văn và đổi tên phiên),
`test_appearance` (normalization, theme cũ, locale, source code an toàn),
`test_statistics` và `test_skills_management`. Các suite provider/adapters/secrets
trong `test/` chạy riêng bằng Node.

## Cài đặt giao diện

Mở **Cài đặt** từ sidebar hoặc truy cập `#settings/settings`. Trang full-page có
sidebar tìm kiếm Việt/Anh, điều hướng mobile, cùng các mục Providers, Bộ nhớ,
Kỹ năng, Timeline và Thống kê. Quay lại chat giữ draft và run đang chạy;
nút dừng tác vụ vẫn dùng được trong trang cài đặt.

- Theme sáng/tối/theo hệ thống; accent, neutral, cỡ chữ tin nhắn 12–20 px,
  code theme và Mermaid theme áp dụng ngay vào chat, không chỉ preview.
- Locale theo hệ thống/Việt/Anh áp dụng cho các section cài đặt, không dịch lịch sử.
  Ngôn ngữ phản hồi áp dụng từ run tiếp theo qua system context; model có thể không tuân thủ.
- Tự cuộn chỉ bám đáy trong khoảng 80 px; tắt hoặc cuộn lên đọc lịch sử sẽ không bị kéo xuống.
  Tự mở tool đang chạy tôn trọng lựa chọn đóng/mở thủ công của từng tool.
- Menu chuột phải sao chép phần chọn hoặc source tin nhắn; input, link và code giữ menu native.
  Icon link dùng tài nguyên local. Hoạt ảnh không trì hoãn token và tắt khi hệ thống giảm chuyển động.
- Code giữ khoảng trắng và copy nguyên văn. Mermaid dùng strict mode, source tối đa 32 KiB,
  không nhận cấu hình từ tin nhắn, HTML, callback hay tài nguyên ngoài. Metadata YAML `@{…}`
  và sequence properties/details bị từ chối trước render vì có thể tải image/icon.
  Block đang streaming, không hợp lệ hoặc không an toàn vẫn đọc/copy được dưới dạng source.

Lựa chọn lưu trong `ohmyt_appearance` trên thiết bị và giữ sau F5. Field hỏng được
chuẩn hóa riêng; lỗi ghi localStorage vẫn cho áp dụng trong phiên nhưng báo chưa lưu.
Font antialiasing chỉ có tác dụng thị giác trên macOS; không tải font ngoài.

## 📂 Cấu trúc

```
ohmyt/
├── server/               # Backend daemon (Node, node:sqlite WAL)
│   ├── db.js             # SQLite + FTS5 + providers/models/secrets metadata
│   ├── agent_loop.js     # Vòng lặp ReAct, streaming, báo lỗi thẳng ra chat
│   ├── api.js            # REST + SSE
│   ├── permissions.js    # ALLOW / ASK / DENY
│   ├── tools.js          # fs_*, shell_exec, web_search, memory_*
│   ├── llm.js            # Client Ollama/OpenAI-compatible
│   └── providers/        # registry, gateway, adapters, vault mã hóa
├── src/                  # React 19 + TS + Tailwind
│   └── components/       # Sidebar, HomeView, ChatStage, SettingsPage...
├── skills/               # Agent skills (SKILL.md)
├── data/                 # app.db + secrets (không commit)
└── test/                 # Suite kiểm thử
```

## Cách ly project

File văn bản có thể sửa từng đoạn bằng `fs_edit`: dùng hash từ `fs_read`, kiểm tra
phiên bản trước khi ghi và trả diff. File đã đổi hoặc đoạn khớp không duy nhất sẽ
bị từ chối; `dryRun` cho xem trước. Hộp duyệt hiện nội dung cũ/mới, lịch sử phân
biệt preview với đã ghi. Xem [hợp đồng sửa tệp](docs/architecture/file-edits.md)
để biết giới hạn, xử lý conflict và kiểm thử.

Chat project dùng scope riêng cho bộ nhớ, quyền và công cụ. Lịch sử tách theo session;
những session cùng project dùng chung bộ nhớ project. Không hồi tưởng memory cũ chưa
phân loại. Trong trang Bộ nhớ có bộ lọc scope và nhãn dữ liệu cũ; trang quản lý vẫn
cho chủ máy xem toàn bộ bộ nhớ.

Trên Linux, file tools và shell project chạy qua bubblewrap, tắt network trong
sandbox. Project chặn `shell_host` và toàn bộ background host jobs, kể cả quyền
ALLOW đã lưu hoặc chế độ full. Web search/fetch đi qua chính sách quyền mạng riêng;
tool/plugin chưa hỗ trợ scope vẫn bị chặn. File credentials theo
quy tắc nhận diện bị chặn/che trong sandbox; không bảo đảm nhận diện mọi bí mật.
Project root trùng/lồng nhau hoặc chứa thư mục dữ liệu sky bị từ chối.
Thay root hoặc mất sandbox sẽ báo lỗi, không chuyển sang host. Windows/macOS chưa
có adapter sandbox cho thao tác file/shell project.

Quyền lưu chỉ áp dụng đúng thao tác trong scope, không cấp cho project khác.
Chuyển tiếp tin nhắn giữa project bị chặn; nhánh chat giữ project/model gốc.
Kỹ năng chung được nạp khi cần bằng `skill_load`; kỹ năng có scope chỉ hiện trong
đúng scope đó và không cấp thêm quyền thực thi. Chưa hỗ trợ cấp ngoại lệ đọc secret,
bật mạng shell trong sandbox hoặc chia sẻ giữa project.

Project tự đọc `AGENTS.md` ở thư mục gốc trước request làm việc đầu tiên của mỗi
lượt qua `fs_read` đã phân quyền và sandbox. Chỉ tự đọc file thường, không có
hardlink, tối đa 32 KiB; không theo symlink, không tìm lên thư mục cha hoặc thư mục
cá nhân. DENY hoặc quyền cần hỏi sẽ không bị tự bỏ qua. Nội dung lớn vẫn chịu giới
hạn tool output/ngữ cảnh và không được coi là đã đọc đầy đủ khi bị cắt. Receipt của
lần đọc được giữ trong lịch sử; hướng dẫn repo không tăng quyền hay mở rộng scope.

Memory cá nhân được hồi tưởng chỉ khi còn hiệu lực: profile đã quên, hết hạn hoặc
bị thay thế không được gửi lại cho model. Với Goal, receipt thành công chỉ xác nhận
công cụ đã chạy; nhãn `verified` cần verifier độc lập do host quản lý. Evidence do
model chọn vẫn giữ để review nhưng không tự cấp nhãn đã xác minh toàn bộ yêu cầu.

Migration tạo backup SQLite `*.before-project-isolation-*.bak` với quyền đọc/ghi
chỉ cho chủ file trước khi thêm scope bộ nhớ. Không thay nội dung chat cũ.
Đây là cách ly trong ứng dụng, không phải cam kết bảo mật tuyệt đối trước chủ máy,
mã độc hoặc provider model cloud. Chi tiết và giới hạn nằm trong
`docs/architecture/project-isolation.md`.

## Harness runtime

The daemon now boots through `@deepseek-ai/cordis@4.0.4`, with effect-owned tools,
ordered prompt contributions, lazy scoped skills, canonical tool transcripts,
configurable request/step budgets and safe interrupted-run closure.

- [Harness integration and boundaries](docs/architecture/harness-integration.md)
- [Harness validation and live-model results](docs/reports/harness-full-validation.md)
- [DeepSeek Harness source research](docs/reports/deepseek-harness-research.md)
- Run validation: `npm run test:harness`
- Inspect active plugins: `GET /api/harness`

This adapts DeepSeek's architectural seams to sky; it does not bundle the
DeepSeek application or provide compatibility with every DSH plugin.
