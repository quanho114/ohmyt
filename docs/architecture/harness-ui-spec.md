# Harness UI implementation decisions

Current decision (2026-10-14): hide the internal Extensions inventory from user
Settings. Runtime services and builtin plugins are implementation details, not
user-installed utilities. Remove the navigation entry and render branch; legacy
`#settings/extensions` links fall back to Appearance. Keep backend plugin lifecycle
and diagnostic APIs intact. The older Extensions layout below is historical.

Connections stay in the existing Settings page. Use the same flat surface and
theme tokens, with a compact empty state and a single-column form. Generate IDs
internally; let users choose a web address or a program on their computer using
plain labels. Show authentication only when expanded, preserve saved credentials
on edit, and show program arguments only for local connections. Keep project scope,
revision checks, explicit test/connect/disconnect and inline failures. No extra
advanced-settings page, integration marketplace or decorative cards are introduced.

Validation: types/build, backend connector regression and
`node test/ui/test_connector_settings_ui.js` passed. The browser suite exercises failed
save draft retention, generated IDs, saved-token/revision retention, actual MCP
test/connect/disconnect, keyboard cancellation and narrow-screen layout. Screenshots
were inspected at 1280×850 light and 390×844 dark; other viewport sizes and slowed
animation playback were not verified in this pass.

Baseline inspected 2026-10-09 via in-app browser, Vite port5178. Home already has top chrome, sidebar, centered composer, suggestions, model and approval controls. Keep these positions. Settings uses grouped left navigation and content pane; add extensions and connections to existing engine group. Design tokens in src/index.css remain authoritative.

Busy composer: draft stays editable; choose queue/steer in a compact native-style menu, send label reflects choice. Pending messages sit above composer as text rows with edit/remove, not colored cards. Pause/continue lives in response activity next to stop, with server-confirmed status.

Extensions: name/status list, one detail view; use form rows and inline errors. No hero/header stats. Presets use the existing model-control area; hide selector for one preset. Subagent progress stays inside owning response activity. Artifacts select the existing right pane without stealing focus on update.

Acceptance: actual server data; empty/error/loading/save states; VI/EN; keyboard and focus restoration; existing light/dark tokens; screenshots 1280×800,1440×900,1920×1080,768×700. Baseline browser viewport does not by itself prove all size/theme states; full capture belongs to UI tasks.

### Trace rows (2026-10-15)

Response activity uses expandable reasoning, tool and source rows. Reasoning opens
while thinking and collapses when that phase ends; users can override each row.
Tool details retain the existing auto-expand preference, execution status,
uncertain-outcome warnings and artifact actions. Compatibility messages without runtime activity retain their existing tool cards.
Sources are derived from completed tool results, deduplicated
by URL and restricted to HTTP(S). Labels follow the existing VI/EN locale; timing
comes from recorded activity rather than the sample's fixed thinking duration.
The shared disclosure is implemented locally in `src/components/ui/Trace.tsx`;
no AI SDK transport or demo command execution is added.

Trace visual follow-up: rows now use a leading status circle, inline disclosure
chevrons and 28px row height, without an Activity group heading. Expanded output
has an indented branch line and a rounded neutral code surface in both themes.
The response-level disclosure and unverified-outcome notice remain available;
real execution statuses are preserved rather than copying the demo's outcomes.

Trace disclosure motion: reasoning, sources and tool output share a persistent
CSS grid disclosure (220ms height, 160ms opacity). Visited output remains mounted
on close; collapsed panels are inert and aria-hidden immediately. Animation
respects the existing animation preference and reduced-motion setting. Browser
regression samples intermediate heights on expansion and collapse rather than
checking only final open/closed states.

Manual Trace inspection pauses chat following in the scroller's capture-phase
click handler, before disclosure state changes and resize notifications. This
keeps the clicked row at its reading position while detail grows below it,
including during streaming. The existing latest-message button resumes following.
The browser regression reproduces the original upward movement before the fix
and samples trigger position during expansion, keyboard collapse and new output.

Code blocks support a per-block wrap toggle and plain-text download alongside
existing copy and expand controls. Numbered source rows grow with wrapped lines;
multiline highlight tokens are carried across source rows. The optional filename
sets the header and download basename; otherwise the download uses snippet plus
the language extension. Copy and download always use the original source, without
line numbers. Mermaid rendering and its existing sanitization remain separate.
Validation: `node test/ui/test_code_block_ui.js`, `node test/ui/test_appearance.js`,
frontend type check and build. The browser regression checks narrow wrapping,
multiline highlighting, clipboard contents and downloaded bytes.

Code Block visual alignment: use one rounded code surface for header and source,
without header/gutter dividers or shadow. The title uses a file icon and stronger
weight; the header has exactly three icon actions (wrap, download, copy). Long
blocks show an additional expand/collapse icon in the top-right toolbar. Syntax colors continue to follow the
user's selected code theme rather than forcing the reference screenshot palette.

### Chat composition follow-up (2026-10-15)

A newly appended user turn reserves at least one viewport from its top, so the
question anchors at the top of the reading area while a short response fills the
space below. Opening history does not apply this reservation. Manual reading and
Trace inspection still pause following; a new sent turn resumes it only when the
user's auto-scroll preference is enabled.

The composer + menu includes Web Search and Deep Research prompt starters. They
preserve the draft topic and require Send; they use existing agent/web tools and
do not introduce a separate research runtime or guarantee source availability.
Add document opens the existing desktop document picker and workspace for the
current scope. Existing document snapshot/context synchronization supplies model
context, rather than introducing another upload or permission path. Images retain
their separate attachment flow. Document picking is disabled during active work.

Validation commands: `node test/ui/test_chat_context_ui.js`,
`node test/ui/test_chat_history_ui.js`,
`CHAT_MOTION_BROWSER=chrome CHAT_MOTION_CHECKS=1 node test/run_chat_motion.js /tmp/chat-motion.json`,
frontend type check/build, and the document workspace Electron regression.

Questionnaire human input replaces the all-questions form with a focused stepper:
progress, letter-key choices, an alternate text answer, previous/next navigation
and a final submit that returns all answers to the existing request_user_input
service. Draft answers persist across steps; required questions cannot be skipped.
Multiple-choice selection and optional questions are not advertised because the
current service contract accepts one required string per question. Project picking
keeps its existing separate flow. The browser regression covers navigation,
retained answers, keyboard choices, same-request submission and narrow layout.

Approval checkpoint replaces the raw tool-first modal with a localized action
heading, target, optional description and collapsed technical details. Once-only
approval is the default. A scoped remember checkbox selects the existing
ALLOW_ALWAYS decision; it resets per request. DENY remains the initial keyboard
focus, and Escape/close deny the request. The native modal preserves focus trapping.
Shell/file-write and external-action impact notes remain visible. Authorization,
run binding and the permission queue are unchanged. Validation includes
`node test/ui/test_approval_checkpoint_ui.js`, approval-mode regressions, types/build.

Approval simplification: remove the duplicate waiting label and explanatory intro,
show the target as plain text (commands retain a code surface), and move the raw
agent description into technical details. Use a compact 420px dialog with two
right-aligned text buttons and the existing scoped remember checkbox. This is a
presentation-only change with no new dependencies or permission mechanisms.

Outcome presentation: a normally settled turn with only completed tool receipts,
no unresolved calls and no stop reason may show the neutral “Steps executed”
summary even when taskStatus is unknown because no host verifier ran. Expanded
activity explains that task-level verification remains absent. Errors, aborted
turns, unresolved calls and unknown execution outcomes retain their warnings.
This presentation does not alter persisted task outcomes or claim verification.

Human-input selection guidance now explicitly distinguishes user-owned design
choices from harmless implementation assumptions. With unknown audience/style or
material requirements, a tailored plan should request focused input through the
existing tool before a long proposal. Generic examples, alternative ideas and
explicitly delegated choices remain direct answers. Users never need to mention
tool names. This is model guidance, not a keyword router or a guarantee of model
compliance. Scripted regressions verify prompt delivery and pause/continuation;
actual natural-language tool selection still requires live-model evaluation.
