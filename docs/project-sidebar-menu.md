# Project sidebar menu

Reference: https://learn.chatgpt.com/docs/projects (reviewed 2026-10-05), plus the user's Codex menu screenshot.

The official documentation describes pinning as sidebar organization rather than a change to context or access. It describes archiving a project's chats together and restoring archived chats. The screenshot provides the requested six menu entries and their order.

Implemented in ohmyt:

- Pin/unpin: persisted on the project; pinned projects appear first. Unpinning returns the project to its previous section.
- Edit: change the display name, inspect the working-directory path. The directory itself is unchanged.
- Section: move to Projects, Pinned, an existing named section, or create a named section while moving the project there. Section names currently exist while referenced by a project.
- Open in file manager: Electron validates an absolute directory and calls the OS file manager. The web version shows an explanatory error rather than a fake action.
- Archive conversations: a confirmation explains the count and recovery flow. Archived chats leave sidebar and home recents, remain readable, and can be restored individually through the Archived screen. New chats in the same project start unarchived.
- Remove project: permanently delete the project, all its chats (including archived chats), messages, runs/events, scoped memories, and scoped permissions in one transaction. Files on disk are retained. Adding the same directory again creates a fresh identity with no history. Removal is rejected while a project task is running. Reopening projects hidden by older versions also discards their old data before creating a new identity.

ohmyt currently supports one working directory per project. Codex's newer multiple-folder project editing is not implemented by this menu update.

Data: additive SQLite columns `projects.pinned`, `projects.section`, and `sessions.archived_at`. Existing project identity and scope boundaries are retained. Session listing retains archived records so the client can show the archive manager and open archived transcripts.

Validation:

- Project API tests cover bad inputs, missing records, name normalization, pin/section persistence, archive idempotence, individual restore, and fresh chats after archive.
- Project isolation and migration tests confirm memory and permission boundaries remain intact.
- Browser checks against an isolated in-memory test database cover pin, rename, section creation, archive, restore, reload, keyboard navigation, and the web-only folder-opening error.
- Production build, TypeScript check, Electron syntax checks, and session-title regression tests pass.
- Launching the native OS file manager was not exercised in the browser test environment.
