# Browser Use integration plan

## Target confirmed by the user

Computer use within ohmyt's Chrome pane, similar in interaction to Codex's browser.
The ohmyt agent retains its single planning/model/memory/permission loop.

## Delivered architecture

1. Optional pinned Browser Use Python runtime; bounded JSONL direct actions.
2. Per-run CDP proxy exposes only website tabs from IntegratedBrowser, using
   webContents.debugger instead of an app-wide remote-debugging port.
3. DOM actions, dropdowns, text finding, tab management and history navigation.
4. Native screenshot, coordinate mouse, keyboard and drag tools in the same pane.
5. Shared run ownership, user takeover, stale observations and cleanup.
6. Persistent Settings UI, exact domains, opt-in by default and normal approvals.
7. Per-chat files, upload/download capture, PDF, selected-model structured extraction
   and read-only recovery (see browser-use-files-plan.md).
8. Actual Electron/Python/browser verification plus permission/isolation checks.

## Acceptance

- Disabled settings launch no Python processes and expose no Browser Use tools.
- App UI, controls and HTML previews never enter CDP target discovery.
- Project chats, LOCAL_ONLY and DENY cannot acquire new browser powers.
- DOM and visual snapshots have distinct identities; mutations require fresh state.
- User takeover prevents subsequent actions, including cached upstream observations.
- Completed/aborted runs release leases and CDP without closing integrated tabs.
- Existing browser paths and regression tests remain available.

## Deliberate boundaries

Cloud, upstream autonomous Agent/CLI, arbitrary evaluate,
LLM judge and full-desktop automation are not part of the confirmed Chrome goal.
Domain/field checks are not network sandboxing. Shared integrated browser login
state differs from temporary standalone profiles. See browser-use.md for details.
