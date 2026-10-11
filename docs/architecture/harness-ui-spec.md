# Harness UI implementation decisions

Baseline inspected 2026-10-09 via in-app browser, Vite port5178. Home already has top chrome, sidebar, centered composer, suggestions, model and approval controls. Keep these positions. Settings uses grouped left navigation and content pane; add extensions and connections to existing engine group. Design tokens in src/index.css remain authoritative.

Busy composer: draft stays editable; choose queue/steer in a compact native-style menu, send label reflects choice. Pending messages sit above composer as text rows with edit/remove, not colored cards. Pause/continue lives in response activity next to stop, with server-confirmed status.

Extensions: name/status list, one detail view; use form rows and inline errors. No hero/header stats. Presets use the existing model-control area; hide selector for one preset. Subagent progress stays inside owning response activity. Artifacts select the existing right pane without stealing focus on update.

Acceptance: actual server data; empty/error/loading/save states; VI/EN; keyboard and focus restoration; existing light/dark tokens; screenshots 1280×800,1440×900,1920×1080,768×700. Baseline browser viewport does not by itself prove all size/theme states; full capture belongs to UI tasks.
