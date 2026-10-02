# Tóm tắt điều hành  
Chúng tôi đề xuất một kiến trúc **AI Agent local-first trên desktop** với giao diện người dùng cao cấp (theo kiểu LobeHub) và khả năng kết hợp cả LLM cục bộ và truy cập web. Nền tảng sẽ bao gồm: giao diện frontend (PWA/desktop app), daemon agent runtime (harness) quản lý phiên và luồng sự kiện, cơ chế quản lý bộ nhớ và chỉ mục nhúng (vector store), hệ thống công cụ (MCP, chức năng, skills), cùng lớp tự động hóa desktop (API, CLI, Accessibility, DOM, Vision). Hệ thống hỗ trợ cả mô hình LLM cục bộ (ví dụ chạy bằng llama.cpp, Ollama) và đám mây (OpenAI, Anthropic, v.v). Hơn nữa, tích hợp RAG (retrieval-augmented generation) cho tài liệu và tìm kiếm web. Công nghệ đề xuất gồm TypeScript/React (UI), Rust hoặc Go (daemon), SQLite/Postgres + vector DB, giao diện MCP (JSON-RPC/SSE), và packaging bằng Tauri cho desktop. Dự án được chia thành các giai đoạn phát triển: prototyping, MVP, mở rộng tính năng (DL) với ước lượng thời gian từ vài tuần đến vài tháng mỗi giai đoạn. 

# So sánh LobeHub, DeepSeek, Hermes và Open WebUI  

| **Thuộc tính**      | **LobeHub**                                | **DeepSeek Harness (DSH)**                  | **Hermes Agent**                           | **Open WebUI**                                            |
|---------------------|--------------------------------------------|---------------------------------------------|--------------------------------------------|-----------------------------------------------------------|
| **Agent-harness**   | Nền tảng đám mây/PWA. Agent cấu hình qua web chat, hỗ trợ group agents. Desktop self-host qua Docker/PWA. | Khung agent **“mọi thứ là plugin”** (dựa trên Cordis). Có bản desktop (Tauri) và WebUI. | Tiện ích CLI/TUI và ứng dụng desktop (Mac/Win/Linux). Gửi/nhận tin qua nhiều kênh (Telegram, Slack, CLI). | Ứng dụng web/PWA. Cung cấp giao diện chat + terminal. Chạy cục bộ hoặc server. Hỗ trợ Ollama, OpenAI, llama.cpp, v.v. |
| **Quản lý Memory**  | **Personal Memory**: bộ nhớ cá nhân, cấu trúc, có thể chỉnh sửa (white-box). Tập trung learning liên tục. | Tích hợp bộ nhớ qua **MCP** (Model Context Protocol). Cho phép kết nối Memorinix, Engram, v.v. (không có bộ nhớ tích hợp sẵn). | Bộ nhớ dai dẳng trên máy (SQLite + FTS). Tự sinh và cải thiện kỹ năng (skill) từ kinh nghiệm. Hỗ trợ tìm kiếm qua FTS5 và LLM summarization. | Hàm *memory* gốc (adaptive memory) cho phép lưu, tìm và xoá nhớ. Ví dụ: UI Open WebUI hiển thị khi lưu/truy xuất nhớ. |
| **UX/UI**           | Giao diện web/tương tác cao cấp, responsive. Xây dựng trên component library hiện đại (React, Tailwind, Framer). Tập trung trải nghiệm “sạch và sang” kiểu LobeHub. | Giao diện plugin-driven. WebUI hiện đại, hỗ trợ đăng nhập workspace, phân quyền. Có plugin manager gọn gàng (xem hình dưới). | Giao diện đa nền tảng: CLI/TUI mạnh (autocomplete, slash commands, streaming output) và app desktop tối giản. Tích hợp UI chat trên Telegram/Slack/Signal, dùng giao diện dòng lệnh khi cần. | PWA hoàn chỉnh (chat + terminal). Giao diện đơn giản, dễ tuỳ chỉnh. Hỗ trợ **Open Terminal** nhúng shell, quản lý session, RAG, plugins. Ưu tiên tính riêng tư và phi tập trung. |
| **Mô hình Công cụ / Kỹ năng** | **MCP-compatible plugins**: hỗ trợ >10.000 *skills* và công cụ theo chuẩn mở. Tích hợp tác vụ đa dạng (Calendar, Docs, APIs). Có hệ thống *Agent Builder* tự động cấu hình. | **Plugin System (Cordis)**: Mọi chức năng như tools, skills, UI đều là plugin. Công cụ shell, file ops, tools như web search… Được phân quyền qua policy. | **Skills tự sinh & RPC**: Tự tạo kỹ năng (scripts Python) từ hội thoại. Tool system cho phép *đa tiến trình phụ trợ* (subagents) chạy song song. Gọi hàm qua RPC (Python). Có sẵn các công cụ như web search, vision, TTS. | **Plugin/Tools**: Hỗ trợ *Pipes*, *Filters*, *Actions*, tích hợp *Knowledge Base* (RAG), *Open Terminal*. Cho phép thêm hàm (functions) qua giao diện. Ví dụ, “Adaptive Memory” là hàm bổ sung. Theo kiến trúc MCP, bất kỳ công cụ nào tuân chuẩn cũng tích hợp được. |
| **Khả năng chạy cục bộ** | Hỗ trợ **self-host** (Docker, cloud). Tuy nhiên LLM phụ thuộc API (OpenAI, Anthropic). Không có LLM offline tích hợp sẵn. | **Local-first**: chạy hoàn toàn trên máy (desktop/WebUI). Hỗ trợ LLM nội bộ qua llama.cpp hoặc Ollama. Không phụ thuộc Internet (ngoại trừ khi cần).
| **Hermes**           | Chạy ở cả local hoặc cloud (chia sẻ mô hình qua Nous Portal), có chế độ không dùng GUI. | 
| **Open WebUI**   | **100% local/đám mây linh hoạt**: Kết nối Ollama (offline) hoặc API (OpenAI). Chạy cục bộ (Docker/PWA) hoặc trên server. |

*Nguồn:* LobeHub tự giới thiệu “agent như đơn vị công việc” và **Personal Memory** cấu trúc; DeepSeek Harness là phần mềm mã nguồn mở “mọi thứ là plugin” (trên nền Cordis) chạy dưới dạng web app/desktop; Hermes nhấn mạnh bộ nhớ dai dẳng, tự sinh kỹ năng, giao diện CLI+messaging; Open WebUI chạy cục bộ 100%, hỗ trợ Ollama, và cung cấp các công cụ như terminal, RAG, plugin theo chuẩn MCP. 

## Kiến trúc hệ thống đề xuất  
```mermaid
graph LR
  subgraph Frontend
    U[User] -- chat/API --> UI[Web/PWA GUI]
    UI -->|JSON/SSE| Backend
  end
  subgraph Backend/Daemon
    Backend((Agent Runtime))
    Backend --> GPT[LLM (local/remote)]
    Backend --> Memory[(Memory DB)]
    Backend --> Tools
    Memory -.->|vector index| Embeddings[(Vector Store)]
    Tools --> OS[OS/API/CLI/Browser/Screen]
    Tools --> ModelContext[MCP Servers]
    OS --> Hardware((PC/Desktop))
  end
  U -- tooling --> Tools
```
- **Frontend (UX/UI):** Ứng dụng web (PWA) hoặc native (Tauri) với giao diện trò chuyện, menu, bảng điều khiển (Agent Activity, Run Timeline, v.v.). Ứng dụng giao tiếp với backend qua WebSocket/SSE để nhận phản hồi theo luồng (streaming) và giao tiếp IPC/HTTP cho API.
- **Backend/Daemon:** Một tiến trình nền (“Agent Runtime”) điều phối hội thoại, quản lý state, phiên (session) và luồng sự kiện (event stream). Nhận prompt từ UI, gọi LLM (cục bộ qua llama.cpp/Ollama hoặc cloud qua OpenAI/API), xử lý kết quả, lưu log. Bên cạnh đó, runtime tích hợp các **công cụ và kỹ năng** thông qua MCP hoặc thư viện nội bộ; các tool có thể là: dòng lệnh (CLI), REST API, điều khiển GUI (Automation, Accessibility), DOM scripting (browser automation), nhận diện hình ảnh (Vision) v.v.  
- **Bộ nhớ & RAG:** Bao gồm kho dữ liệu nhúng (*vector store*) và cơ sở dữ liệu quan hệ (SQLite/Postgres) để lưu kết quả, phiên, lịch sử hội thoại và **memory**. Hệ thống lưu trữ hai loại bộ nhớ: ngắn hạn (trong phiên) và dài hạn (knowledge base). Vector store (ví dụ SQLite FTS5 hoặc Postgres+pgvector) được dùng để truy vấn RAG qua embedding của prompt.
- **MCP (Model Context Protocol):** Chuẩn kết nối agent với dịch vụ/đối tác bên ngoài. Các công cụ tuân chuẩn MCP (qua stdio hoặc HTTP+SSE) sẽ tự lộ diện server, runtime tạo client kết nối. MCP cung cấp “tools” (hàm thực thi), “resources” (dữ liệu) và “prompts” theo spec. Ví dụ: LobeHub đề cập kho plugin “MCP-compatible”, DeepSeek dùng `@dsh-mcp-client` để tích hợp bộ nhớ bên ngoài.
- **Luồng thông tin (Events/Streaming):** Mọi hành động được ghi lại dưới dạng event. Người dùng gửi yêu cầu (user message) ⇒ runtime khởi tạo phiên, luồng chính (`Run`). Trong quá trình này, agent có thể gửi hàng loạt event: bắt đầu model, nhận partial token (stream), gọi tool (`ToolCall`), nhận kết quả, ghi nhớ, v.v. (Xem mục “Sự kiện & Giao thức” bên dưới). UI hiển thị kết quả lần lượt cho người dùng (streaming response) và cập nhật timeline (đường thời gian) của các sự kiện.

## Chi tiết Mô hình dữ liệu  
Thiết kế cơ sở dữ liệu song song (SQLite/Postgres + vector index) có thể bao gồm các bảng chính:
- **agents** (agent_id, name, config, model, created_at) – thông tin tác tử AI.
- **sessions** (session_id, agent_id, user_id, status, started_at, ended_at).
- **messages** (msg_id, session_id, sender {user/agent/system}, text, timestamp).
- **runs** (run_id, session_id, user_msg_id, status, created_at, completed_at).
- **events** (event_id, run_id, type, detail_JSON, timestamp) – lưu mọi sự kiện (ví dụ: `ModelStarted`, `TextDelta`, `ToolCallStarted`, `ToolCallCompleted`, `MemoryRead`, `MemoryWrite`, `RunFinished`, v.v.).
- **tools** (tool_id, name, description, manifest_JSON) – mô tả công cụ (tên, interface, chuẩn MCP hay khác).
- **skills** (skill_id, name, description, files path) – định nghĩa skill (theo định dạng Agent Skills với SKILL.md).
- **permissions** (policy_id, pattern, action) – chính sách cho phép/yêu cầu quyền (pattern tuỳ chỉnh theo nhóm tool, action ∈ {ALLOW, ASK, DENY}).
- **memory_entries** (mem_id, agent_id, type, content, embedding, created_at) – bộ nhớ dài hạn; có thể lưu text và vector embedding để tìm kiếm.
- **files** (file_id, session_id, path, content_blob) – các file liên quan workspace (nếu cần agent thao tác).
  
**Ví dụ vector index:** Cột *embedding* trong `memory_entries` dùng dạng vector (pgvector hoặc SQLite FTS). Bộ nhớ dài hạn có thể tạo index cosine theo embedding để truy vấn ngữ nghĩa (RAG).  

Mô hình trên cho phép ghi nhận chi tiết mọi tương tác và dữ liệu cần thiết để tái khởi động *resumable runs*. Ví dụ, một phiên bị gián đoạn có thể tái tục dựa vào các bảng session/run events đã lưu.    

## Luồng sự kiện & Giao thức API  
Giao tiếp giữa UI và daemon backend có thể dùng WebSocket/SSE (để streaming responses và event realtime) kết hợp REST/HTTP cho cấu hình. Ví dụ một số event JSON mẫu:  
```json
{ "type": "RunStarted", "run_id": 123, "prompt": "Tóm tắt file.", "timestamp": "2026-10-02T10:00:00Z" }
{ "type": "TextDelta", "run_id": 123, "content": "Đây là tóm tắt:", "partial": true, "timestamp": ... }
{ "type": "ToolCallStarted", "run_id": 123, "tool": "shell", "command": "ls -la", "timestamp": ... }
{ "type": "ToolCallCompleted", "run_id": 123, "tool": "shell", "result": "file1.txt\nfile2.txt\n", "timestamp": ... }
{ "type": "PermissionRequest", "run_id": 123, "tool": "browser", "action": "navigate", "target": "https://example.com", "timestamp": ... }
{ "type": "MemoryWrite", "run_id": 123, "content": "User có biết sử dụng Python", "timestamp": ... }
{ "type": "RunCompleted", "run_id": 123, "status": "finished", "timestamp": ... }
```  
Ví dụ luồng API (theo WebSocket) có thể là: **User→UI (HTTP POST)** yêu cầu tác vụ; UI phát tới Backend; Backend xác định tools cần dùng, gửi **tool calls→đến MCP/local provider**; Backend nhận kết quả, gửi trả dưới dạng streaming events tới UI; UI hiển thị lần lượt kêt quả và cập nhật timeline.  

Giao thức MCP: Backend sẽ tạo MCP Client (qua stdio hoặc HTTP) kết nối với một hoặc nhiều **MCP Server** (ví dụ scraper web, tài liệu, job runner). MCP Host (agent runtime) dùng JSON-RPC để gọi `server/discover`, `tool/execute`, v.v..  

## Mô hình chính sách Quyền (Permission)  
Cần một engine phân quyền tinh vi: ví dụ phân loại theo nhóm công cụ (**shell**, **browser**, **file**…) và gắn nhãn `ALLOW`, `DENY`, hoặc `ASK`. Mặc định có thể để **ASK** cho các công cụ nhạy cảm, để user quyết định khi agent muốn dùng. Ví dụ chính sách YAML:  
```yaml
policies:
  - pattern: "os:.*"       # tất cả các công cụ hệ thống
    action: ask
  - pattern: "browser:*"   # công cụ duyệt web
    action: ask
  - pattern: "file:read"   # chỉ đọc file
    action: allow
  - pattern: "file:write"
    action: deny
  - pattern: "memory:*"
    action: allow
```
Khi agent gọi tool, runtime kiểm tra pattern; nếu `ASK`, UI sẽ hiện modal yêu cầu user cho phép (giao diện ví dụ bên dưới). DeepSeek có cơ chế tương tự (“Active Permission Policy”) – WebUI **hỏi trước** các hành động cần duyệt quyền.  

**Luồng giao diện quyền (UI flow):** Khi agent định thực thi thao tác cần quyền (ví dụ chạy lệnh shell hoặc truy cập web), popup xuất hiện thông báo cho user với thông tin chi tiết (tool, command). User có thể chọn *Cho phép tạm thời*, *Cho phép lần này*, *Từ chối*. Kết quả được gửi lại backend qua API (có thể WebSocket reply) để quyết định tiếp tục hay dừng.  

## Mẫu manifest Công cụ và Kỹ năng  
**Tool manifest (YAML/JSON):** Mỗi công cụ có thể định nghĩa thông tin như tên, phiên bản, mô tả và giao diện (input schema) theo JSON Schema. Ví dụ (YAML):  
```yaml
tool_id: "shell"
name: "Shell Command"
description: "Chạy lệnh hệ thống"
input_schema:
  type: object
  properties:
    command: { type: string, description: "Lệnh shell cần thực thi" }
  required: [command]
output_schema:
  type: object
  properties:
    stdout: { type: string, description: "Kết quả trên stdout" }
```
**Skill manifest (Agent Skills):** Theo chuẩn Agent Skills, mỗi skill lưu trong thư mục riêng với file `SKILL.md` chứa metadata và hướng dẫn. Ví dụ (SKILL.md):
```yaml
name: "Web Search"
description: "Tìm kiếm trên Internet bằng DuckDuckGo API"
version: "1.0"
```
Thư mục skill có thể chứa script thực thi (ví dụ Python), mẫu câu hỏi, dữ liệu tham khảo. Agent runtime sẽ load tên/mô tả trước, và chỉ đọc hướng dẫn chi tiết khi kích hoạt.  

**Interface TypeScript (ví dụ):**  
```ts
interface Tool {
  id: string;
  name: string;
  description: string;
  inputSchema: JSONSchemaType<any>;
  execute(input: any): Promise<any>;
}
```
**Interface Rust (ví dụ):**  
```rust
struct ToolManifest {
    id: String,
    name: String,
    description: String,
    input_schema: Value,  // serde_json
    // ...
}
```
Các manifest này giúp việc thêm mới tool/skill dễ dàng, đồng nhất giữa agent và UI. LobeHub cũng hỗ trợ plugin tuân **MCP** nhằm dễ tích hợp công cụ bên ngoài.

## Giao diện UX/UI đề xuất  
- **Agent Activity (Trò chuyện):** Trung tâm là khung chat giữa người dùng và agent. Các phiên/nhiệm vụ hiện tại hiển thị bên cạnh (sidebar) cho phép chuyển đổi nhanh. Xu hướng: thiết kế clean, sử dụng màu nền sáng, font rõ ràng. (Ví dụ giao diện OpenWebUI hiển thị danh sách model xem tại hình dưới.)  
  - Bên dưới khung chat: streaming response, gắn tag (GPT, ToolOutput), pop-up permission (hỏi user) theo chuẩn.  
- **Run Timeline:** Một panel (ở cạnh hoặc dưới chat) liệt kê lịch sử event của một run: bot message, calls tool, memory read/write, errors. Giúp user theo dõi tiến trình.  
- **Computer View:** Màn hình quản lý workspace và files. Bao gồm file explorer (chọn folder), code editor/terminal nhúng (giống IDE web). (Open WebUI Computer ví dụ, cho phép dùng máy thật qua web.)  
- **Permissions Modal:** Giao diện dialog hiện khi có yêu cầu quyền. Thông tin: chi tiết tool, ví dụ “Agent muốn chạy lệnh: `rm -rf /`. Cho phép?”. Các nút: *Yes/No* hoặc hộp check (*) ghi nhớ quy tắc.  
- **Skills Marketplace:** Danh sách skills/plugin có thể cài (tương tự Extension Marketplace). Mỗi mục hiển thị tên, mô tả, nút install/enable. Giúp người dùng mở rộng khả năng.  

*Hình ví dụ:* Giao diện quản lý plugin của DeepSeek (bên dưới) minh hoạ cách bố trí sạch với panel Plugin Categories, nút cài đặt.  

Các thành phần UI có thể dùng thư viện React component hiện đại (Ant Design, Mantine, hoặc của chính LobeHub). Điều hướng rõ ràng: sidebar cho menu (Agents, Runs, Files, Permissions, Skills), tab hoặc chart để hiển thị logs/metrics đơn giản.  

## Bảo mật và Quyền riêng tư  
- **Local-first & Private by Design:** Dữ liệu của user (conversation, memory, documents) lưu tại máy hoặc server do user kiểm soát. Ví dụ Open WebUI nhấn mạnh chạy trên phần cứng của người dùng, không trao đổi nếu chưa cấu hình. Mọi kết nối ra ngoài (e.g. LLM API, web search) yêu cầu explicit keys.  
- **Xác thực & mã hoá:** Nếu có chế độ multi-user hoặc tổ chức, cần xác thực (OAuth/SSO cho web) và TLS (HTTPS). Mật khẩu/khóa API mã hoá khi lưu (ví dụ KeePass hoặc vault).  
- **Sandboxing:** Các tool nguy hiểm (shell, code execution) chạy trong sandbox (Docker, công nghệ container). Hermes sử dụng container hardening (Docker, Singularity, Modal) để cách ly. App desktop (Tauri) có thể bị giới hạn quyền chỉ truy cập thư mục nhất định.   
- **Credential Handling:** Lưu trữ an toàn khóa API (OpenAI, Google, v.v.), không đẩy lên Git. Trình xác thực OAuth cẩn thận (CSRF tokens).  
- **Resumable Runs:** Đảm bảo rằng khi agent bị dừng (crash hoặc shutdown), trạng thái có thể tái lập từ DB/session. Redis cần backup định kỳ.  
- **Logging & Auditing:** Ghi lại mọi hành động quan trọng (tool calls, quyền, lỗi). Thông tin logs phải rõ ràng, gồm ID phiên, user, hành động, kết quả. Tận dụng OpenTelemetry để dễ giám sát. Giám sát thời gian thực (Prometheus metrics, Grafana).  
- **Kiểm thử & Đánh giá an ninh:** Thực hiện penetration test, fuzzing tool, review component (đặc biệt WebUI/React với XSS). Chạy static analysis trên mã native (Rust/Go) để tránh vuln memory.  
- **Threat Model:** Các mối đe dọa chính gồm: lộ API key (vì agent có thể khéo léo lấy thông tin), XSS trong chat (nếu cho chạy HTML), truy cập trái phép vào hệ thống (SSH/WebUI). Phòng thủ theo nguyên tắc least privilege: agent không có quyền root, UI giới hạn mọi tương tác ra ngoài phải xin phép user.  

## Lộ trình phát triển và ước lượng  

1. **Phase 1 – Prototype (1–2 tháng):**  
   - Xây dựng UI cơ bản chat interface (React/PWA), kênh streaming.  
   - Triển khai backend Python/TS đơn giản: gọi LLM (gắn sẵn mô hình đơn giản, ví dụ llama.cpp), lưu session SQLite.  
   - Kết nối 1–2 công cụ: ví dụ `shell` (dịch vụ nội bộ) và `browser` (dùng Puppeteer). MVP cho phép chat + gọi công cụ.  
   - Ước lượng: 4–6 tuần cho UI/daemon, 2 tuần tích hợp model + môi trường.  

2. **Phase 2 – Hệ thống nền tảng (2–3 tháng):**  
   - Thiết kế toàn diện schema DB (SQLite/Postgres) và vector store (FTS5 hoặc pgvector).  
   - Tích hợp MCP (client & 1–2 server) để mở rộng công cụ.  
   - Xây dựng engine phân quyền (YAML policy, UI flow). Làm sẵn giao diện Permission modal.  
   - Triển khai memory linh hoạt (ngắn và dài hạn), ví dụ cục bộ viết vào DB và nhúng.  
   - Xây dựng hệ thống plugin/skill: ví dụ hỗ trợ cài skill theo chuẩn Agent Skills.  
   - Hoàn thiện event streaming (WebSocket/SSE) với logging (OpenTelemetry).  
   - Packaging: đóng gói dưới dạng Tauri/Electron cho desktop (Win/macOS/Linux).  
   - Ước lượng: 8–12 tuần.  

3. **Phase 3 – Tính năng nâng cao & ổn định (3–4 tháng):**  
   - Thêm chế độ multi-agent (agent nhóm hợp tác như LobeHub Agent Groups).  
   - Cải tiến memory (forgetting policies, multi-type: semantic, episodic). RAG: tích hợp vector DB chuyên dụng (Milvus/Weaviate) nếu cần.  
   - Automation nâng cao: lập lịch (cron-like), pipeline chạy ngầm (Hermes subagents).  
   - Hoàn thiện UX: Dashboard Activity (metrics, logs), Marketplace skills, hỗ trợ UI drag-drop.  
   - Security review: hardening, test bảo mật, CI/CD pipeline với kiểm thử.  
   - Triển khai CI/CD cho builds desktop/web, container. Xây dựng hình ảnh Docker, cập nhật tự động.  
   - Tích hợp CI (GitHub Actions) test tự động, code coverage.  
   - Ước lượng: 12–16 tuần.  

**Tổng quan:** Với một nhóm core (khoảng 4–6 người), mỗi phase trên là lộ trình khả thi. Tổng thời gian có thể khoảng 6–9 tháng để đạt tính năng tương đương LobeHub/DeepSeek cơ bản, và 12+ tháng để hoàn thiện mọi yêu cầu nâng cao. Trọng tâm ban đầu là kiến trúc module (dễ mở rộng) và UX thân thiện, sau đó mở rộng hệ sinh thái tools và tối ưu bảo mật.

**Chú ý:** Trong toàn bộ quá trình, ưu tiên duy trì hướng “local-first, secure-by-design” và sử dụng **tài liệu chính thức** (MCP spec, Agent Skills spec, docs DSH/Hermes) để đảm bảo tính tương thích, cũng như tham khảo UI LobeHub và OpenWebUI để giữ thiết kế sạch, hiện đại. 

