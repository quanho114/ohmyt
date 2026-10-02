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

`test_core_real` (DB, FTS5, permission, tool thật, agent loop, abort),
`test_e2e_suite` (HTTP + SSE + phê duyệt), `test_ui_audit`,
`test_settings_render`, `test_statistics`, `test_secrets_persist`...

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
