# Desktop AI Agent "Local-First" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Chi tiết đầy đủ xem tại:** [`docs/superpowers/plans/2026-10-02-desktop-ai-agent.md`](docs/superpowers/plans/2026-10-02-desktop-ai-agent.md)

**Goal:** Xây dựng ứng dụng Desktop AI Agent "Local-First" hoàn chỉnh với giao diện 3 cột phong cách LobeChat (Tauri v2 + React 19/TypeScript), lõi Rust Agent Daemon điều phối vòng lặp tác vụ (Agent Loop), bộ nhớ bền vững SQLite FTS5 (Hermes-style), kiểm soát phân quyền an toàn (Permission Engine) và hệ thống công cụ mở rộng (Native tools, Agent Skills, MCP).

**Architecture:** Kiến trúc 3 tầng phân tách rõ ràng:
1. **Frontend UI (Tauri Webview):** React 19, TypeScript, TailwindCSS, Zustand quản lý state streaming và 3 cột (Sidebar, Chat View, Inspector).
2. **Backend Daemon (Rust Core):** Điều phối phiên (`sessions`), vòng lặp agent loop (`runs`), kiểm soát quyền (`tool_policies`), nạp LLM adapter (Ollama/OpenAI-compatible) và streaming sự kiện qua Tauri v2 Channel IPC.
3. **Storage & Memory Engine:** SQLite (WAL mode) lưu trữ quan hệ và bảng ảo FTS5 phục vụ tìm kiếm toàn văn / hồi tưởng ký ức (Episodic/Semantic Recall).

**Tech Stack:** Tauri v2, Rust (tokio, rusqlite, serde, reqwest), React 19, TypeScript, Vite, TailwindCSS, Lucide-react, Zustand.

---

## Tóm tắt 12 Nhiệm vụ triển khai (Task Breakdown)

- [ ] **Task 1: Scaffolding Project Tauri v2 + React 19 + TypeScript**
- [ ] **Task 2: SQLite Schema, Migration & Storage Engine (WAL + FTS5)**
- [ ] **Task 3: LLM Provider Client (Ollama & OpenAI-Compatible Streaming)**
- [ ] **Task 4: Permission Engine (ALLOW / ASK / DENY Policy Evaluator)**
- [ ] **Task 5: Built-in Tool Registry (`fs.read`, `fs.write`, `shell.exec`)**
- [ ] **Task 6: Event-Driven Agent Loop Engine**
- [ ] **Task 7: Tauri IPC & Streaming Event Bridge (Channel IPC)**
- [ ] **Task 8: Frontend State Management (Zustand Stores)**
- [ ] **Task 9: 3-Column UI Layout (LobeChat Style)**
- [ ] **Task 10: Persistent Memory & FTS5 Recall Loop**
- [ ] **Task 11: Agent Skills Loader (`SKILL.md` parser)**
- [ ] **Task 12: Emergency "Take Control" & Process Lifecycle Guard**

*(Xem chi tiết từng file, interface, test case và code mẫu tại file plan chi tiết).*
