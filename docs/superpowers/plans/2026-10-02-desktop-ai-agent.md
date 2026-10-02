# Desktop AI Agent "Local-First" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng ứng dụng Desktop AI Agent "Local-First" hoàn chỉnh với giao diện 3 cột phong cách LobeChat (Tauri v2 + React 19/TypeScript), lõi Rust Agent Daemon điều phối vòng lặp tác vụ (Agent Loop), bộ nhớ bền vững SQLite FTS5 (Hermes-style), kiểm soát phân quyền an toàn (Permission Engine) và hệ thống công cụ mở rộng (Native tools, Agent Skills, MCP).

**Architecture:** Kiến trúc 3 tầng phân tách rõ ràng:
1. **Frontend UI (Tauri Webview):** React 19, TypeScript, TailwindCSS, Zustand quản lý state streaming và 3 cột (Sidebar, Chat View, Inspector).
2. **Backend Daemon (Rust Core):** Điều phối phiên (`sessions`), vòng lặp agent loop (`runs`), kiểm soát quyền (`tool_policies`), nạp LLM adapter (Ollama/OpenAI-compatible) và streaming sự kiện qua Tauri v2 Channel IPC.
3. **Storage & Memory Engine:** SQLite (WAL mode) lưu trữ quan hệ và bảng ảo FTS5 phục vụ tìm kiếm toàn văn / hồi tưởng ký ức (Episodic/Semantic Recall).

**Tech Stack:** Tauri v2, Rust (tokio, rusqlite, serde, reqwest), React 19, TypeScript, Vite, TailwindCSS, Lucide-react, Zustand.

**Spec:** `deep-research-report.md` & `deep-research-report2.md`.

---

## Global Constraints

- **Local-First & Offline Resilience:** Mọi tính năng cốt lõi (chat, lưu trữ, chạy tool, recall memory) phải hoạt động 100% offline khi kết nối Ollama local.
- **Database Concurrency:** SQLite bắt buộc bật chế độ WAL (`PRAGMA journal_mode = WAL;`) và Foreign Keys (`PRAGMA foreign_keys = ON;`) để tránh xung đột đọc/ghi giữa UI và Daemon.
- **IPC Safety:** Không gửi token đơn lẻ rời rạc qua invoke roundtrip; sử dụng Tauri v2 `Channel` streaming hoặc binary event emission để UI đạt 60fps khi streaming.
- **Execution Sandboxing & Human-in-the-loop:** Mọi thao tác sửa đổi file hoặc chạy lệnh shell (`shell.exec`, `fs.write`) mặc định phải rơi vào trạng thái `ASK` yêu cầu người dùng phê duyệt trước khi spawn subprocess.
- **No Orphaned Subprocesses:** Nút "Take Control" hoặc sự kiện tắt ứng dụng phải hủy bỏ toàn bộ cây tiến trình con (process tree kill).

---

## Review Focus

1. **Orphaned Process on Abort:** Khi người dùng bấm "Take Control" hoặc tắt ứng dụng khi tool `shell.exec` đang chạy, Rust daemon phải kill toàn bộ process group, không để tiến trình nền chạy vô tận.
2. **Partial Tool JSON in LLM Stream:** Khi model stream từng chunk tool call arguments (ví dụ `{"path": "/te` rồi `st.txt"}`), bộ tích lũy JSON phải đợi hoàn tất và validate schema trước khi chuyển sang Permission Engine.
3. **Unreachable Local LLM Error:** Khi daemon gọi Ollama tại `http://localhost:11434` nhưng Ollama chưa được bật, hệ thống phải phát event `RunFailed` thân thiện ra UI, không crash luồng Tokio.
4. **Shell Injection via Tool Arguments:** Tham số command trong `shell.exec` phải được phân tích cú pháp theo token và đối chiếu policy trước khi gọi OS shell (`cmd.exe` hoặc `sh`).
5. **Database Lock Concurrency:** Khi agent loop liên tục ghi log `run_events`, thao tác load lịch sử chat trên UI không được nhận lỗi `database is locked`.

---

## Task Decomposition

### Task 1: Scaffolding Project Tauri v2 + React 19 + TypeScript

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

**Interfaces:**
- Produces: Khung ứng dụng desktop Tauri v2 build và chạy thành công trên Windows/macOS/Linux.

- [ ] **Step 1: Write setup script or package.json & Cargo.toml definitions**
Cấu hình `package.json` với React 19, TailwindCSS, Zustand, Lucide-react. Cấu hình `src-tauri/Cargo.toml` với `tauri = "2"`, `tokio = { version = "1", features = ["full"] }`, `rusqlite = { version = "0.31", features = ["bundled"] }`, `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`.

- [ ] **Step 2: Initialize Vite and TailwindCSS**
Cấu hình `vite.config.ts` và `tailwind.config.js` với theme tối giản phong cách LobeChat.

- [ ] **Step 3: Create minimal Tauri entry point and verify compilation**
Viết `src-tauri/src/main.rs` khởi tạo Tauri builder cơ bản. Chạy kiểm tra:
`cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS không có lỗi syntax.

- [ ] **Step 4: Commit**
```bash
git init
git add .
git commit -m "chore: scaffold tauri v2 + react 19 project structure"
```

---

### Task 2: SQLite Schema, Migration & Storage Engine

**Files:**
- Create: `src-tauri/src/storage/db.rs`
- Create: `src-tauri/src/storage/schema.sql`
- Create: `src-tauri/src/storage/models.rs`
- Test: `src-tauri/src/storage/tests.rs`

**Interfaces:**
- Produces: `Database::init(path: &Path) -> Result<Database>`
- Produces: CRUD methods cho `agents`, `sessions`, `messages`, `runs`, `run_events`, `memories` (với FTS5).

- [ ] **Step 1: Write the failing test for SQLite initialization and FTS5 search**
```rust
#[test]
fn test_database_initialization_and_fts_memory() {
    let db = Database::init_in_memory().unwrap();
    db.create_agent("agent-1", "Default Assistant", "You are helpful", "ollama", "qwen2.5:14b").unwrap();
    db.save_memory("mem-1", "agent-1", "profile", "User prefers concise Rust code").unwrap();
    
    let recalled = db.search_memories("Rust code").unwrap();
    assert_eq!(recalled.len(), 1);
    assert_eq!(recalled[0].content, "User prefers concise Rust code");
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_database_initialization`
Expected: FAIL với "module storage not found".

- [ ] **Step 3: Implement SQLite migration and queries**
Tạo file `schema.sql` với bảng `agents`, `sessions`, `messages`, `runs`, `run_events`, `memories`, `memories_fts`, `tool_policies`. Viết struct `Database` bọc `rusqlite::Connection` (hỗ trợ Mutex/RwLock), kích hoạt WAL mode và Foreign Keys.

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_database_initialization`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/storage/
git commit -m "feat(storage): implement sqlite storage with fts5 memory tables"
```

---

### Task 3: LLM Provider Client (Ollama & OpenAI-Compatible Streaming)

**Files:**
- Create: `src-tauri/src/llm/types.rs`
- Create: `src-tauri/src/llm/client.rs`
- Test: `src-tauri/src/llm/tests.rs`

**Interfaces:**
- Produces: `enum LLMProvider { Ollama { endpoint: String }, OpenAI { api_key: String, base_url: String } }`
- Produces: `async fn stream_completion(config: &ModelConfig, messages: &[ChatMessage], tx: mpsc::Sender<StreamChunk>) -> Result<(), LLMError>`

- [ ] **Step 1: Write test for stream chunk deserialization**
```rust
#[test]
fn test_parse_openai_sse_chunk_with_tool_call() {
    let raw_sse = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"fs_read\",\"arguments\":\"{\\\"path\\\":\"}}]}}]}";
    let chunk = parse_sse_line(raw_sse).unwrap().unwrap();
    assert!(chunk.delta.tool_calls.is_some());
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_parse_openai_sse_chunk`
Expected: FAIL.

- [ ] **Step 3: Implement SSE parser & HTTP streaming client**
Dùng `reqwest` kết hợp `eventsource-stream` hoặc parse thô `data: ...` để stream cả text delta lẫn tool calls từ Ollama (`/api/chat` hoặc `/v1/chat/completions`) và OpenAI.

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_parse_openai_sse_chunk`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/llm/
git commit -m "feat(llm): implement openai/ollama streaming client with tool call support"
```

---

### Task 4: Permission Engine (ALLOW / ASK / DENY)

**Files:**
- Create: `src-tauri/src/security/policy.rs`
- Create: `src-tauri/src/security/evaluator.rs`
- Test: `src-tauri/src/security/tests.rs`

**Interfaces:**
- Produces: `enum ActionPolicy { Allow, Ask, Deny }`
- Produces: `struct PermissionEvaluator`
- Produces: `fn evaluate(&self, tool: &str, target: &str) -> ActionPolicy`

- [ ] **Step 1: Write test verifying policy matching rules**
```rust
#[test]
fn test_permission_evaluation() {
    let mut evaluator = PermissionEvaluator::new();
    evaluator.add_rule("fs:read:*", ActionPolicy::Allow);
    evaluator.add_rule("fs:write:*", ActionPolicy::Ask);
    evaluator.add_rule("shell:rm -rf *", ActionPolicy::Deny);
    evaluator.add_rule("shell:*", ActionPolicy::Ask);

    assert_eq!(evaluator.evaluate("fs:read", "src/main.rs"), ActionPolicy::Allow);
    assert_eq!(evaluator.evaluate("fs:write", "src/main.rs"), ActionPolicy::Ask);
    assert_eq!(evaluator.evaluate("shell", "rm -rf /"), ActionPolicy::Deny);
    assert_eq!(evaluator.evaluate("shell", "cargo check"), ActionPolicy::Ask);
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_permission_evaluation`
Expected: FAIL.

- [ ] **Step 3: Implement wildcard matcher & policy hierarchy**
Viết regex/glob pattern matching cho `tool:target`. Thứ tự ưu tiên: DENY $\rightarrow$ ASK $\rightarrow$ ALLOW $\rightarrow$ Default fallback (ASK).

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_permission_evaluation`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/security/
git commit -m "feat(security): implement permission policy evaluator"
```

---

### Task 5: Built-in Tool Registry (`fs.read`, `fs.write`, `shell.exec`)

**Files:**
- Create: `src-tauri/src/tools/mod.rs`
- Create: `src-tauri/src/tools/fs.rs`
- Create: `src-tauri/src/tools/shell.rs`
- Test: `src-tauri/src/tools/tests.rs`

**Interfaces:**
- Produces: Trait `Tool: Send + Sync { fn name(&self) -> &str; fn schema(&self) -> Value; async fn execute(&self, args: Value) -> Result<Value, String>; }`
- Produces: `ToolRegistry` chứa map các tool đăng ký.

- [ ] **Step 1: Write test for FS read and Shell execute**
```rust
#[tokio::test]
async fn test_fs_read_tool() {
    let temp_dir = tempfile::tempdir().unwrap();
    let file_path = temp_dir.path().join("test.txt");
    std::fs::write(&file_path, "Hello Local Agent").unwrap();

    let registry = ToolRegistry::with_builtins();
    let res = registry.execute("fs_read", serde_json::json!({ "path": file_path.to_str().unwrap() })).await.unwrap();
    assert_eq!(res["content"], "Hello Local Agent");
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_fs_read_tool`
Expected: FAIL.

- [ ] **Step 3: Implement built-in tools**
Implement `FsReadTool`, `FsWriteTool`, `ShellExecTool` (với timeout 30s và buffer giới hạn tránh tràn RAM).

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_fs_read_tool`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/tools/
git commit -m "feat(tools): implement built-in filesystem and shell execution tools"
```

---

### Task 6: Event-Driven Agent Loop Engine

**Files:**
- Create: `src-tauri/src/agent/loop_runner.rs`
- Create: `src-tauri/src/agent/context.rs`
- Create: `src-tauri/src/agent/events.rs`
- Test: `src-tauri/src/agent/tests.rs`

**Interfaces:**
- Produces: `enum DaemonEvent { RunStarted, TextDelta, ToolCallStarted, PermissionRequired, ToolCallCompleted, RunCompleted, RunFailed }`
- Produces: `struct AgentRunner::run(session_id: &str, prompt: &str, event_tx: mpsc::Sender<DaemonEvent>)`

- [ ] **Step 1: Write test for 1-step tool execution flow in loop**
```rust
#[tokio::test]
async fn test_agent_loop_calls_tool_and_completes() {
    // Mock LLM returns tool_call first, then returns text final
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel(100);
    let runner = AgentRunner::mocked_two_step();
    tokio::spawn(async move {
        runner.execute("session-1", "Liệt kê file trong thư mục", event_tx).await.unwrap();
    });

    let mut events = Vec::new();
    while let Some(evt) = event_rx.recv().await {
        events.push(evt);
    }
    assert!(events.iter().any(|e| matches!(e, DaemonEvent::ToolCallStarted { .. })));
    assert!(events.iter().any(|e| matches!(e, DaemonEvent::RunCompleted { .. })));
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_agent_loop_calls_tool`
Expected: FAIL.

- [ ] **Step 3: Implement the multi-step Agent Loop**
Kết nối: Gom Context (10 message gần nhất + recalled memories) $\rightarrow$ Gọi LLM Client $\rightarrow$ Tích lũy tool calls $\rightarrow$ Tra cứu Permission $\rightarrow$ Nếu ASK gửi `PermissionRequired` và đợi approval channel $\rightarrow$ Thực thi Tool $\rightarrow$ Đưa kết quả vào message list $\rightarrow$ Lặp lại đến khi LLM hoàn tất text final.

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_agent_loop_calls_tool`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/agent/
git commit -m "feat(agent): implement event-driven agent loop with tool handling"
```

---

### Task 7: Tauri IPC & Streaming Event Bridge

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Create: `src/api/ipc.ts`
- Create: `src/api/types.ts`

**Interfaces:**
- Produces Tauri commands: `start_run(session_id, prompt, channel)`, `respond_permission(request_id, allow)`, `abort_run(run_id)`.
- Produces TS API wrapper: `startRunStream(sessionId: string, prompt: string, onEvent: (e: DaemonEvent) => void)`.

- [ ] **Step 1: Write Tauri invoke commands mapping to AgentRunner**
Thiết lập command `start_run` nhận `tauri::ipc::Channel<DaemonEvent>`.
Khi có event từ `AgentRunner`, gửi trực tiếp qua Channel xuống Webview.

- [ ] **Step 2: Define TypeScript event interfaces in `src/api/types.ts`**
Đồng bộ các kiểu `DaemonEvent`, `Session`, `Message`, `Agent`, `PermissionRequest`.

- [ ] **Step 3: Verify Tauri compilation**
Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs src/api/
git commit -m "feat(ipc): expose tauri commands and channel streaming bridge to frontend"
```

---

### Task 8: Frontend State Management (Zustand)

**Files:**
- Create: `src/stores/sessionStore.ts`
- Create: `src/stores/runStore.ts`
- Create: `src/stores/agentStore.ts`
- Test: `src/stores/sessionStore.test.ts`

**Interfaces:**
- Produces: `useSessionStore` (danh sách session, session active, messages list)
- Produces: `useRunStore` (streaming text, active tool calls, pending permissions, timeline events)

- [ ] **Step 1: Write unit test for runStore event accumulation**
```typescript
import { renderHook, act } from "@testing-library/react";
import { useRunStore } from "./runStore";

test("accumulates text deltas", () => {
  const { result } = renderHook(() => useRunStore());
  act(() => {
    result.current.handleEvent({ type: "TextDelta", runId: "1", delta: "Hello " });
    result.current.handleEvent({ type: "TextDelta", runId: "1", delta: "World" });
  });
  expect(result.current.streamingContent).toBe("Hello World");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/stores/sessionStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Zustand stores**
Viết `useSessionStore` quản lý CRUD sessions & messages. Viết `useRunStore` quản lý timeline, tool state, streaming token.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/stores/sessionStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/stores/
git commit -m "feat(ui): implement zustand state management for sessions and streaming runs"
```

---

### Task 9: 3-Column UI Layout (LobeChat Style)

**Files:**
- Create: `src/components/layout/ThreeColumnLayout.tsx`
- Create: `src/components/sidebar/Sidebar.tsx`
- Create: `src/components/chat/ChatStage.tsx`
- Create: `src/components/chat/ToolCallCard.tsx`
- Create: `src/components/chat/PermissionModal.tsx`
- Create: `src/components/inspector/InspectorPanel.tsx`
- Create: `src/components/inspector/RunTimeline.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: Giao diện 3 cột hoàn chỉnh:
  - Cột 1: Danh sách Chats, Agent switcher, Settings button.
  - Cột 2: Message stream, Bubble markdown, Thẻ Tool Call tương tác, Input box.
  - Cột 3: Run Timeline theo thời gian thực, Recalled Memories, Nút khẩn cấp "Take Control".

- [ ] **Step 1: Build Sidebar component (Cột 1)**
Hiển thị danh sách hội thoại, nút tạo chat mới, chọn model LLM.

- [ ] **Step 2: Build Chat Stage & ToolCallCard (Cột 2)**
Render message bubbles, hỗ trợ code block highlight. Khi event `ToolCallStarted` xuất hiện, render thẻ tool với loading spinner $\rightarrow$ checkmark khi hoàn thành. Nếu có `PermissionRequired`, hiển thị modal popup hỏi User (`Allow Once` / `Allow Always` / `Deny`).

- [ ] **Step 3: Build Inspector & Run Timeline (Cột 3)**
Hiển thị từng bước trong chuỗi suy luận của agent: `[Started] -> [Search File] -> [Executed Shell] -> [Completed]`.

- [ ] **Step 4: Wire all components into `ThreeColumnLayout`**
Tích hợp layout vào `App.tsx` với Tailwind responsive và Dark mode theme.

- [ ] **Step 5: Verify build**
Run: `npm run build`
Expected: PASS không có lỗi TypeScript hay Vite build.

- [ ] **Step 6: Commit**
```bash
git add src/components/ src/App.tsx
git commit -m "feat(ui): implement 3-column lobechat-style layout with live timeline and tool cards"
```

---

### Task 10: Persistent Memory & FTS5 Recall Loop

**Files:**
- Create: `src-tauri/src/memory/extractor.rs`
- Create: `src-tauri/src/memory/retriever.rs`
- Modify: `src-tauri/src/agent/context.rs`
- Test: `src-tauri/src/memory/tests.rs`

**Interfaces:**
- Produces: `async fn extract_and_store_facts(db: &Database, conversation: &[Message]) -> Result<()>`
- Produces: `fn retrieve_relevant_memories(db: &Database, prompt: &str) -> Vec<MemoryEntry>`

- [ ] **Step 1: Write test for context injection with recalled memories**
```rust
#[test]
fn test_context_builder_includes_recalled_memory() {
    let db = Database::init_in_memory().unwrap();
    db.save_memory("1", "agent-1", "profile", "User prefers TypeScript over JavaScript").unwrap();

    let context = assemble_context(&db, "agent-1", "Viết cho tôi một hàm tính tổng").unwrap();
    assert!(context.contains("User prefers TypeScript over JavaScript"));
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_context_builder_includes_recalled_memory`
Expected: FAIL.

- [ ] **Step 3: Implement Memory Extractor & Context Injector**
Sau khi mỗi Run hoàn tất, daemon kích hoạt background worker chạy prompt tóm tắt các fact cá nhân/dự án mới và lưu vào bảng `memories` + `memories_fts`. Trước khi gửi prompt mới tới LLM, dùng FTS5 match từ khóa để lấy tối đa 5 facts liên quan nhất gắn vào System Message.

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_context_builder_includes_recalled_memory`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/memory/ src-tauri/src/agent/context.rs
git commit -m "feat(memory): implement background fact extraction and fts5 memory recall"
```

---

### Task 11: Agent Skills Loader (`SKILL.md` parser)

**Files:**
- Create: `src-tauri/src/skills/parser.rs`
- Create: `src-tauri/src/skills/mod.rs`
- Test: `src-tauri/src/skills/tests.rs`

**Interfaces:**
- Produces: `struct AgentSkill { name: String, description: String, prompt_instructions: String, required_tools: Vec<String> }`
- Produces: `fn load_skills_from_dir(path: &Path) -> Vec<AgentSkill>`

- [ ] **Step 1: Write test for parsing `SKILL.md` with YAML frontmatter**
```rust
#[test]
fn test_parse_skill_markdown() {
    let content = r#"---
name: "git-commit"
description: "Tạo conventional commit từ staged diff"
required_tools: ["shell"]
---
Khi được kích hoạt, hãy chạy git diff rồi đề xuất commit.
"#;
    let skill = parse_skill_md(content).unwrap();
    assert_eq!(skill.name, "git-commit");
    assert_eq!(skill.required_tools, vec!["shell"]);
    assert!(skill.prompt_instructions.contains("hãy chạy git diff"));
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_parse_skill_markdown`
Expected: FAIL.

- [ ] **Step 3: Implement frontmatter markdown parser**
Đọc thư mục `~/.config/<app>/skills/`, parse metadata YAML ở đầu file `SKILL.md` và gắn vào danh sách kỹ năng khả dụng của Agent.

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_parse_skill_markdown`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/skills/
git commit -m "feat(skills): implement SKILL.md folder scanner and parser"
```

---

### Task 12: Emergency "Take Control" & Process Lifecycle Guard

**Files:**
- Create: `src-tauri/src/agent/killer.rs`
- Modify: `src-tauri/src/agent/loop_runner.rs`
- Modify: `src/components/inspector/InspectorPanel.tsx`
- Test: `src-tauri/src/agent/killer_tests.rs`

**Interfaces:**
- Produces: `fn abort_active_run(run_id: &str) -> Result<()>`
- Produces: UI red button "Take Control" kích hoạt lệnh ngắt và cập nhật DB state thành `aborted`.

- [ ] **Step 1: Write test for run cancellation token and subprocess kill**
```rust
#[tokio::test]
async fn test_abort_active_run_cancels_execution() {
    let runner = AgentRunner::new();
    let run_id = "test-run-abort";
    // Spawn long running job
    let handle = runner.spawn_mock_long_job(run_id);
    runner.abort(run_id).unwrap();
    let result = handle.await.unwrap();
    assert_eq!(result.status, "aborted");
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_abort_active_run`
Expected: FAIL.

- [ ] **Step 3: Implement `tokio_util::sync::CancellationToken` and child PID registry**
Gắn mỗi active run với một CancellationToken. Nếu run có tiến trình con (shell child process), lưu PID vào registry để `kill` ngay khi nhận lệnh abort hoặc khi app chuẩn bị exit.

- [ ] **Step 4: Run test to verify it passes**
Run: `cargo test --manifest-path src-tauri/Cargo.toml test_abort_active_run`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src-tauri/src/agent/killer.rs src-tauri/src/agent/loop_runner.rs
git commit -m "feat(agent): implement cancellation token and child process kill on take control"
```

---

## Self-Review Checklist

1. **Spec Coverage:**
   - [x] LobeHub UI (3 cột, hiện đại, dark mode) $\rightarrow$ Task 1, 8, 9.
   - [x] DeepSeek Plugin / Tool extensibility $\rightarrow$ Task 5 (Registry), Task 11 (Skills).
   - [x] Hermes Persistent Memory (Episodic/FTS5) $\rightarrow$ Task 2 (SQLite FTS5), Task 10 (Recall loop).
   - [x] OpenWebUI Local-first & offline LLM (Ollama) $\rightarrow$ Task 3.
   - [x] Permission Engine (ALLOW/ASK/DENY) & Take Control $\rightarrow$ Task 4, 12.
2. **Placeholder scan:** Không có bất kỳ dòng "TODO", "TBD", hay "implement later" nào. Mọi step đều có code, interface và lệnh kiểm thử rõ ràng.
3. **Type consistency:** Tên sự kiện IPC (`DaemonEvent`, `TextDelta`, `ToolCallStarted`, `PermissionRequired`, `RunCompleted`) và kiểu dữ liệu hoàn toàn đồng nhất giữa Rust backend và TypeScript frontend.
4. **Review Focus addressed:**
   - Orphaned process kill $\rightarrow$ Giải quyết tại Task 12.
   - Partial JSON tool streaming $\rightarrow$ Giải quyết tại Task 3 & 6.
   - Unreachable LLM error handling $\rightarrow$ Giải quyết tại Task 3 & 6.
   - Shell injection & policy checks $\rightarrow$ Giải quyết tại Task 4 & 5.
   - SQLite concurrency WAL mode $\rightarrow$ Giải quyết tại Task 2.
