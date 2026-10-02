# Codex-Inspired UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lobe Core’s existing chat screen feel as clean and rounded as the supplied Codex reference while keeping its local-first features and current information architecture.

**Architecture:** Keep the existing React two-pane shell and state flow. Rework the visual hierarchy in the existing CSS and chat components: a quiet session sidebar, a centered conversation column, right-aligned user bubbles, and a floating composer with the model selector in its toolbar. Keep settings, permissions, streaming, and tool execution behavior intact.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, existing CSS variables and Lucide icons. No new dependency.

**Spec:** This plan’s “Design brief” section, based on the user’s request and the two attached screenshots.

## Global Constraints

- Preserve session creation, search, selection, and deletion behavior.
- Preserve model selection, streaming, stop, copy, tool details, permission decisions, settings, and both theme modes.
- Keep Vietnamese product copy and the current local-first concepts; do not fabricate Codex-only Projects, Pinned, or navigation destinations.
- Do not recreate browser or operating-system chrome that sits outside the web app.
- Use the current React/Tailwind/CSS stack and add no dependencies.
- Make the desktop light theme match the reference most closely; keep dark mode coherent and readable.

## Review Focus

- Port 3188 serves built files from `dist`; editing `src` alone does not update the displayed page.
- A long prompt, tool target, or code block must not widen the centered conversation column.
- Streaming and permission requests must remain legible inside the new message and tool surfaces.
- Moving the model selector must preserve the same selected model and `onSelectModel` behavior.
- Sidebar collapse and composer width must remain usable at narrow viewports.

## Design brief

The reference’s visual identity comes from its proportions and hierarchy more than from large corner radii: a pale sidebar separated from a white work area; quiet, compact navigation; one centered reading column; a user prompt in a soft blue bubble; and a rounded composer floating at the bottom with its controls in one row. The supplied Lobe Core screen instead has a uniformly gray canvas, a full-width black create-session button, a narrow centered welcome block with four bordered cards, message rows with repeated identity labels, and a composer attached to a full-width bottom divider.

The Codex screenshot also includes the Codex app’s own navigation rail, project groups, and host chrome. Those elements have no matching destinations in Lobe Core, so this redesign will not add decorative or nonfunctional copies. It will bring the existing sidebar and chat area closer through surface colors, spacing, alignment, type scale, and message/composer treatment.

### Target layout and visual rules

- **App shell:** Keep the two-pane layout. Use a warm-neutral sidebar (`#fafafa`) with a thin divider and a pure-white chat canvas. Keep the existing desktop sidebar width near 17–18rem.
- **Sidebar:** Use a restrained brand header, a light “Phiên làm việc mới” action instead of a black slab, a compact search field, a clear “Gần đây” label, and 34–38px session rows. The active row gets a quiet neutral fill without a strong outline. Keep SQLite/tools and settings in the footer.
- **Chat header:** Keep the current session title and connection state on the left. Keep theme and refresh actions on the right. Remove model choice from this row so it does not compete with the conversation title.
- **Conversation:** Constrain messages and composer to the same centered column, approximately 46–48rem at desktop and `100%` minus side padding on smaller screens. Assistant messages stay plain on white; user messages align right in a pale blue, rounded bubble capped around 34rem. Keep copy controls, timestamps, streaming indicator, and tool output.
- **Empty state:** Reduce the centered welcome treatment to a short introduction and compact versions of the existing quick actions. Let the composer remain the primary focus; do not add new actions or content.
- **Composer:** Center it at the bottom of the chat column, with a white surface, thin neutral border, soft shadow, and 20–22px corners. Remove the full-width top divider. Keep the resizable textarea. Put “Local-First · Memory active” on the left of the toolbar and the model selector plus send/stop action on the right, matching the reference’s control placement.
- **Tool and dialog surfaces:** Use the same neutral border, restrained shadow, and consistent 12–18px corner scale for tool cards, permissions, and settings. Preserve warning/success colors for meaning.
- **Responsive behavior:** At narrow widths, retain the current compact sidebar behavior, keep all controls reachable, stack or wrap composer toolbar content, and prevent horizontal overflow in messages and tool output.

## File map

- `src/index.css` — theme tokens, shared surface/radius rules, centered column sizing, sidebar/composer styling, and narrow-screen rules.
- `src/components/Sidebar.tsx` — visual grouping and styling for brand, create-session action, search, active session, and footer; no session logic changes.
- `src/components/ChatStage.tsx` — header hierarchy, compact empty state, centered feed, and composer toolbar/model-picker placement.
- `src/components/ChatMessage.tsx` — assistant/user alignment and surfaces while retaining timestamps, copy, markdown, and streaming behavior.
- `src/components/ModelPicker.tsx` — correct its surface token (`--bg-surface` is not defined; use the existing `--surface`) and keep its selection API unchanged.
- `src/components/ToolCallCard.tsx`, `src/components/PermissionModal.tsx`, `src/components/SettingsDialog.tsx` — align corner radii and surfaces without changing tool, permission, or settings behavior.
- `src/App.tsx` — no planned state/API changes; only touch if the existing layout needs a presentational wrapper, and do not move session or streaming logic.

## Implementation tasks

### Task 1: Establish the light shell and quiet sidebar

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:** Keep all `SidebarProps` unchanged. Keep existing CSS variables as the shared theme API.

- [ ] Update the light theme so the chat canvas is white, sidebar is `#fafafa`, hover/active surfaces are subtle neutral fills, and the action accent is a restrained blue. Keep dark theme values separately defined.
- [ ] Restyle the create-session action as a white, bordered, rounded row; remove the black filled appearance. Keep its click target and accessible name unchanged.
- [ ] Increase session row hit area to 34–38px, soften active styling, and align search/section/footer spacing with the target layout.
- [ ] Check the sidebar at desktop and at the existing `max-width: 700px` compact breakpoint; retain labels, titles, and focus behavior already provided.

**Deliverable:** The app immediately reads as a white workspace with a quiet, separate session sidebar.

### Task 2: Rebalance the chat header, empty state, and composer

**Files:**
- Modify: `src/components/ChatStage.tsx`
- Modify: `src/components/ModelPicker.tsx`
- Modify: `src/index.css`

**Interfaces:** Keep `ChatStageProps` and `ModelPicker`’s `{ providers, value, onChange }` API unchanged.

- [ ] Set one shared centered width for the feed and composer, targeting 46–48rem on desktop with responsive side padding.
- [ ] Keep session title/status in the header and move `ModelPicker` into the composer’s lower toolbar before send/stop. Do not change how model choice is persisted.
- [ ] Remove the full-width border above the composer. Give the composer a 20–22px radius, a thin border, and a restrained shadow; keep textarea auto-height and existing Enter/Shift+Enter behavior.
- [ ] Keep the local-first/memory label on the left and model/send/stop controls on the right. Allow that row to wrap or compact at narrow widths.
- [ ] Replace the large empty-state card grid with the same welcome text and quick prompts in a more compact treatment; preserve all four existing prompt actions.
- [ ] Change `ModelPicker`’s undefined `--bg-surface` reference to `--surface` so it inherits the active theme correctly.

**Deliverable:** The conversation area and composer share the same visual column; the model control sits where Codex users expect it.

### Task 3: Match message hierarchy and soften tool output

**Files:**
- Modify: `src/components/ChatMessage.tsx`
- Modify: `src/components/ToolCallCard.tsx`
- Modify: `src/index.css`

**Interfaces:** Keep `ChatMessageProps` and `ToolCallCardProps` unchanged. Do not change message or tool data.

- [ ] Render user messages as right-aligned pale-blue bubbles with a readable maximum width; keep assistant responses left-aligned in the centered feed without a full-row fill.
- [ ] Reduce repeated visual chrome around assistant identity while retaining copy, timestamp, markdown, streaming cursor, and all accessible labels.
- [ ] Give tool-call summaries and code blocks consistent neutral surfaces and 12–14px corners. Keep status color, expand/collapse, copy, and output limits unchanged.
- [ ] Verify long user prompts, code blocks, and tool targets wrap or scroll inside the feed rather than widening it.

**Deliverable:** The conversation reads like a Codex thread rather than a list of boxed records.

### Task 4: Carry the surface system into settings and permissions

**Files:**
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/components/PermissionModal.tsx`
- Modify: `src/index.css`

**Interfaces:** Keep dialog props, tab IDs, permission choices, and callbacks unchanged.

- [ ] Match dialog/modal corner scale, border, header/footer spacing, and surface colors to the redesigned chat.
- [ ] Keep warnings distinct and preserve keyboard focus styling, dialog labels, and all current actions.
- [ ] Check that the settings layout still stacks at the current small-screen breakpoint and that the permission modal remains within the viewport.

**Deliverable:** Secondary screens feel like the same application without changing settings or approval flows.

### Task 5: Rebuild and compare the real served UI

**Files:**
- No planned product-code changes unless visual review exposes a specific mismatch.

- [ ] Run `npm run build` so `dist` contains the updated CSS and components.
- [ ] Since `localhost:3188` serves `dist`, reload that page after the build; alternatively, use Vite on port 5173 for live iteration while the API daemon on 3188 is running.
- [ ] Compare screenshots at 1920×1080 and 1280×800 against the supplied reference, checking sidebar proportions, column width, bubble alignment, and composer placement.
- [ ] Check a narrow viewport, the dark theme, an empty session, a populated conversation, streaming/tool output, settings, and a permission request.
- [ ] Confirm session selection/search/delete, model choice, send/stop, and dialog actions still work through their existing handlers.

**Deliverable:** The screenshot reflects the edited source, and the primary interaction states remain usable.

## Execution order

Run Tasks 1–3 first because they establish the core visual language. Task 4 applies that language to secondary surfaces. Task 5 rebuilds and reviews the complete result. Tasks 1 and 2 touch separate components but share `index.css`; keep their CSS edits sequential to avoid conflicting token/layout changes.

## Not in scope

- Adding Codex-only project groups, pinned items, right inspector, or app-wide navigation destinations.
- Rewriting agent state, API calls, streaming, or persistence.
- Adding packages, animation systems, or a new design-token framework.
- Reworking desktop window/browser chrome.
