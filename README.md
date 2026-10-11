# ohmyt — Trợ lý AI Local-First trên máy của bạn

ohmyt là trợ lý AI chạy trực tiếp trên máy cá nhân: chat với nhiều model
(Ollama local hoặc API cloud qua proxy của bạn), đọc/ghi tệp, chạy lệnh
terminal, tìm kiếm web và ghi nhớ dài hạn — với phê duyệt của bạn trước
mọi thao tác nhạy cảm.

- **Màn home kiểu LobeHub:** lời chào, composer lớn, gợi ý, chủ đề gần đây.
- **Nhiều provider & model:** Ollama, OpenAI, Anthropic, Google Gemini,
  OpenAI-compatible, Custom — thêm/sửa API key trong Cài đặt, key lưu mã
  hóa AES-256-GCM trên máy (`data/secrets.enc.json`).
- **Agent Loop thật:** gọi tool đa bước (tối đa 5 bước/lượt), streaming
  token qua SSE, lỗi API báo thẳng ra chat.
- **Human-in-the-loop:** chính sách `ALLOW / ASK / DENY` theo mẫu lệnh,
  modal phê duyệt, nút Take Control dừng tác vụ tức thì.
- **Bộ nhớ dài hạn:** SQLite + FTS5 (profile / semantic / episodic), tự
  hồi tưởng vào system prompt.
- **Giao diện:** sáng/tối + chỉnh accent, neutral, font chữ, code theme,
  Mermaid; code highlight + render sơ đồ ngay trong chat.
- **Projects:** bấm Thêm project ở sidebar để chọn thư mục trên desktop hoặc nhập đường dẫn tuyệt đối trên máy chạy ohmyt ở bản web. Project được lưu cùng dữ liệu ứng dụng; thêm xong mở chat ngay, nút + tạo thêm chat trong project. Agent dùng thư mục project cho thao tác tệp và lệnh; chat tách nhánh giữ project gốc.
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

## Browser Use (tùy chọn)

Browser Use có thể bật ngay trong khung Chrome của ohmyt, mặc định tắt. Vào Cài đặt → Tìm kiếm web → Browser Use · Chrome. Cài đặt,
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

Chat project dùng scope riêng cho bộ nhớ, quyền và công cụ. Lịch sử tách theo session;
những session cùng project dùng chung bộ nhớ project. Không hồi tưởng memory cũ chưa
phân loại. Trong trang Bộ nhớ có bộ lọc scope và nhãn dữ liệu cũ; trang quản lý vẫn
cho chủ máy xem toàn bộ bộ nhớ.

Trên Linux, file tools và shell project chạy qua bubblewrap, tắt network, chặn
shell_host, web search và tool/plugin chưa hỗ trợ scope. File credentials theo
quy tắc nhận diện bị chặn/che trong sandbox; không bảo đảm nhận diện mọi bí mật.
Project root trùng/lồng nhau hoặc chứa thư mục dữ liệu ohmyt bị từ chối.
Thay root hoặc mất sandbox sẽ báo lỗi, không chuyển sang host. Windows/macOS chưa
có adapter sandbox cho thao tác file/shell project.

Quyền lưu chỉ áp dụng đúng thao tác trong scope, không cấp cho project khác.
Chuyển tiếp tin nhắn giữa project bị chặn; nhánh chat giữ project/model gốc.
Kỹ năng chung hiện tắt trong project vì chưa có hợp đồng scope cho skill/plugin.
Chưa hỗ trợ cấp ngoại lệ đọc secret, bật mạng hoặc chia sẻ giữa project.

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
- [Harness validation and live-model results](docs/architecture/harness-full-validation.md)
- [DeepSeek Harness source research](docs/architecture/deepseek-harness-research.md)
- Run validation: `npm run test:harness`
- Inspect active plugins: `GET /api/harness`

This adapts DeepSeek's architectural seams to ohmyt; it does not bundle the
DeepSeek application or provide compatibility with every DSH plugin.
