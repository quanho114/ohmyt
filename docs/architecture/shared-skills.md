# Personal skill discovery

Skills settings reads `SKILL.md` files from `~/.agents/skills`,
`~/.claude/skills` and `~/.codex/skills`, including nested system folders.
Discovery is bounded to three directory levels, 1,500 entries per source and
256 KiB per skill. Missing folders and malformed/unreadable skills are skipped.
Child symlinks are not followed. Plugin cache directories and project folders are
not scanned. Existing ohmyt imports and built-in skills remain available.

Personal skills have stable IDs derived from their canonical file paths, explicit
source/path metadata, YAML descriptions and original source for Preview/Source.
They start disabled. Enable switches save only an ohmyt-owned
`skills/.external-state.json` preference file. PATCH only accepts a boolean
`enabled` for external IDs; editing and deleting their source is rejected.
Refreshing discovers additions, removals and edits without copying the files.

External metadata cannot mark a skill built-in or assign a project scope. Enabled
personal skills use the existing unscoped skill catalog and `skill_load` path,
which makes them available to both standalone and project chats. Loading skill
instructions grants no tools or permissions. Project isolation and authorization
remain enforced by the existing runtime. All enabled entries are included in the catalog; exact enabled IDs are resolved
by `skill_load`. Explicit project-scoped skills remain restricted to that project.

The settings list provides search, source filters, independent enable switches,
refresh, descriptions and file paths. The detail pane shows rendered Markdown or
original source. External files have a read-only label and no uninstall action.

Validation: `node test/core/test_external_skills.js` and
`xvfb-run -a npx electron --no-sandbox --ozone-platform=x11 test/ui/test_external_skills_ui.cjs`.

The compact library uses a 57/43 desktop split, subdued selection, source badges
and separate source labels. The inspector has a compact header, close-preview
control, segmented Preview/Source control and collapsed metadata. Markdown uses
React Markdown with GFM for paragraphs, lists and tables; raw HTML stays disabled
and images are represented by their alt text without fetching external content.
