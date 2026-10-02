# Tóm tắt Dự án (Executive Summary)

Mục tiêu là xây dựng một **Desktop AI Agent “Local-First”** (chạy ưu tiên trên máy cá nhân) với giao diện người dùng **sang – sạch – xịn** giống LobeHub, nhưng tận dụng kiến trúc agent theo kiểu DeepSeek/Hermes. Ứng dụng sẽ bao gồm: **Frontend desktop (Tauri + React/TypeScript)**, **Daemon xử lý agent (Rust host + worker TypeScript/Python)**, **giao thức IPC/streaming sự kiện**, **hệ thống Công cụ (tool) – Kỹ năng (skill) – MCP**, **vòng lặp lập kế hoạch (planner/loop)**, **chiến lược quản lý phiên và bộ nhớ**, **vector indexing**, **cơ sở dữ liệu SQLite**, **chế độ Offline/Hybrid/Remote**, **khả năng search web**, **local LLM (llama.cpp/Ollama) với fallback cloud**, **tự động hóa desktop theo tầng API** (filesystem, shell, accessibility, DOM, vision), **cơ chế phân quyền – sandbox – an toàn**, **manifest chuẩn cho tools/skills**, **tích hợp resumable run & event log**, **UI kiểu LobeChat** cùng **luồng UX** chi tiết (Agent Activity, Run timeline, Approvals, “Take Control”). Kết quả là một **blueprint A→Z** để triển khai sản phẩm: từ MVP đến roadmap hoàn thiện. 

> *Một số nguồn tham khảo chính:* LobeHub CLI docs (quản lý agent, knowledge base, đa phương tiện), DeepSeek Harness (mô hình plugin hóa mọi thứ), Hermes Agent docs (bộ nhớ bền vững, đa nền tảng, kỹ năng tự tạo), OpenWebUI (chạy local, plug-in Python, RAG, thị giác, tìm kiếm), Agent Skills Spec (manifest/`SKILL.md`). Chúng tôi cũng học hỏi cách bố trí UI 3 cột của LobeChat (mô phỏng phong cách LobeHub). 

# 1. So sánh các nền tảng agent hiện có

| **Tính năng / Nền tảng**       | **LobeHub**                                           | **DeepSeek Harness**                        | **Hermes Agent**                                           | **OpenWebUI**                                     |
|-------------------------------|-------------------------------------------------------|---------------------------------------------|------------------------------------------------------------|----------------------------------------------------|
| **Mở/Đóng (Open-Source)**     | ❌ Đóng (sản phẩm thương mại, CLI thấy đề cập)          | ✔️ Mã nguồn mở (NPM, Node.js)         | ✔️ Mã nguồn mở (MIT, Python)                       | ✔️ Mã nguồn mở (Python, dùng pip)           |
| **Địa điểm chạy**             | 📡 Cloud (web/app) + CLI (internet tuỳ thuộc)          | 🖥️ Local (chạy NodeJS) hoặc Cloud           | 🖥️ Local hoặc Cloud (Docker/SSH/Modal...)         | 🖥️ Local (host trên máy, tập trung vảo giao diện) |
| **UI / UX**                   | 🌐 Web + CLI (UI hiện đại, triệt để agent đội)        | 🌐 Web (NPM command `dsh web`)      | 📱 Desktop + CLI + đa kênh chat (Telegram, Discord…) | 🌐 Web (trình duyệt) trên local, tích hợp RAG, plugin visual  |
| **Đa phương tiện (Multimodal)** | ✔️ (Hỗ trợ text, hình ảnh, video, TTS, ASR via CLI) | ❓ (có thể tích hợp qua plugin)              | ✔️ (Vision, TTS, ASR tích hợp)                | ✔️ (Vision, ASR/TTS, Web search, RAG)          |
| **Quản lý tri thức / KB**     | ✔️ Có Knowledge Bases (tri thức tùy chỉnh cho agent) | ❓ (chưa rõ)                                | ✔️ Memory bền vững (SQLite+FTS) + ngữ cảnh dự án | ❌ (chỉ lưu session chat, không có memory bền)         |
| **Bộ nhớ & Trí nhớ (Memory)**  | ❓ (dựa vào KB, nhưng không ghi nhớ giữa session)       | ❓ (tùy implement)                           | ✔️ Memory hệ thống (episodic, semantic, v.v.) + auto skill               | ❌                                          |
| **Các công cụ (Tool sets)**   | ✔️ Các lệnh CLI (git, upload file, v.v.)              | ✔️ Hỗ trợ plugin (mọi thứ là plugin)   | ✔️ Hơn 60 tool tích hợp (shell, browser, spreadsheet…) | ✔️ Plugin (RAG, API tools, Python functions)         |
| **Hệ thống kỹ năng (Skills)** | ❌ (không rõ)                                          | ✔️ Có khái niệm plugin/kỹ năng (Cordis)       | ✔️ Skills như “procedural memory” (tự tạo, tái sử dụng) | ✔️ Plugins/Toolkits Python (community)         |
| **Tính năng Web/Internet**    | ✔️ Agent có thể link tới web (qua plugin/APl?)        | ✔️ Có thể gọi APIs web qua plugin           | ✔️ Tìm kiếm & duyệt Web tích hợp               | ✔️ Tích hợp RAG (thu thập nội dung web)         |
| **Đa nền tảng giao tiếp**     | ❌ (chủ yếu web, CLI)                                 | ❌ (chủ yếu web/local)                       | ✔️ CLI + Hơn 20 nền tảng chat (Telegram, Discord, Signal…) | ✳️ Không chat (chủ yếu UI web cho user)    |
| **Bảo mật & Phân quyền**      | ❓ (không rõ)                                          | ❓ (phân quyền theo plugin)                  | ✔️ Approval/cấp phép lệnh, containerization  | ❓ (mã riêng, chưa thấy đề cập rõ)             |

- **LobeHub** (đám mây thương mại): Tập trung vào điều phối **đội ngũ agent** 24/7 với **giao diện web/CLI hiện đại**. Hỗ trợ **quản lý agent**, **knowledge bases** (upload tài liệu), và **sản sinh nội dung đa phương tiện** (text, image, video, TTS, ASR) từ CLI. Là sản phẩm đóng (tài liệu chính thức hiếm thấy), ưu điểm là UX tinh tế, nhưng nhược điểm là phụ thuộc cloud và không rõ về khả năng chạy offline.  
- **DeepSeek Harness**: Mã nguồn mở của DeepSeek (Node.js). **Mọi thành phần là plugin** (tool, model, skill, session…). Kiến trúc mở, dễ mở rộng nhưng đang trong giai đoạn preview. Có UI web demo, CLI hỗ trợ qua `dsh`, vẫn còn thiếu tài liệu giao diện người dùng. Chủ yếu hướng tới dev integrate.  
- **Hermes Agent (Nous Research)**: Mã nguồn mở (Python). **Focus mạnh vào bộ nhớ bền vững, học lặp (learning loop), kỹ năng tự động tạo**. Hỗ trợ **đa nền tảng** (CLI, Telegram, Discord, Slack, v.v.). Hệ thống memory dùng SQLite+FTS5, skills theo chuẩn **procedural memory**. Tích hợp sẵn hàng loạt **tool hỗ trợ tự động hóa** (shell, browser, web search, visión, image gen, TTS) và **MCP** (kết nối server tool ngoài). Có cơ chế **bảo mật** (cần duyệt lệnh và cô lập container). Rất đầy đủ cho agent “nghiệp vụ lớn”.  
- **OpenWebUI**: Mã nguồn mở (Python). Ban đầu là **giao diện chạy AI trên local**. Kết hợp **nhiều mô hình** (cục bộ hoặc cloud), **plugins Python** mở rộng chức năng, và **hỗ trợ RAG (search)**. Không phải agent “tự chủ”, mà là nền tảng để “tự sở hữu AI”. Tập trung vào UI thân thiện, quản lý model, plugins, logs, không có tính năng nhân cách hóa agent hay memory bền.  

Bảng trên tổng hợp ưu – nhược và chức năng chính của từng nền tảng để thấy xu hướng: **đông xu hướng agent hiện nay** (persistent memory, multi-modal tools, an toàn) và **giao diện ưa dùng** (web hiện đại 3 cột như LobeChat). Nhu cầu của dự án là kết hợp **tốt nhất** các ưu điểm: *UX LobeHub/LobeChat + khả năng mạnh mẽ của Hermes/DeepSeek + Local-first*.

# 2. Kiến trúc tổng thể của Desktop Agent

**Kiến trúc đề xuất:** Một ứng dụng desktop local-first kết hợp giữa giao diện (frontend), daemon xử lý agent (backend), cơ sở dữ liệu cục bộ, bộ công cụ làm việc (tools), và kết nối tùy chọn tới Internet/đám mây. Mô tả tổng thể (mermaid):

```mermaid
graph LR
  subgraph Desktop Client (Tauri/React)
    UI[User Interface (Chat, Agents, Files, Memory)]
    UI -->|IPC/HTTP| AgentDaemon
  end

  subgraph Agent Daemon (Rust Host)
    A[Agent Runtime / Harness]
    T[Tauri IPC Worker]  
    A --> AgentCore{Agent Loop}
    AgentCore --> ContextBuilder
    AgentCore --> Planner
    AgentCore --> ToolLoop
    AgentCore --> MemoryManager
  end

  subgraph Local Resources
    ModelsLocal[Local LLM (llama.cpp/Ollama)]
    DB[SQLite + Vector Store]
    FS[Local File System, Projects]
    Tools[Built-in Tools (CLI, Browser, Clipboard...)]
    UI <-- FS
    UI <-- DB
    A <--> ModelsLocal
    A <--> DB
    A <--> FS
    A <--> Tools
  end

  subgraph Internet/Cloud
    Search[Web Search / Browser]
    ModelsCloud[Cloud LLM APIs]
    A <--> Search
    A <--> ModelsCloud
  end
```

- **Desktop Client (UI):** Xây bằng **Tauri + React/TypeScript**. Giao diện gồm sidebar (Chats, Agents, Files, Memory, Skills, MCP) và khung chính (hội thoại/chat). Hiện đại, hỗ trợ dark/light mode, mã code đánh dấu, ảnh động mượt mà. Giao tiếp với Daemon qua IPC (Rust-side) hoặc HTTP nội bộ. Có các component: **Agent Activity**, **Timeline Run**, **Approvals**, **Take Control**.  
- **Agent Daemon:** Chương trình nền bằng **Rust** (cho hiệu năng, bảo mật, không gian tên) chứa **Agent Runtime**. Runtime có thể triển khai như một worker hoặc launch Python process (hoặc TS) cho các tác vụ AI. Đảm nhận: *lịch phiên* (sessions), *nhóm run/turn*, *vòng lặp agent*, *giao tiếp LLM*, *gọi tool*, *cập nhật memory*, *ghi log sự kiện*. Ví dụ luồng xử lý:

```mermaid
sequenceDiagram
  participant User
  participant Runtime as Agent Runtime
  participant Model
  participant Tool
  participant MemoryDB as Memory/DB

  User->>Runtime: "Nhiệm vụ: tổng hợp báo cáo X"
  Runtime->>MemoryDB: truy vấn ngữ cảnh liên quan (episodic/semantic)
  Runtime->>Model: gửi prompt với ngữ cảnh
  Model-->>Runtime: quyết định (text)
  alt Nếu cần Tool
    Runtime->>Tool: gọi tool (vd. filesystem.search(...))
    Tool-->>Runtime: trả về kết quả
    Runtime->>Model: prompt tiếp theo (kết quả bổ sung)
    ...
  end
  Model-->>Runtime: phản hồi cuối cùng
  Runtime-->>MemoryDB: ghi nhớ (episodic update)
  Runtime-->>User: Hiển thị kết quả
```

- **Mô hình đa chế độ:** Agent có *3 chế độ* linh hoạt:  
  - **Local-Only:** Mọi thứ trên laptop; dùng LLM cục bộ (llama.cpp/Ollama) và tool offline. Không gọi web hay cloud model.  
  - **Hybrid (Local + Web):** Runtime, memory, file local; nhưng agent có thể sử dụng internet để **tìm kiếm/browsing web** và/hoặc gọi **LLM đám mây** (OpenAI, Anthropic, Nous Portal) nếu cục bộ yếu.  
  - **Remote/Server:** Luôn chạy trên máy chủ (Docker/Cloud) với user giao tiếp từ xa (SSH/CLI/Telegram...). Có lợi cho tác vụ dài và không phụ thuộc laptop.

Căn cứ Hermes: *“It lives wherever you put it — a $5 VPS, ... or serverless... Talk via Telegram while it works on a cloud VM you never SSH into.”*. Agent này cũng tương tự: local-first nhưng không cấm cloud. Quyền truy cập internet/call model có thể được điều chỉnh trong cài đặt (cấp phép hoặc tắt).

# 3. Vòng lặp Agent và Giao thức Sự kiện

Thay vì một “chat request” đơn giản, agent dùng **vòng lặp đa bước** (planning + tool usage) với sự kiện **event-driven**. Kiến trúc vận hành theo kiểu Hermes (Python) kết hợp Cordis (plugin) và DeepSeek (plugin). Các bước chính:

1. **Xây dựng ngữ cảnh (Context Building):** Kết hợp tin nhắn hội thoại gần nhất (context window), **working memory** (hồi quy gần đây), **long-term memory** (gọi database, vector search) và thông tin liên quan (file dự án, cài đặt, agents khác).  
2. **Lập trình/Quyết định (Planner):** Gửi prompt tới LLM để LLM suy luận “tiếp theo agent nên làm gì?”, có thể trả về text (dành cho người dùng) hoặc **tool call** (ví dụ: `{ "tool": "browser.search", "input": "AI agent platforms" }`).  
3. **Cơ chế Tool Loop:** Khi LLM yêu cầu tool, agent kiểm tra **permission** (xem phần 5), rồi chạy tool tương ứng, thu nhận kết quả (observation). Trả kết quả này lại LLM để tiếp tục suy luận. Có thể gọi nhiều tool tuần tự.  
4. **Hoàn thành và Trả lời:** Sau khi các tool hoàn thành, LLM cho ra kết quả cuối cùng. Agent gửi tin nhắn tới UI, ghi log sự kiện cuối. Cập nhật memory nếu cần (ghi nhớ thông tin mới, tiến trình task).  

Sơ đồ tuần tự (sequence) minh họa luồng tương tác:

```mermaid
sequenceDiagram
    participant User
    participant Daemon as Agent Daemon
    participant Memory
    participant Model
    participant Permissions
    participant Tool
    participant UI

    User->>Daemon: Gửi lệnh / yêu cầu
    Daemon->>Memory: Tra cứu context liên quan (ví dụ: session, KB)
    Daemon->>Model: LLM tạo prompt (kèm context)
    Model-->>Daemon: Kết quả ban đầu (có thể chứa yêu cầu tool)
    alt Gọi Tool
      Daemon->>Permissions: Kiểm tra policy
      alt Được phép
        Daemon->>Tool: Thực thi công cụ (vd. search, shell, read file)
        Tool-->>Daemon: Kết quả công cụ (dữ liệu/feedback)
        Daemon->>Model: LLM nhận kết quả và tiếp tục suy luận
        Model-->>Daemon: Kết quả tiếp theo (có thể tiếp tục gọi tool)
      else Bị chặn
        Daemon->>UI: Yêu cầu cấp phép (dialog)
        alt User đồng ý
          ... (tiếp tục như trên) ...
        else User từ chối
          Daemon->>UI: Trả về lỗi/gián đoạn
          Daemon-->>User: Thông báo bị từ chối
          return
        end
      end
      loop 
        ... (có thể lặp lại nếu LLM tiếp tục yêu cầu tool) ...
      end
    end
    Daemon->>Model: Nếu không có tool nào, nhận câu trả lời final
    Model-->>Daemon: Câu trả lời cuối cùng
    Daemon->>UI: Hiển thị phản hồi
    Daemon->>Memory: Ghi nhớ kết quả/tác vụ đã làm (episodic memory)
```

**Sự kiện (Events) và Logging:** Mỗi bước sẽ phát ra event (ví dụ: `RunStarted`, `ToolCallStarted`, `ToolExecutionCompleted`, `MemoryRetrieved`, `RunCompleted`…). Frontend lắng nghe stream sự kiện để hiện tiến độ cho người dùng (ví dụ: hiển thị dòng “Đang tìm kiếm file…”, hiển thị yêu cầu cấp phép). Thiết kế event-driven cho phép UI *streaming* kết quả từng phần (giống LLM streaming text) và *resume runs* (tạm dừng, hồi phục).  

# 4. Công cụ (Tools), Kỹ năng (Skills) và MCP

- **Tools (Công cụ):** Mỗi công cụ là một hàm có **tên**, **mô tả**, *schema* input/output JSON, và các quyền cần thiết. Ví dụ:

```ts
interface Tool {
  name: string; description: string;
  inputSchema: JSONSchema; outputSchema?: JSONSchema;
  permissions: PermissionRule[];
  execute(input: any, context: ToolContext): Promise<ToolResult>;
}
```

  Các tool cơ bản tích hợp có thể gồm: đọc/ghi file (`fs.read`, `fs.search`), chạy lệnh shell (`shell.exec`), xử lý Git (`git.status`, `git.push`), thao tác trình duyệt (`browser.open`, `browser.click`, `browser.extract`), desktop automation (`os.click`, `os.hotkey`, `desktop.screenshot`), quản lý Clipboard, Notification, API HTTP, v.v. (chi tiết tuỳ nhu cầu). Công cụ có thể chạy nội bộ hoặc qua gói plugin/MCP.  

- **Skills (Kỹ năng):** Là gói kiến thức quy trình định nghĩa cách thực hiện nhiệm vụ phức tạp. Theo chuẩn Agent Skills, một skill là thư mục chứa file `SKILL.md` (metadata + hướng dẫn) và có thể kèm mã script, tài liệu, mẫu. Ví dụ cấu trúc:

  ```
  skills/
  └── excel-analysis/
      ├── SKILL.md           # tên, mô tả, hướng dẫn chi tiết
      ├── manifest.json      # (tuỳ chọn) mô tả tools cần, permissions
      ├── prompts/           # các prompt mẫu
      ├── scripts/           # mã Python thực thi
      ├── templates/         # file template, ví dụ .xlsx
      └── assets/            # tài nguyên phụ trợ
  ```

  **manifest.json** (ví dụ):

  ```json
  {
    "name": "excel-analysis",
    "version": "1.0.0",
    "tools": ["filesystem.read", "filesystem.write", "python.execute"],
    "permissions": {
      "filesystem": { "read": true, "write": "ask" }
    },
    "instructions": "Xử lý dữ liệu Excel: đọc file, tính toán, xuất báo cáo."
  }
  ```
  
  Hermes gọi đây là *procedural memory* – agent có thể **kích hoạt** (activation) một skill khi task phù hợp (dựa trên `name/description`), tải `SKILL.md` vào context, rồi **thực thi** theo hướng dẫn (có thể chạy script). Mục đích: lưu quy trình đã tinh chỉnh để agent dùng lại (giống *macro*). 

- **MCP (và Plugins):** MCP (Multi-Connection/Collaboration Protocol) có thể hiểu là server hoặc nền tảng bên ngoài cho phép agent truy cập thêm công cụ (ví dụ Gartner, vendor APIs). Hermes hỗ trợ gắn MCP server mở rộng toolset. Chúng tôi sẽ thiết kế dưới dạng plugin: agent có registry tool/shell/desktop, và có thể động kết nối MCP để lấy thêm tools. Các plugin (kiến thức, dịch vụ) được quản lý giống tool (có schema JSON).

**Phân phối các tool:** Để agent không cần biết tool từ đâu, có sơ đồ:

```
Built-in Tool ─┬─> Registry → Agent
Skill-bundled  ├─> Registry
MCP Remote    ├─> Registry
Plugin (community) ──┘
```

Chúng ta sẽ duy trì **Tool Registry** cục bộ (SQLite) để tổng hợp metadata tools (từ core app, từ skills, từ MCP servers). Agent gọi tool qua registry, thực thi đối tượng đã đăng ký. 

# 5. Bộ nhớ và Lưu trữ (Session, Memory, Embedding)

Thiết kế lưu trữ cục bộ kết hợp **SQLite + vector index**:

- **Schema chính (SQLite):** Các bảng (ví dụ):

  - `users` (nếu cần multi-user),
  - `agents` (cấu hình agent),
  - `sessions` (thông tin phiên chat: id, agentId, start/end time),
  - `threads` (cuộc hội thoại/runs riêng lẻ trong session),
  - `messages` (tin nhắn gửi/nhận),
  - `runs` (phiên chạy task với event log, status),
  - `run_events` (log chi tiết theo event),
  - `memories` (ghi nhớ – câu, loại, timestamp, liên kết đến session/agent),
  - `skills`, `tools`, `mcp_servers` (cấu hình), 
  - `approvals` (ghi nhận user đã cho phép gì),
  - `files` (danh sách file đính kèm/KB),
  - `artifacts` (file output do agent tạo).
  
  Ví dụ SQL tạo bảng memory (rất đơn giản):

  ```sql
  CREATE TABLE memories (
    memory_id INTEGER PRIMARY KEY,
    agent_id TEXT,
    type TEXT,          -- episodic, semantic, profile, v.v.
    content TEXT,
    reference_id TEXT,  -- khóa liên kết đến đối tượng (vd. file, session)
    timestamp DATETIME,
    embedding BLOB      -- vector nhúng (tùy chọn)
  );
  CREATE VIRTUAL TABLE memories_fts USING fts5(content);
  ```
  
  Hệ vector: Có thể sử dụng extension SQLite vector (nếu có) hoặc tích hợp Weaviate/Pinecone cho tính toán ANN. Small-scale có thể lưu nhúng (32-512 chiều) dưới dạng BLOB và tìm kiếm bằng SQlite Extension hoặc chamfer distance.

- **Các loại memory:** Dựa trên phân loại trong tâm lý học và nội dung agent, chúng ta chia:
  - *Working Memory:* Ngữ cảnh hiện tại, thảo luận vừa rồi (tối đa token window).
  - *Episodic Memory:* Sự kiện, kết quả cụ thể đã xảy ra (ví dụ lần nói chuyện trước, bước làm của agent).
  - *Semantic Memory:* Kiến thức chung của agent (ví dụ agent biết “dự án này dùng Postgres”, hay templates công ty).
  - *Procedural Memory:* Kỹ năng/procedures agent tạo (Agent Skills).
  - *Profile Memory:* Thông tin người dùng/ đặc trưng cá nhân (sở thích, tên, vai trò).
  - *Project Memory:* Ngữ cảnh dự án cụ thể (đường dẫn repo, tài liệu liên quan).
  
  Bộ nhớ lâu dài được lưu ở SQLite+FTS để tìm kiếm text (Hermes dùng SQLite+FTS5 cho “recall”). Các đoạn text quan trọng có thể nhúng embedding để truy vấn vector (như RAG). 
    
- **Nhúng (Embeddings) và RAG:** Khi lưu dữ liệu (file, memory), chúng ta sẽ tính embedding (via local LLM hoặc API) và lưu để truy vấn tương tự (ví dụ dựa trên cosine). Kết hợp FTS (text) và vector để chọn bối cảnh phù hợp. *Ví dụ*: khi truy vấn, ta có thể `SELECT content FROM memories WHERE content MATCH '...'` và/hoặc compute vector so sánh. Tóm lại, chiến lược RAG: lưu ý Hermes dùng LLM tóm tắt khi cần sơ bộ context.

# 6. Tự động hóa Desktop và Công cụ UI (Automation Stack)

Agent desktop cần thực thi thao tác với **hệ điều hành và ứng dụng**. Thiết kế theo tầng ưu tiên:

1. **API Trước (Structured APIs):** Ưu tiên gọi API/cmd có cấu trúc. Ví dụ: đọc file, Git, DB, calendar (thông qua tool FS, tool Git) thay vì UI.  
2. **MCP/Plugin:** Gọi dịch vụ/Broker công cụ ngoài đã cài.  
3. **CLI/Shell:** Thực thi lệnh (Git, ffmpeg, npm, Python script…) qua `shell.exec`.  
4. **API Accessibility hệ điều hành:** Ví dụ Windows UI Automation, macOS Accessibility, AppleScript, D-Bus trên Linux. Cho phép điều khiển GUI (nhận biết button, menu).  
5. **Browser DOM (WebDriver):** Đối với trình duyệt hoặc webapp, dùng Puppeteer/Selenium hoặc Electron cho DOM.  
6. **Máy học Thị giác (Vision):** Cuối cùng, nếu app không có API, dùng screenshot + phát hiện (OCR, vision) để click (như robot).  

Ví dụ: Câu “Mở VS Code, pull repo `abc`, build và fix lỗi.”: agent sẽ:
- Shell: `cd ~/Projects/abc && git pull && npm install && npm run build`.
- Đọc lỗi (shell.output) và phân tích.
- Nếu cần chỉnh code, mở file (VS Code) và gợi ý sửa (có thể dùng CLI command vs code hoặc file editor).
- Dùng tool Git để commit, rồi push (chờ user duyệt trước khi push).
Không cần screenshot/click.

# 7. Mô hình Phân quyền và Sandbox

**Chính sách công cụ (Permission Engine):** Mỗi lệnh tool được kiểm soát theo policy:
- Quy tắc (cấp phép): Ví dụ phân vùng FS nào được đọc/ghi, lệnh network nào được gọi, lệnh shell nào được cho phép.
- Trạng thái: ALWAYS_ALLOW (luôn chạy), ASK (hỏi user), DENY (chặn).
  
Ví dụ policy (YAML):

```yaml
filesystem:
  read:
    - path: ~/Projects/**   # luồng tin cậy
    - path: ~/Documents/**: ask
  write:
    - path: ~/Projects/**: ask
    - path: /usr/bin/**: deny
process:
  commands:
    - allow: ["git", "ls", "echo"]
    - ask: ["rm", "curl"]
network:
  allow: ["*.wikipedia.org", "api.openai.com"]
  deny: ["*"]
```

*Hermes* cũng yêu cầu người dùng duyệt lệnh, và dùng container cô lập. Ví dụ UX: khi agent muốn ghi file hoặc chạy script quan trọng, popup hỏi “Agent đề nghị X: Cho phép?”. Tính năng “Take Control”: user có thể giành chuột/bàn phím bất kỳ lúc nào, gián đoạn agent.

**Sandbox:** Chạy công cụ trong môi trường hạn chế:
- Tệp tin: hạn chế vùng filesystem theo policy.
- Tiến trình: dùng container (Docker, VM, sandbox) để cô lập.
- Mạng: chặn/giới hạn kết nối internet nếu cần.
- Biến môi trường/Secrets: giữ key trong kho khóa, chỉ cung cấp nội dung cho tool khi được phép. Ví dụ: API keys không hiện cho LLM, chỉ tool mới dùng.
  
Mục tiêu: đảm bảo agent *không thể tự ý phá hủy* hệ thống hoặc lộ thông tin nhạy cảm. Cơ chế sandbox và permission kế thừa ý tưởng của Hermes (command approval, container isolation).

# 8. UI/UX: Giao diện và Trải nghiệm người dùng

**Giao diện chính:** Theo phong cách LobeChat/Hub, ta dùng **bố cục 3 cột**:
- **Cột trái:** Danh sách Agents/Chats. Người dùng có thể chọn agent (kịch bản) hay topic cụ thể. 
- **Cột giữa:** Khu vực trò chuyện (chat) với agent. Tin nhắn hiển thị dạng bubble tròn, hỗ trợ Markdown/code highlight, có dark/light mode và hiệu ứng mượt mà. Phía trên có khung nhập lệnh (auto mở rộng).  
- **Cột phải:** Panel công cụ điều khiển (Agents list, Task list, Skills, Files, Memory, MCP servers, Cấu hình). Cho phép mở nhanh tài nguyên, bật tắt skills, xem logs. Ví dụ LobeChat: bên phải có chọn mô hình, plugin – ta có thể thêm button “Cấp quyền”, “Kết thúc Task”.

**Bảng điều khiển Activity / Run Timeline:** Một tab hiển thị **progress log** của agent (đã thực hiện bước nào, tool trả về gì). Tương tự terminal chạy script: check mark cho bước xong, spinner cho bước đang chạy, dấu Warning cho yêu cầu cấp phép v.v. VD:

```
● Hoạt động Agent "Build Project X" đang tiến hành...
  ✓ Đã tìm ~/Projects/X
  ● Đang build project (shell.run): npm run build...
  ⚠ Cần Phép: Tạo file ~/Projects/X/build.log
      [Cho phép một lần] [Luôn cho phép] [Từ chối]
  ✓ Đã tạo build.log
Done.
```

Đây là **run timeline** streaming từ backend, giúp user giám sát (vượt tầm chatbot thuần tuý).

**Agent Activity View (“máy tính mini”):** Khi agent điều khiển ứng dụng khác (VD: mở trình duyệt), UI có thể show ảnh chụp màn hình live của cửa sổ hiện tại, cùng log hành động. Tính năng “Take Control” ở đây cực kỳ quan trọng: người dùng có thể cướp chuột ngay lập tức nếu cần (giống tính năng Control trên VNC).

Ví dụ mô phỏng (wireframe):

```
┌─────────────────────────────────────────┐
│ Agent 'ResearchBot' đang mở Chrome     │
│                                         │
│ [ Live Screenshot of Chrome Window ]    │
│                                         │
├─────────────────────────────────────────┤
│ Hành động hiện tại: click("Export")     │
│ Lý do: "Downloading requested report."   │
│                                         │
│ [Tạm Dừng] [Cho phép Luôn] [Dừng Hoạt động] [Cướp Control] │
└─────────────────────────────────────────┘
```

**Phong cách UI:** Giao diện nên sạch sẽ, tối giản, consistent style (tham khảo LobeChat: rounded bubbles, font rõ ràng). Thống nhất giữa web và desktop (Tauri). UI cần có **chế độ dark/light**, responsive (size inputs), support markdown, code syntax highlight.

# 9. Đồng bộ và Worker từ xa (Sync & Remote Worker)

Để chạy song song/đồng bộ dữ liệu với cloud (tùy chọn):  
- **Sync local→cloud:** Đưa SQLite sang Postgres, dùng S3 cho artifacts, vectordb (Pinecone) nếu cần. Không phải giai đoạn đầu, nhưng schema SQLite dễ chuyển.  
- **Remote Worker:** Cho các task dài hạn (đào tạo RL, batch jobs). Thiết kế agent core tách biệt: có thể gửi một *job run* lên server (gồm context, toolset) và theo dõi qua UI. Ví dụ "AutoGPT-style delegation".  
- **MCP servers:** Nếu dùng MCP, agent có thể tích hợp thêm công cụ từ dịch vụ bên ngoài.

**Tóm lại:** Kiến trúc hybrid giúp agent “vừa mạnh, vừa linh hoạt”: vẫn local-first để bảo mật và offline, nhưng khi cần mở rộng có thể dùng cloud model và web search một cách kiểm soát.

# 10. Kiểm thử và Đội công việc (Testing & CI)

- **Kiểm thử tự động:** Do tính phức tạp, cần unit test cho từng tool (ví dụ test `shell.exec`, `fs.read`…), và end-to-end mock cho Agent loop. Sử dụng framework (Vitest cho TS, PyTest cho Python) kèm snapshot testing. Sử dụng container (Docker) để reproducible.  
- **CI/CD:** Build Tauri cho Win/mac/Linux, test tích hợp, publish. Tích hợp pipeline để kiểm tra tính an toàn (chẳng hạn tách tệp secrets, đánh giá security).  
- **Kiểm thử giao diện:** Dùng Storybook hoặc tương tự (nhìn component LobeHub UI Kit). Cả dịch vụ CLI cũng cần test (LobeHub có CLI reference).

# 11. Lộ trình MVP và ước lượng tài nguyên

**MVP** nên tập trung vào:
1. **Agent Core cơ bản:** Hoạt động offline với LLM local (ví dụ llama.cpp), một vài tools cơ bản (file, shell). Setup permission engine đơn giản. UI chat + timeline.
2. **Memory đơn giản:** Lưu lịch sử chat session vào SQLite, FTS text. Không vector ngay.
3. **Agent loop cơ bản:** Đảm bảo chu trình prompt→tool→prompt→answer vận hành. Có event logging.
4. **UI gọn:** Layout 3 cột cơ bản (chat, tập tin, memory). Cho phép gửi lệnh và xem log.

Sau đó:
- Thêm **web search** và **cloud LLM** (OpenAI API).
- Hoàn thiện **mô đun phân quyền (Ask/Allow)** và sandbox.
- **Multi-agent/Skills:** Cho agent tạo/nhận skill, plugin tải ở runtime.
- **Tối ưu memory:** vector indexing, LLM summarization (như Hermes “context compressor”).
- **Remote mode:** Cho phép chạy agent trên server.
- **UX nâng cao:** Agent Activity live preview, drag-and-drop files, config lưu profile.
  
**Ước lượng:** 
- **Nhân sự:** 2-3 developer front-end (React/Tauri), 2 backend (Rust/Python), 1 UI/UX designer, 1 QA. 
- **Thời gian:** ~3-6 tháng cho MVP (có model độc lập, chức năng core), tiếp theo 3-6 tháng cho nâng cấp (multi-tool, memory, cloud sync).
- **Công cụ:** SQLite, Tauri, Git, Docker, CI (GitHub Actions), Python libs (langchain/covalent style), llama.cpp hoặc Ollama, React component library.

---

**Tóm lại**, blueprint trên kết hợp tinh hoa LobeHub (UI 3 cột hiện đại), DeepSeek (kiến trúc plugin hóa), Hermes (persistent memory, đa kênh, bảo mật), và OpenWebUI (local/self-host, plugin, RAG). Mọi thành phần được nối với nhau bằng **sự kiện streaming** và **protocol JSON** chuẩn (tools/phạm vi/authorization), đủ sức xây dựng một “máy tính AI” local-first với trải nghiệm mượt mà và an toàn. 

**Nguồn tham khảo:** Bảng tổng hợp và thiết kế dựa trên tài liệu chính thức và cộng đồng của LobeHub, DeepSeek, Hermes, OpenWebUI, cùng chuẩn AgentSkills và khảo sát UI LobeChat.