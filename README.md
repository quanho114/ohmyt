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
