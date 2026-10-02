# Lobe Core - Desktop AI Agent (Local-First)

Ứng dụng Desktop AI Agent chạy ưu tiên trên máy cá nhân (**Local-First**), kết hợp:
- **Giao diện người dùng (UI/UX):** Phong cách tối giản, sang trọng, bố cục 3 cột sạch sẽ theo chuẩn **LobeHub**.
- **Agent Daemon Runtime:** Vòng lặp suy luận tác vụ (Agent Loop) với sự kiện streaming SSE theo thời gian thực.
- **Bộ nhớ bền vững:** Tích hợp **SQLite FTS5 Full-Text Search** lưu trữ và hồi tưởng ký ức (Episodic, Semantic, Profile).
- **Hệ thống công cụ & Kỹ năng:** Hỗ trợ công cụ native (`fs_read`, `fs_write`, `fs_list`, `shell_exec`, `web_search`, `memory_save`, `memory_search`) và Agent Skills định dạng `SKILL.md`.
- **Bảo mật & Phân quyền (Human-in-the-loop):** Engine phân loại `ALLOW / ASK / DENY`, hiển thị modal phê duyệt trước khi ghi file/chạy lệnh terminal; nút khẩn cấp **Take Control** ngắt tiến trình tức thì.
- **Mô hình AI linh hoạt:** Tương thích với **Ollama** cục bộ (`qwen2.5:14b`, `llama3.2`...) và API đám mây (OpenAI-compatible), kèm động cơ suy luận nội bộ giúp mọi chức năng hoạt động ngay cả khi offline.

---

## 🚀 Cài đặt & Khởi chạy

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Chạy ứng dụng hoàn chỉnh (Build & Start)
```bash
npm start
```
Ứng dụng sẽ tự động biên dịch giao diện và khởi động Desktop Daemon tại:
👉 `http://localhost:3188`

### 3. Chạy chế độ phát triển (Development)
- Khởi động backend daemon:
```bash
npm run daemon
```
- Khởi động Vite frontend (có Hot Module Replacement):
```bash
npm run dev
```

---

## 🧪 Chạy Kiểm thử Thật (Real Test Suite - 0 Mock Tests)

Dự án được kiểm thử toàn diện từ logic backend, database SQLite, HTTP SSE stream đến giao diện UI:
```bash
npm test
```

Bộ test bao gồm:
1. `test/test_core_real.js`: Kiểm tra SQLite schema, bộ nhớ FTS5, Permission Engine (ALLOW/ASK/DENY), thực thi tool file/shell thật trên đĩa, nạp kỹ năng `SKILL.md`, chu trình Agent Loop và ngắt tiến trình Take Control.
2. `test/test_e2e_http.js`: Kiểm tra giao thức mạng HTTP REST và streaming sự kiện thời gian thực qua Server-Sent Events (SSE).
3. `test/test_e2e_permission.js`: Kiểm tra tương tác phê duyệt quyền của người dùng (Human-in-the-loop).
4. `test/test_ui_audit.js`: Kiểm tra tính toàn vẹn cấu trúc giao diện 3 cột, không đè layout, tương thích dark mode và asset bundle production.

---

## 📂 Cấu trúc thư mục

```
ohmyt/
├── server/               # Backend Daemon (Node/Native Engine)
│   ├── db.js             # SQLite Database (WAL mode & FTS5 Virtual Table)
│   ├── permissions.js    # Permission Engine (ALLOW, ASK, DENY)
│   ├── tools.js          # Native Tool Registry (FS, Shell, Web, Memory)
│   ├── skills.js         # Agent Skills scanner & SKILL.md parser
│   ├── llm.js            # Ollama & OpenAI-compatible Client + Fallback Engine
│   ├── agent_loop.js     # Event-driven Agent Loop Orchestrator
│   ├── api.js            # REST Endpoints & SSE Streaming Bridge
│   └── index.js          # Daemon Bootstrap & Entry point
├── src/                  # Frontend UI (React 19 + TypeScript + TailwindCSS)
│   ├── components/
│   │   ├── Sidebar.tsx   # Cột 1: Quản lý cuộc trò chuyện & trạng thái
│   │   ├── ChatStage.tsx # Cột 2: Khung chat chính & Input thanh lịch
│   │   ├── ChatMessage.tsx # Bubble tin nhắn & thẻ ToolCall Card
│   │   ├── ToolCallCard.tsx# Chi tiết input/output của từng tool
│   │   ├── Inspector.tsx # Cột 3: Timeline, Bộ nhớ FTS5, Skills, Settings
│   │   └── PermissionModal.tsx # Modal cấp quyền can thiệp
│   ├── api.ts            # Client API wrapper
│   ├── types.ts          # Type definitions chuẩn (no any)
│   ├── App.tsx           # Layout 3 cột phân lập
│   └── main.tsx          # React Root
├── skills/               # Thư mục Kỹ năng (SKILL.md)
│   ├── workspace-analyzer/
│   └── safe-terminal/
├── data/                 # SQLite storage (app.db, app.db-wal)
└── test/                 # Bộ kiểm thử thực tế không mock
```
