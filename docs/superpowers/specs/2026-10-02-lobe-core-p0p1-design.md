# Lobe Core P0+P1 Design — Multi-Provider Agent Runtime

Date: 2026-10-02
Status: Approved (approach A — evolutionary Node daemon)
Scope: P0 + P1 core only. P2/P3 deferred.

## 1. Intent

Transform Lobe Core from "local chat UI connected to one Ollama model"
into "local-first multi-provider desktop Agent runtime with configurable
models, tools, permissions, memory observability and observable runs".

Success = 3 E2E in Phase 2 brief pass:
1. Custom OpenAI-compatible provider CRUD + persist + stream via
   Conversation → Agent Runtime → Model Gateway → OpenAI-Compatible Adapter.
2. Ollama discover/select/stream; offline shows Offline without crash.
3. Tool-capable model `git status` → approval card → exec → observation →
   final response, single Run in Timeline, no duplicate assistant messages.

Constraints: no break to existing chat/memory/tools; no fake UI;
no plain-text API keys in app config; SQLite migrations non-destructive.

## 2. Current audit (verified)

- Frontend: React19+Vite 3-col Sidebar/ChatStage/Inspector. `src/api.ts`
  fetch + EventSource. No registry.
- Backend: Node http daemon (`server/index.js`), not Rust/Tauri.
- Model: `server/llm.js LLMClient` single in-memory
  provider/endpoint/model/apiKey, default ollama
  `http://localhost:11434` / `qwen2.5:14b`. Offline fallback deterministic engine.
- Provider UI: `Inspector Settings` dropdown ollama/openai + text model,
  `POST /api/llm/config`, lost on restart. No discovery.
- DB (`server/db.js`): agents/sessions/messages/runs/run_events/
  memories+FTS5/tool_policies. Missing providers/models/threads/
  sequences/skills/mcp/artifacts/secrets_metadata.
- Streaming: `GET /api/runs/:id/stream` replays `run_events` then live.
  Frontend `setStreamingContent(prev+delta)` not idempotent, no sequence.
- Tools (`server/tools.js`): 7 builtins fs_read/write/list, shell_exec,
  web_search (DuckDuckGo), memory_save/search. No riskLevel/source/schema.
- Permissions (`server/permissions.js`): DENY>ASK>ALLOW, default ASK,
  120s approval, ALLOW_ALWAYS persists pattern. Modal only. No
  LOCAL_ONLY/ALLOW_WEB/ALLOW_CLOUD/HYBRID enforcement.
- Memory: FTS5 + triggers + bm25 recall top-4 injected in system prompt.
  No working/retrieved/saved/project split, no why-retrieved.
- Skills (`server/skills.js`): scan `skills/*/SKILL.md`, inject ALL into
  every prompt. Static list UI.
- MCP: missing. Settings IA: mixed into Inspector. Secrets: in-memory
  plain. Events: RunStarted/TextDelta/ToolCall*/Permission*/MemoryUpdated/
  RunCompleted/Failed/Aborted, no eventId/sequence ordering.

## 3. Architecture

Keep 3 tiers. Insert Gateway:

```
Chat UI → AgentLoop → ModelGateway → ProviderAdapter → endpoint
              ↓             ↓
        ToolRegistry   SecretsVault (RAM)
              ↓
        PermissionEngine + Policy
```

Rule: AgentLoop never does provider HTTP. Adapters never touch DB
directly except via Registry/Gateway. Frontend never talks Ollama
directly; all via `/api/providers|/models|/runs`.

Files (new, minimal):
- `server/providers/registry.js` — Provider+Model CRUD over SQLite.
- `server/providers/gateway.js` — resolve, auth, normalize, stream,
  tools, retry×1, cancel, capability check, usage {latencyMs}.
- `server/providers/adapters/ollama.js`
- `server/providers/adapters/openai-compatible.js`
- `server/providers/errors.js` — 4 classes only P0:
  ProviderOfflineError, AuthenticationError, ModelNotFoundError,
  CapabilityError. Others mapped to generic Error with `code`.
- `server/providers/secrets.js` — RAM vault: `set(apiKeyRef, secret)`,
  `get(ref)` during execution only, never logged nor sent to LLM context.

`LLMClient` kept 1 phase as legacy fallback for ollama, then removed.

## 4. Data model / migrations

Non-destructive, `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE`
guarded by `PRAGMA table_info` checks:

```sql
providers(id TEXT PK, name TEXT, type TEXT, base_url TEXT,
  api_key_ref TEXT, config_json TEXT, enabled INTEGER,
  created_at INTEGER, updated_at INTEGER);

models(id TEXT PK, provider_id TEXT FK CASCADE, model_id TEXT,
  display_name TEXT, capabilities_json TEXT, context_window INTEGER,
  max_output_tokens INTEGER, enabled INTEGER,
  created_at INTEGER, updated_at INTEGER);

secrets_metadata(key_ref TEXT PK, provider_id TEXT, created_at INTEGER);
-- sessions: ADD COLUMN model_override_json TEXT (nullable)
-- run_events: ADD COLUMN sequence INTEGER (backfill by rowid order)
```

Seed: migrate legacy single config to provider `ollama-local`
(type ollama, base_url http://localhost:11434) + model `qwen2.5:14b`
if tables empty. No wipe of agents/sessions/messages/runs/memories.

Interfaces (TS backend JSDoc + frontend `src/types.ts` extension):

```ts
type ProviderType = 'ollama'|'openai'|'anthropic'|'google'|'openai-compatible'|'custom';
interface AIProvider { id,name,type:ProviderType,baseURL?,apiKeyRef?,enabled,models:ModelDefinition[],config:{headers?,timeoutMs?,org?},createdAt,updatedAt }
interface ModelDefinition { id,providerId,modelId,displayName,capabilities:ModelCapabilities,contextWindow?,maxOutputTokens?,enabled }
interface ModelCapabilities { chat,streaming,tools,vision,reasoning,json,embeddings: boolean }
```

Capabilities auto-detected where possible (ollama `/api/show` if
present, openai-compatible: default chat+streaming true, rest false)
+ manual override in UI. Never assume tools=true.

## 5. Provider adapters (P0: 2 only)

Ollama:
- `GET /api/tags` → list installed → upsert models.
- `POST /api/chat` preferred; fallback `/v1/chat/completions` for
  OpenAI-compat mode of Ollama. Normalize to OpenAI delta shape.
- Offline → ProviderOfflineError, UI shows Offline, chat falls back
  to deterministic engine (existing) without crash.

OpenAI-compatible (LM Studio/vLLM/llama.cpp/private/OpenRouter):
- Config: name, baseURL (required, trim trailing /), apiKey
  (optional), headers (advanced), timeoutMs default 30000.
- `GET {base}/v1/models` best-effort; failure does not block Save.
  Manual Add Model always available.
- `POST {base}/v1/chat/completions` stream SSE `data:` lines.
  `Authorization: Bearer` only if key present.
- Never hardcode vendor paths beyond `/v1/models|/v1/chat/completions`.

Connection test `POST /api/providers/:id/test` returns:
`{connected, latencyMs, modelsDiscovered}` or
`{connected:false, code, message}` with codes
`UNREACHABLE/AUTH/TIMEOUT/INVALID_RESPONSE/TLS`. No raw stack to UI;
raw in Dev mode only.

## 6. Model selection + policy (P0+P1 core)

Precedence: `session_override > agent_default > workspace_default > app_default`.
`session_override {providerId,modelId}` stored in
`sessions.model_override_json`, set via header picker, does not mutate agent.

Picker in chat header: `[Local|Cloud|Web] [displayName ▾]`, grouped
LOCAL/CUSTOM/CLOUD from Registry, shows `● Connected/○ Offline`.
No hardcoded list.

Capability guard in AgentLoop before run:
if task needs tools/vision/json but `capabilities.<x>=false` →
abort run start with `CapabilityError` + UI suggests compatible models.
No silent tool attempt.

Execution policy per agent:
`LOCAL_ONLY | ALLOW_WEB | ALLOW_CLOUD_MODEL | HYBRID`
(stored in `agents` via new nullable `policy_json`; default
`LOCAL_ONLY` for existing). Enforcement:
- LOCAL_ONLY: block `web_*`, `browser_*`, block cloud provider types.
- ALLOW_WEB: allow `web_search/fetch` + approved HTTP only.
- ALLOW_CLOUD_MODEL: allow cloud provider; without it never auto
  fallback local→cloud.
- HYBRID: local tools+memory + cloud model if allowed.
Data-boundary indicator in header: Local / Cloud / Web Access, compact,
derived from actual run (provider type + tools used). Sensitive local
content → cloud requires ASK (via PermissionEngine).

Routing P0: Primary + Fallback model per agent only. Fallback used on
`ProviderOffline/Network` if policy permits; never local→cloud silently.

## 7. Runs, events, permissions, inspector

Normalized events (persisted with `sequence`):
`run.started, model.started, model.delta, model.completed,
tool.requested, tool.approval_required, tool.started, tool.completed,
tool.failed, memory.retrieved, memory.written, run.completed,
run.failed, run.cancelled`
Each `{eventId,runId,sequence,timestamp,type,payload}`. Sequence =
monotonic per run (max+1 in transaction). Frontend reducer keyed by
`eventId`; `model.delta` append idempotent; replay on `/stream`
sends `sequence` ordered, client ignores duplicates.

Session/Thread/Message/Run separation (minimal P1):
Session → Messages (history) + Runs (executions). No Thread table P0;
`thread = session` documented. Run = many model/tool iterations
(maxSteps 5 kept). No duplicate assistant messages: single
`streamingContent` per active runId, committed once on `run.completed`.

Permissions: keep modal for compat, add inline approval card in run:
Terminal/file-write/external-uploads show command, cwd, risk
(Read-only vs Destructive), buttons Deny/Allow once/Always allow.
`ALLOW_ALWAYS` writes `tool_policies` as today.

Inspector → Agent Inspector (`Activity/Context/Memory/Artifacts`),
global Settings moves to dedicated modal/route with sections:
General, Appearance, Models & Providers, Agents, Memory, Tools,
Permissions, Advanced, Developer. Unimplemented sections omitted,
not faked. Normal mode clean; Developer mode shows raw events,
latency, token usage (if reported), tool I/O.

Tool presentation: compact `✓ Terminal git status 240ms` expandable
Input/Output/Metadata. No raw JSON dump in chat.

Composer: text + stop only P0. No fake attach/image/slash buttons.
Attachment added only when backend supports it (deferred P2).

Take Control: state-aware from `activeRuns`. Hidden/de-emphasized
when idle; when running shows Stop; kills child procs + aborts SSE.

## 8. Duplicate-output fix direction

Hypothesis (to verify with systematic-debugging, not UI dedup):
`run_events` stores each `TextDelta` chunk; `/stream` replays all
past deltas + live deltas; frontend has no `eventId/sequence`
dedupe so resubscribe/StrictMode double-mount double-appends.
Plus `finalContent` accumulated across steps and saved once while
`streamingContent` never cleared deterministically per runId.
Fix: sequence+eventId idempotent reducer, single active runId guard,
clear streaming state on `run.completed` after commit, cancel stale
EventSource on session switch. No string-dedup hack.

## 9. Testing

- Keep `npm test` green (core_real, e2e_suite, ui_audit).
- New: provider CRUD persist restart; discovery manual add;
  picker switch; stream cancel; capability block; approval allow/deny;
  offline Ollama no crash; latency reported.
- Light + dark theme smoke. No regression memory/tools.

## 10. Out of scope (deferred, not faked)

MCP servers UI+runtime, skills selective injection + enable/disable,
web fetch/browser automation beyond `web_search`, artifacts, advanced
cheap/reasoning/vision/embedding routing, desktop control refinement,
full secrets keychain (P0 uses RAM vault + ref; OS keychain later).
