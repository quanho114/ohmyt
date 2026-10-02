# LobeHub Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay modal cài đặt ohmyt bằng trang Giao diện sát ảnh LobeHub, với mọi tùy chỉnh áp dụng thật vào chat và lưu qua F5.

**Architecture:** Một nguồn trạng thái appearance ở App, mở rộng hook theme hiện có; các consumer nhận cùng cấu hình qua props. Trang cài đặt tái sử dụng sections hiện có, còn preview code/diagram dùng cùng renderer với chat. Chat/Home tiếp tục mounted khi trang cài đặt mở, để giữ draft, phiên và SSE.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind/CSS, lucide-react; bổ sung highlight.js và mermaid. Tests dùng node:assert và Vite SSR hiện có; UI được kiểm chứng bằng browser thật, không thêm test framework.

**Spec:** `docs/superpowers/specs/2026-10-02-lobehub-appearance-design.md` — người dùng đã duyệt bản spec.

## Tiến độ khi tạm dừng theo yêu cầu người dùng

Người dùng đã duyệt spec, duyệt plan và chọn Native. Tạm dừng code theo yêu cầu “xong task 2 thì ghi nhận lại plan và những task chưa xong”; không tiếp tục triển khai cho đến khi người dùng quay lại.

- [x] Task 1: nguồn appearance, normalize/migrate localStorage, hook theme và bootstrap/CSS tokens đã triển khai. `node test/test_appearance.js` đã pass; browser chọn Tối và reload giữ đúng theme/object. Chưa kiểm chứng toàn bộ palette, lỗi ghi storage và flash trên surface mới.
- [x] Task 2: `responseLanguage` đi qua `api.startRun` → POST `/api/runs` → AgentLoop/system context. HTTP validation RED (202 thay vì 400) → GREEN qua `node test/test_e2e_suite.js`; probe thật xác nhận auto/vi/en và giữ instruction cũ. Chưa smoke output của model thật từ UI mới và chưa thêm assertion prompt nguyên văn vào suite.
- [ ] Task 3: đã cài highlight.js/mermaid; tạo `ContentBlock.tsx`, migrate ChatMessage/ChatStage/App dùng renderer, thêm CSS theme. `node test/test_appearance.js` pass kiểm tra source HTML được escape và giữ whitespace. **Chưa kiểm chứng Mermaid trên browser, sanitation/security/race/copy và theme thực tế.**
- [ ] Task 4: đã tạo `AppearanceSettings.tsx`, `settingsLocale.ts`; LSP rename SettingsDialog → SettingsPage và cập nhật App; đổi shell thành full-page, giữ chat mounted, thêm CSS desktop/mobile. **Chưa tích hợp locale vào ProviderSettings/StatisticsSettings hoặc các text timeline/memory/skills; chưa browser smoke/type-check/build.** ProviderSettings chưa nhận prop `locale` mà SettingsPage đang truyền, cần hoàn thiện contract này trước chạy build. Chưa xóa/update các test modal/source-text cũ.
- [ ] Task 5: chưa triển khai auto-scroll, tool auto-expand, context menu, link icon trong chat và response animation thật; chưa smoke toàn bộ acceptance matrix, chạy full suite hoặc cập nhật README/design docs.
- [ ] Review độc lập: chưa thực hiện; cần reviewer sau tích hợp/verification.

**Điểm tiếp tục:** đọc ledger `.superpowers/sdd/2026-10-02-lobehub-appearance/progress.md`, đọc fresh snapshot các file đã đổi, hoàn thiện Task 3–4 đang dở; không làm lại Task 1–2. Giữ tab `stats` và các thay đổi Home/Sidebar/API statistics do người dùng thêm giữa phiên. Repo hiện không có Git, chưa có commit. Trạng thái hiện tại là **implementation đang dở, chưa xác nhận app build/chạy hoàn chỉnh**, không coi test renderer pass là proof UI.

**Ruling mới:** dùng static import cho Mermaid theo rule dự án `ts-no-dynamic-import`; type-only dependencies dùng top-level `import type`. Không quay lại lazy import literal trong plan Task 3. Chi phí: Mermaid nằm trong graph bundle khởi động thay vì lazy chunk.

## Global Constraints

- Dùng React, TypeScript, CSS/Tailwind và lucide-react đã có.
- Chỉ bổ sung thư viện chuyên dụng cho syntax highlighting và Mermaid, vì renderer hiện tại không có hai khả năng này; không tự viết parser ngôn ngữ lập trình hoặc parser Mermaid.
- Không thêm UI framework, state framework hay dịch vụ cloud.
- Sidebar rộng khoảng 260 px; vùng nội dung rộng tối đa khoảng 960 px; thẻ bo góc khoảng 12 px, padding 20–24 px, khoảng cách khoảng 20 px.
- Dưới 768 px, sidebar thu gọn thành điều hướng có thể mở bằng nút; không có cuộn ngang toàn trang tại chiều rộng 360 px.
- Cỡ chữ tin nhắn: slider 12–20 px, bước 1 px, chuẩn 14 px.
- Giữ địa chỉ `#settings/settings` và các hash của providers/memory/skills/timeline hiện có; không tạo hệ routing thứ hai.
- Một nguồn trạng thái appearance ở cấp app; các section settings, chat, code và diagram dùng cùng giá trị.
- Khi localStorage không ghi được, tùy chỉnh vẫn áp dụng cho phiên hiện tại; trạng thái báo “Chưa lưu được trên thiết bị”, không báo đã lưu sai sự thật.
- `prefers-reduced-motion` luôn ưu tiên hơn hiệu ứng đã chọn.
- Không thay toàn bộ chat/sidebar theo LobeHub, không thêm billing/account/subscription, cloud sync, analytics, notification/device management, connectors, prompt marketplace hoặc model routing mới.
- Không thay schema SQLite, secrets, provider contract hoặc engine offline. Language instruction không sửa user prompt và không hứa model tuân thủ tuyệt đối.
- Thư mục hiện tại không có Git repository (commit spec đã báo `not a git repository`); không chạy git init, không tạo worktree hoặc giả báo commit. Nếu người dùng cung cấp repository sau này mới commit các thay đổi đúng phạm vi.
- File có thể thay đổi bởi người dùng trong lúc làm việc: đọc snapshot mới trước sửa, không ghi đè thay đổi ngoài phạm vi.
- Inline execution: red/green trước/sau logic. Subagents: không chạy build/lint/tests/formatter giữa chừng; integration owner thực hiện kiểm chứng sau tích hợp.

## Review Focus

1. Storage chứa field không hợp lệ cạnh field hợp lệ hoặc theme cũ: sửa field hỏng nhưng giữ lựa chọn hợp lệ và theme cũ; ghi storage bị chặn không làm UI báo đã lưu.
2. Mở settings giữa lúc streaming với draft chưa gửi và yêu cầu quyền: run tiếp tục, draft còn nguyên, permission/dừng vẫn dùng được, focus quay lại đúng nút.
3. Đang đọc lịch sử hoặc đã đóng tool thủ công khi token mới tới: không giật scroll, không ép mở lại tool.
4. Mermaid có directives/HTML/callback/link ngoài hoặc đổi theme khi render chưa xong: không chạy nội dung nguy hiểm, không dùng config từ message, không commit render cũ.
5. Escape khi native select/mobile nav/context menu đang mở: đóng lớp gần nhất trước, không rời settings/chat bất ngờ; sao chép lỗi không hiển thị thành công.

## File Map và hợp đồng chia việc

- Create `src/appearance.ts`: type/default/normalization, bootstrap DOM application, locale resolution; không React hoặc network.
- Modify `src/useTheme.ts`: mở rộng hook hiện có để quản lý appearance và lưu; giữ tên hook để tránh rename không cần thiết, nhưng đổi các caller sang return contract mới, không giữ setter theme độc lập.
- Modify `src/App.tsx`, `index.html`, `src/index.css`: bootstrap, một nguồn state, giữ chat mounted, hash/focus, palette và hiệu ứng.
- Create `src/components/ContentBlock.tsx`: code/Mermaid renderer dùng chung cho chat và preview; bỏ CodeBlock nội bộ cũ ở ChatMessage sau cutover.
- Rename `src/components/SettingsDialog.tsx` → `src/components/SettingsPage.tsx` bằng LSP rename_file; rename exported component `SettingsDialog` → `SettingsPage` bằng LSP. Giữ `SettingsTab` union hiện có và migrate imports/callers, không modal wrapper.
- Create `src/components/AppearanceSettings.tsx`: các card/preview của trang Giao diện; helper card/row chỉ nằm trong file này.
- Create `src/settingsLocale.ts`: dictionary Việt/Anh và lookup dùng trong tất cả section cài đặt, gồm ProviderSettings. Không tạo i18n framework.
- Modify `src/components/ProviderSettings.tsx`, `ChatStage.tsx`, `ChatMessage.tsx`, `ToolCallCard.tsx`: consumers thật.
- Modify `src/api.ts`, `server/api.js`, `server/agent_loop.js`: response language tại request/system context.
- Create `test/test_appearance.js`: node:assert + Vite SSR cho normalization, locale và renderer code an toàn; không test defaults/wiring/source text hoặc wording system prompt.
- Modify `test/test_e2e_suite.js`: invalid language boundary và giữ prompt trong real HTTP/DB; dùng daemon isolated hiện có.
- Remove `test/test_ui_audit.js`, `test/test_settings_render.js`: toàn bộ assertions hiện có kiểm tra source text, wording hoặc cấu trúc modal cũ. Không re-pin vào cấu trúc mới.
- Modify `package.json`, `package-lock.json`: dependencies và script tests; README/design docs sau smoke proof.

---

### Task 1: Appearance state, persistence và bootstrap không flash

**Files:** `src/appearance.ts` (new), `src/useTheme.ts`, `src/App.tsx`, `index.html`, `src/index.css`, `test/test_appearance.js` (new), `package.json`.

**Consumes:** các key theme hiện có `ohmyt_theme`, fallback `lobe_core_theme`; CSS variables đang dùng trong app.

**Produces:**

```ts
export type ThemeMode = 'light' | 'dark' | 'system';
export type SettingsLocale = 'vi' | 'en';
export type ResponseLanguage = 'auto' | 'vi' | 'en';
export interface Appearance {
  themeMode: ThemeMode;
  locale: 'system' | SettingsLocale;
  responseAnimation: 'off' | 'snappy' | 'elegant';
  contextMenu: 'off' | 'default';
  responseLanguage: ResponseLanguage;
  accent: 'default' | 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'cyan' | 'sky' | 'blue' | 'purple' | 'magenta' | 'coral';
  neutral: 'default' | 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone';
  antialiasing: boolean;
  fontSize: number;
  transition: 'none' | 'fade' | 'smooth';
  autoScroll: boolean;
  autoExpandTools: boolean;
  linkIcons: boolean;
  codeTheme: 'lobe' | 'github' | 'nord';
  mermaidTheme: 'lobe' | 'default' | 'neutral' | 'forest' | 'dark';
}
export function normalizeAppearance(raw: unknown, legacyTheme?: string | null): Appearance;
export function readAppearance(storage: Pick<Storage, 'getItem'>): Appearance;
export function applyAppearance(value: Appearance, root: HTMLElement, systemDark: boolean): 'light' | 'dark';
export function resolveLocale(value: Appearance['locale'], language: string): SettingsLocale;
export function useTheme(): {
  appearance: Appearance;
  updateAppearance: (patch: Partial<Appearance>) => void;
  activeTheme: 'light' | 'dark';
  locale: SettingsLocale;
  saveState: 'saved' | 'failed';
  toggleQuickTheme: () => void;
};
```

- [ ] **Step 1: Viết kiểm tra failing cho dữ liệu storage hỏng nhưng có field hợp lệ.** Dùng Vite SSR như convention hiện có, cleanup server trong finally:

```js
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true } });
try {
  const { normalizeAppearance, readAppearance, resolveLocale } = await vite.ssrLoadModule('/src/appearance.ts');
  const a = normalizeAppearance({ fontSize: 99, accent: 'purple', autoScroll: false, neutral: 'bogus' }, 'dark');
  assert.equal(a.fontSize, 20);
  assert.equal(a.accent, 'purple');
  assert.equal(a.autoScroll, false);
  assert.equal(a.neutral, 'default');
  assert.equal(a.themeMode, 'dark');
  assert.equal(normalizeAppearance({ fontSize: -8 }).fontSize, 12);
  assert.equal(normalizeAppearance({ fontSize: NaN }).fontSize, 14);
  assert.equal(normalizeAppearance({ fontSize: 15.7 }).fontSize, 16);
  assert.equal(readAppearance({ getItem: key => key === 'ohmyt_appearance' ? '{broken' : key === 'ohmyt_theme' ? 'light' : null }).themeMode, 'light');
  assert.equal(resolveLocale('system', 'vi-VN'), 'vi');
  assert.equal(resolveLocale('system', 'fr-FR'), 'en');
  assert.equal(resolveLocale('vi', 'en-US'), 'vi');
} finally { await vite.close(); }
```

Run once before implementation: `node test/test_appearance.js`; expected unresolved new module or assertions failing. Do not run existing wording/source tests to establish baseline.

- [ ] **Step 2: Implement normalization/persistence using the exact type above.** `ohmyt_appearance` is the new object key; honor valid old theme when new theme is absent/invalid. Validate booleans by typeof, enums by member list, finite font numbers by rounding then clamp. Parse errors fall back per contract. SSR avoids accessing window/document/localStorage on import; lazy hook initialization checks runtime availability.

```ts
const defaults: Appearance = {
  themeMode: 'system', locale: 'system', responseAnimation: 'snappy', contextMenu: 'default',
  responseLanguage: 'auto', accent: 'default', neutral: 'default', antialiasing: true,
  fontSize: 14, transition: 'fade', autoScroll: true, autoExpandTools: false,
  linkIcons: true, codeTheme: 'lobe', mermaidTheme: 'lobe'
};
const fontSize = typeof candidate.fontSize === 'number' && Number.isFinite(candidate.fontSize)
  ? Math.max(12, Math.min(20, Math.round(candidate.fontSize))) : defaults.fontSize;
// In the hook effect, only report saved after BOTH writes succeed.
try {
  localStorage.setItem('ohmyt_appearance', JSON.stringify(appearance));
  localStorage.setItem('ohmyt_theme', appearance.themeMode);
  setSaveState('saved');
} catch { setSaveState('failed'); }
```

`candidate` is raw data only when it is a non-null non-array object. Do not use unchecked object spread to preserve invalid fields. Update App callers to `appearance.themeMode`, `updateAppearance({ themeMode })`; no second theme state. Keep matchMedia event listener lifecycle and listen to languagechange when locale is system.

- [ ] **Step 3: Apply palette/theme/behavior datasets via one bootstrap.** Replace inline bootstrap script with an early module calling the shared helpers; do not create duplicate normalization logic. `applyAppearance` sets data-theme/accent/neutral/response-animation/transition/antialiasing and `--message-font-size`; systemDark determines only resolved theme. Hook reuses the same application function. Use CSS hue/tone tokens for neutral palette and explicit readable accent light/dark pairs; preserve semantic success/warning/danger.

```html
<script type="module">
  import { readAppearance, applyAppearance } from '/src/appearance.ts';
  let storage;
  try { storage = window.localStorage; } catch { storage = { getItem: () => null }; }
  applyAppearance(readAppearance(storage), document.documentElement,
    window.matchMedia('(prefers-color-scheme: dark)').matches);
</script>
```

Handle getter failure as well as getItem/setItem failure in the hook. Add `data-appearance-ready` only after early application and conceal the root until ready if browser smoke reveals a flash; do not add a loading timeout or second config store.

```css
.message-content { font-size: var(--message-font-size, 14px); }
.message-content :is(h2,h3,h4,code) { font-size: inherit; }
.message-content h2 { font-size: 1.35em; }
.message-content h3 { font-size: 1.2em; }
.message-content h4 { font-size: 1.1em; }
[data-antialiasing="false"] body { -webkit-font-smoothing: auto; -moz-osx-font-smoothing: auto; }
```

Remove body Tailwind `antialiased` and fixed sizes in message content that conflict. Read relevant CSS ranges before changing. Keep font family and semantic colors. Response/transition keyframes must be separate and disabled in reduced-motion media query.

- [ ] **Step 4: Green check and browser storage scenarios.** `node test/test_appearance.js`; expected assertions pass. Once surface is wired in Task 4, block Storage.prototype.setItem in a fresh browser tab, change a setting and assert computed property changes while saveState indicates failed. Restore before reload. Exercise mixed valid/invalid storage and verify valid palette survives F5. These browser steps are part of final smoke, not new mock storage persistence suites.

### Task 2: Response language reaches system context, not stored prompt

**Files:** `src/api.ts`, `src/App.tsx`, `server/api.js`, `server/agent_loop.js`, `test/test_appearance.js`, `test/test_e2e_suite.js`.

**Consumes:** `appearance.responseLanguage` from Task 1.

**Produces:**

```ts
// src/api.ts
startRun(sessionId: string, prompt: string, responseLanguage?: ResponseLanguage)
// server AgentLoop
run({ runId, sessionId, prompt, responseLanguage = 'auto' })
buildSystemPrompt(agent, userPrompt, responseLanguage = 'auto')
```

- [ ] **Step 1: Add failing API boundary checks and throwaway context probe.** Keep invalid-language HTTP validation as the permanent regression test below. Do not add permanent assertions pinning English/Vietnamese system-prompt wording. Before implementation, use a throwaway script with real in-memory AppDatabase, real SkillsManager backed by an empty temporary directory and AgentLoop to print `buildSystemPrompt` for auto/vi/en; observe that language selection has no effect yet. After implementation, run the probe again and inspect that existing agent/security instructions remain and only the selected language instruction is added. Close DB/remove temporary directory/script after smoke. Constructor contract from actual code:

```js
const db = new AppDatabase(':memory:');
const skills = new SkillsManager(tempSkillsDirectory);
const loop = new AgentLoop({ db, skills, tools: null, permissions: null, llm: null });
const agent = { system_prompt: 'Keep existing instruction.' };
for (const language of ['auto', 'vi', 'en']) {
  console.log(language, loop.buildSystemPrompt(agent, 'unaltered-user-prompt', language));
}
// db.close() and fs.rmSync(tempSkillsDirectory, { recursive: true, force: true }) in finally
```

In isolated HTTP suite, after session creation add these requests:

```js
for (const responseLanguage of ['invalid', null, 17, {}, ['vi']]) {
  const r = await fetchJson('/api/runs', {
    method: 'POST', body: JSON.stringify({ sessionId, prompt: 'Do not run.', responseLanguage })
  });
  assert.equal(r.status, 400);
}
assert.deepEqual((await fetchJson(`/api/sessions/${sessionId}/messages`)).data, []);
```

Use the actual suite variables/method signatures; add `responseLanguage: 'en'` to its existing accepted run and assert persisted first user content equals the submitted original prompt. Keep existing omitted-language cases. Red run the targeted tests before applying changes.

- [ ] **Step 2: Minimal API and agent changes.** References before changing exported signatures via LSP. Validate before scheduling run; missing field remains auto, null is invalid. Pass language from both session send and Home submit paths through existing shared send handler.

```js
const { sessionId, prompt, responseLanguage = 'auto' } = body;
if (!['auto', 'vi', 'en'].includes(responseLanguage)) {
  return sendJson(res, 400, { error: 'responseLanguage must be auto, vi or en' });
}
// keep existing validation; schedule only after all validation succeeds
agentLoop.run({ runId, sessionId, prompt, responseLanguage });
// append after existing security rules in buildSystemPrompt
if (responseLanguage === 'en') prompt += '\n\n## RESPONSE LANGUAGE\nReply in English.';
if (responseLanguage === 'vi') prompt += '\n\n## RESPONSE LANGUAGE\nTrả lời bằng tiếng Việt.';
```

No persistence/database migrations; no translating fallback tool output. The setting is captured when run starts, not reread during streaming.

- [ ] **Step 3: Green protocol and context checks.** Run `node test/test_appearance.js` and `node test/test_e2e_suite.js`. Final browser smoke changes response language then sends a real run if configured provider is reachable; preserve user prompt and show response. If only offline engine is available, explicitly report output-language observation limitation while retaining request/context evidence.

### Task 3: Shared syntax highlighting and secure Mermaid rendering

**Files:** new `src/components/ContentBlock.tsx`, `src/components/ChatMessage.tsx`, `src/index.css`, `package.json`, `package-lock.json`, `test/test_appearance.js`.

**Consumes:** Appearance, activeTheme from Task 1.

**Produces:**

```ts
interface ContentBlockProps {
  language: string;
  code: string;
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
  isStreaming?: boolean;
}
export function ContentBlock(props: ContentBlockProps): React.ReactElement;
```

- [ ] **Step 1: Add dependencies and red safety test.** `npm install highlight.js mermaid` only; inspect package engine compatibility and use lockfile versions. Add Vite SSR checks rendering ContentBlock with `language: 'unknown_language'` and source containing `<script>alert(1)</script>`. Assert parsed/static markup has escaped text, no executable script, and source whitespace retained. For supported TypeScript assert token span markup and original text content, not a specific theme class/wording.

```js
const code = '  <script>alert(1)</script>\n\n';
const markup = renderToStaticMarkup(React.createElement(ContentBlock, {
  language: 'unknown_language', code, appearance: normalizeAppearance({}), activeTheme: 'light'
}));
assert.ok(!markup.includes('<script>'));
assert.ok(markup.includes('&lt;script&gt;'));
assert.ok(markup.includes('  &lt;script&gt;alert(1)&lt;/script&gt;\n\n'));
```

- [ ] **Step 2: Implement shared code renderer.** Import highlight.js core and explicit language modules JavaScript/TypeScript, JSON, Python, bash, CSS, XML, SQL, Markdown; normalize common aliases. Use `getLanguage` and explicit `highlight`, no highlightAuto. Unknown/plain text renders React text. Highlighted HTML must be output of library with escaped source, never user-provided HTML. Scope theme CSS to code-theme dataset and active light/dark; Lobe/GitHub follow app, Nord remains dark with readable text. Copy source exactly, show success only after awaited clipboard resolves; on rejection show local error status.

```ts
const languageId = aliases[language.toLowerCase()] ?? language.toLowerCase();
const highlighted = hljs.getLanguage(languageId)
  ? hljs.highlight(code, { language: languageId, ignoreIllegals: true }).value : null;
// plaintext is a text node; only library output goes through highlighted HTML branch
```

Do not trim source. Remove `trimEnd` in fenced block parser and migrate every CodeBlock render to ContentBlock; delete obsolete internal CodeBlock function. While an entire assistant message is streaming, display Mermaid source until run completes (safe conservative choice; avoids parsing incomplete blocks and rerender on every token).

- [ ] **Step 3: Implement Mermaid with controlled config and sanitized SVG.** Lazy-load library only for diagrams; disallow message-level init/config directives so message cannot weaken `securityLevel`. No bindFunctions. Render in a detached container; remove it in finally. Serialize initialize/render pairs using one module-level promise chain because Mermaid has global config; include `ponytail:` comment naming this global-config ceiling and separate renderer instances as upgrade if throughput warrants. Chain must recover after rejection.

```ts
const config = {
  startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
  theme: appearance.mermaidTheme === 'lobe' ? 'base' : appearance.mermaidTheme,
  flowchart: { htmlLabels: false }
};
// For lobe, set themeVariables from computed theme CSS tokens before initialize.
// Reject %%{...}%% and leading YAML config frontmatter rather than accepting renderer overrides.
// Source limit 32 KiB and Mermaid maxTextSize/maxEdges configured; oversized source remains copyable.
```

Before inserting SVG, parse with DOMParser and require an SVG root. Remove script, foreignObject, iframe, object, embed, image, use, a, animation elements, event attributes, external href/xlink:href and resource-bearing attributes/CSS not referring to local `#id`. Preserve text and internal marker IDs/fragment URLs. The sanitizer is local to ContentBlock, not a new generic security framework. If sanitation cannot yield a safe diagram, show source and error instead of unsafe SVG. No direct user-source HTML. Track effect generation with cancellation flag before state commit so old theme/source render cannot overwrite newest; IDs use useId plus monotonic render counter, not collision-prone source hashes. Do not reuse generated IDs across diagrams.

- [ ] **Step 4: Verify source/error/security paths in browser.** In final smoke, render sequence diagram, invalid syntax, `<script>`/HTML labels, click callbacks, external links, init directive setting loose security and external images. Assert no script executes, no external requests occur, no unsafe SVG nodes/attributes survive, invalid source is readable and copyable. Rapidly switch theme/source while two diagrams render, assert newest theme on both and no duplicate SVG IDs. SSR safety check goes green now; browser-only sanitizer is verified on real DOM rather than Node source-string assertions.

### Task 4: Full-page settings, localization and complete Appearance surface

**Files:** SettingsDialog → SettingsPage, new `AppearanceSettings.tsx`, new `settingsLocale.ts`, `ProviderSettings.tsx`, `App.tsx`, `src/index.css`, `test/test_ui_audit.js`, `test/test_settings_render.js`, `package.json`.

**Consumes:** hook return contract from Task 1; ContentBlock from Task 3; existing SettingsDialog props for engine sections.

**Produces:**

```ts
// Additional props, replacing independent theme props on SettingsPage:
appearance: Appearance;
onChangeAppearance: (patch: Partial<Appearance>) => void;
activeTheme: 'light' | 'dark';
locale: SettingsLocale;
saveState: 'saved' | 'failed';
// AppearanceSettings consumes the same five values and callback.
// settingsLocale.ts:
export function settingsText(locale: SettingsLocale, key: SettingsTextKey): string;
export function normalizeSearch(value: string): string;
```

- [ ] **Step 1: Record browser failure of current surface and preserve consumer references.** Open actual app `/#settings/settings`, observe modal with theme-only controls; this is the pre-change evidence, not a permanent markup test. Read current App/SettingsDialog/ProviderSettings fresh; LSP references for SettingsDialog/SettingsTab before renames. LSP rename_file then symbol rename; update JavaScript test dynamic imports explicitly where LSP cannot resolve string imports. Delete the two obsolete implementation/wording audits and remove their commands from npm test, replacing with `node test/test_appearance.js`. Do not rewrite them to require new markup.

- [ ] **Step 2: Preserve chat mount and route lifecycle.** Keep Sidebar and Chat/Home tree in a wrapper, `hidden` and inert while settings is open. SettingsPage is a sibling with absolute/inset full-page surface, not dialog; no unmount of ChatStage/Home solely due to opening settings. Track opener HTMLElement before opening and focus it on close, checking isConnected. Restore focus after route render, not before hidden is removed. PermissionModal remains above page; retain inline permission path and settings Dừng tác vụ.

```tsx
<div className="workspace-layout" hidden={isSettingsOpen} inert={isSettingsOpen || undefined}>
  <Sidebar {...sidebarProps} />
  <main>{activeSession ? chatStage : homeView}</main>
</div>
{isSettingsOpen && <SettingsPage {...settingsProps} />}
```

The named JSX variables stand for existing exact props/render branches, not new wrapper APIs. Use existing branches in App, do not create sidebarProps/settingsProps abstraction solely for this shape. Hash parser maps unknown settings tab to settings, explicit supported hashes continue to work. Back/forward uses hashchange. Close updates hash with route history semantics so Back does not land on a blank or dead modal state.

- [ ] **Step 3: Page shell and localization.** Sidebar 260px, main max 960px, sticky/fixed section header outside content scroll. Search filters existing tabs by Vietnamese and English label using NFD/diacritic removal, lowercase and `đ`→`d`; empty result message. Group current live tabs only. Mobile nav toggles with button, returns focus when closed; do not add account/paywall content.

```ts
export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
```

Define two same-key dictionaries typed so missing translations are compiler errors. Translate all UI-owned settings text in Appearance, Providers, Memory, Skills, Timeline (labels, empty/error/save messages and aria labels); leave backend/user-generated messages, names and data intact. ProviderSettings accepts locale and uses the same lookup. No full-app locale rewrite.

- [ ] **Step 4: Implement all cards in spec order with exact consumer keys.** Use local SettingsCard/SettingsRow helpers; radio input groups, native select, range, checkbox switch. Every field updates `onChangeAppearance`, every preview reads same state. Theme thumbnails/mini-layout use CSS/DOM not images. Swatches have translated names, visible check and accessible selected state. Cards:

| Card | Controls / state keys | Preview |
|---|---|---|
| Cài đặt chung | themeMode, locale, responseAnimation, contextMenu, responseLanguage | three theme thumbnails |
| Giao diện ứng dụng | accent, neutral | live miniature chat layout |
| Phông chữ | antialiasing, fontSize | welcome text at actual chosen size |
| Hoạt ảnh chuyển tiếp | transition | Features / Key Highlights and model/vision/plugin bullets |
| Hành vi trò chuyện | autoScroll, autoExpandTools, linkIcons | LobeHub/GitHub local-icon links |
| Chủ đề tô sáng mã | codeTheme | ContentBlock with TypeScript |
| Chủ đề Mermaid | mermaidTheme, local collapsed state | ContentBlock with sequence diagram |

```tsx
<input type="range" min={12} max={20} step={1} value={appearance.fontSize}
  aria-label={settingsText(locale, 'fontSize')}
  onChange={e => onChangeAppearance({ fontSize: Number(e.currentTarget.value) })} />
<ContentBlock language="typescript" code={'const person = { name: "Alice", age: 30 };\ntype Person = typeof person;\n'}
  appearance={appearance} activeTheme={activeTheme} />
<ContentBlock language="mermaid" code={'sequenceDiagram\n    Alice->>John: Hello John, how are you?\n    John-->>Alice: Great!\n    Alice->>John: See you later!\n'}
  appearance={appearance} activeTheme={activeTheme} />
```

Select option lists exactly as spec. Theme thumbnail selection persists, helper for font smoothing states macOS limit, response language states next-run behavior. Show honest saveState per card, not cloud icon. Store collapse/nav/search state locally, not in appearance persistence.

- [ ] **Step 5: Escape and accessibility.** Native select retains keyboard behavior; do not attach a document-level Escape handler that preempts native controls. Page handles unconsumed Escape only when target is not a select with focus; mobile nav consumes Escape and closes first. Permission dialog cancel/keyboard remains its own layer. Native radios allow arrows; switches have checked/name; headings and nav landmark IDs unique. Theme and palette selections visible beyond color. Focus states follow accent with readable contrast.

- [ ] **Step 6: Browser layout/integration checks.** Light/dark desktop plus 360px screenshot; inspect computed content/sidebar widths, no document horizontal overflow, card order and independent scroll. Open every live section; search `giao dien`, `appearance`, no-match; native keyboard radios/switch/range and locale switch. During a real streaming run, type unsent draft, open settings, change palette, return; assert same run and draft. Trigger permission request then open settings and approve/deny/stop through the real surface. Check direct hash and browser Back/Forward and opener focus. Do not call a CSS/source audit proof.

### Task 5: Wire chat behavior, context menu and complete end-to-end proof

**Files:** `ChatStage.tsx`, `ChatMessage.tsx`, `ToolCallCard.tsx`, `App.tsx`, `src/index.css`, `test/test_appearance.js`; after smoke: README and existing design docs.

**Consumes:** appearance/activeTheme from App; renderer ContentBlock; all completed page controls.

**Produces:** working auto-scroll/tool expansion/link icons/context menu/animations/font across actual chat; updated documentation and verification evidence.

- [ ] **Step 1: Trace and reproduce current scroll/tool behavior.** Read ChatStage message scroll container and ChatMessage tool list; actual browser scenario shows current unconditional `scrollIntoView`. Verify user scroll position/draft behavior before fix and a running tool begins collapsed. For reproducibility use real ephemeral daemon or configured local tools, not fabricated assistant output. Browser renderer edge scenarios may use throwaway DOM mount of actual component, never a permanent fake app.

- [ ] **Step 2: Implement near-bottom scroll without stealing user position.** Add scroller ref and onScroll tracking with 80px distance threshold. Capture near-bottom from user scroll event before content mutation; effect only follows updates when appearance.autoScroll and nearBottom true. Session change reinitializes scroll once, but settings hide/show must not count as session change. Keep reduced-motion auto scroll; while streaming avoid repeated smooth animations building a scroll queue.

```ts
const nearBottomRef = useRef(true);
const handleScroll = () => {
  const el = scrollRef.current;
  if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
};
// in content update effect; session effect is separate
if (appearance.autoScroll && nearBottomRef.current && scrollRef.current?.clientHeight) {
  messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
}
```

Retain last known near-bottom while hidden; do not overwrite from zero-height hidden layout. If user disables autoScroll, do not force scroll on token/tool update or setting reenable. They can scroll to bottom to resume following.

- [ ] **Step 3: Running tool expansion respecting user override.** Thread appearance.autoExpandTools to ToolCallCard. Use per-tool manual override reset only when tool.id changes; effective expanded is manual value if set, otherwise true while autoExpandTools and running. Initialize nothing per token. User toggle sets explicit boolean; completing tool does not mutate manual choice. For default automatic state, completed tool can collapse when it was never manually opened.

```ts
const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
const expanded = manualExpanded ?? (autoExpandTools && tool.status === 'running');
// component keyed by tool.id; clicking commits user choice
onClick={() => setManualExpanded(!expanded)}
```

Ensure actual list keys are tool IDs, not array index. No permission changes.

- [ ] **Step 4: Link icons and message context menu.** Keep existing safe Markdown link handling; normalize URL with URL constructor and require http/https. Use local lucide Link/Github icon depending on URL hostname, no favicon network. appearance.linkIcons toggles icon only. Message body owns context menu event, skips targets matching `a,input,textarea,select,button,pre,svg,[data-content-block]`. Selection must belong inside this message; otherwise copy entire message source.

```ts
if (appearance.contextMenu === 'off' || (event.target as Element).closest('a,input,textarea,select,button,pre,svg,[data-content-block]')) return;
const selection = window.getSelection();
const selected = selection && selection.rangeCount && body.contains(selection.anchorNode) && body.contains(selection.focusNode)
  ? selection.toString() : '';
event.preventDefault();
// store selected || message.content and viewport-clamped x/y in local menu state
```

Menu item copies saved selected text, supports keyboard Enter/Escape, closes on outside click, restores message focus appropriately. Await clipboard and only then show copied; report failure without claiming success. No global interception in settings/native controls.

- [ ] **Step 5: Apply response/transition/font on real messages.** Remove fixed message font sizes conflicting with CSS variable. Dataset/mode classes drive cursor/fade/smooth; stable message.id keys prevent history remount on TextDelta. Apply transition only on new messages/settings sections, not each streaming update. No token batching, timers, typewriter queues or speed tuning. Hover/focus reveal metadata stays accessible; controls are not inflated by message font slider.

- [ ] **Step 6: Runnable final checks and browser acceptance matrix.** Run once after integration, read exit codes/full failure evidence; fix root cause without rerunning a reported failure merely to confirm:

```text
npm run build
npx tsc --noEmit
npm test
```

npm test contains existing core/isolated protocol checks plus test_appearance, with removed source/wording audits absent. Browser launch actual daemon/frontend using repo scripts (`npm run daemon` and `npm run dev`, or existing reachable app; no port collision). Read browser tool docs before first use, open tab, execute controls, capture screenshots and close test tab. Do not assume a running production server serves the latest build; verify the served change.

Final matrix, recorded in delivery:

- light/dark/system and dynamic system change; all accent/neutral presets; refresh preserves state; quick theme and settings agree;
- locale system/vi/en across all settings sections; response language next run and invalid admission;
- font 12/14/20 on existing chat content; smoothing property and Windows visual limit;
- response off/snappy/elegant and transition none/fade/smooth; reduced-motion overrides and complete streaming text;
- autoScroll off with incoming tokens, enabled near bottom, enabled while reading history; no forced jump;
- tool auto-expand enabled, manual collapse persists, error/completed output stays accessible;
- link icon toggle without network, context menu selection/full copy, native menus unchanged, clipboard denied;
- code TypeScript/unsupported/HTML source, exact copy and themes across light/dark;
- Mermaid valid/invalid/incomplete/unsafe/directive/oversized, theme race and multi-diagram unique IDs;
- storage malformed JSON/partial invalid/blocked writes; correct save label and live effect;
- desktop/mobile 360px layout, search, keyboard, Escape nearest layer, focus restore, hash/back/forward;
- settings during run/draft/permission, return to same session and Stop works.

Keep a small regression check for uncertain boundaries in test_appearance and API suite; browser interaction evidence remains necessary. Throwaway scripts/mounts removed after proof. No new per-control default/wiring tests.

- [ ] **Step 7: Update existing usage/design docs after smoke.** README: describe settings page, local persistence and storage failure, supported controls, response language/model compliance limit, macOS smoothing limit and code/Mermaid safety behavior; correct outdated modal/Inspector/test references. Existing `docs/design-chatbot/SCREENS.md`, `COMPONENTS-UX.md`, `TOKENS.md` updated where they describe changed appearance/settings surfaces. Read affected sections first, do not replace unrelated design. No fake cloud status or claim full LobeHub parity. Report only checks actually exercised and any provider/macOS observation limits. No commit in current non-Git workspace.

## Spec Coverage / Self-review

| Spec sections | Owning tasks |
|---|---|
| 1–2 scope/reuse/dependencies | Global constraints, Tasks 3–4 |
| 3 desktop/mobile/search/hash/mount/focus/stop | Task 4 |
| 4 theme/locale/response/menu/output language | Tasks 1–2, 4–5 |
| 5 accent/neutral/live layout preview | Tasks 1, 4 |
| 6 font/smoothing/clamp | Tasks 1, 4–5 |
| 7 transitions/reduced-motion/no replay | Tasks 1, 4–5 |
| 8 scroll/tool/link behavior | Task 5 |
| 9 syntax highlighting/themes | Tasks 3–4 |
| 10 secure Mermaid/async/source fallback | Tasks 3–4 |
| 11 storage/migration/bootstrap/failure | Task 1, Task 5 smoke |
| 12 cutover/callers/docs/tests | File map, Tasks 1–5 |
| 13 all acceptance criteria | Task-specific checks and Task 5 matrix |
| 14 out of scope | Global constraints |
| 15 approval | Spec reviewed; plan awaits review/method selection |

Review Focus owners: (1) Task 1 normalization test + storage browser scenario; (2) Task 4 streaming/draft/permission browser scenario; (3) Task 5 scroll/tool scenario; (4) Task 3 unsafe/race browser scenario; (5) Tasks 4–5 native/menu Escape and clipboard denied scenario. Types, enum values and method signatures above are the integration contract; implementation must not invent sibling variants.
