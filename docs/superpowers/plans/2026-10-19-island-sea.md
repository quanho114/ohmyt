# Island Sea implementation

Approved direction: docs/superpowers/specs/2026-10-19-island-sea-design.md and
user-approved pixel ocean concept. Execution requested in this conversation.

1. Generate original ocean/world art and transparent boat sprite; store final
   assets in public/island-sea with provenance. Preserve full concept palette.
2. Add pure simulation/storage: bounded movement, island collision, discovery
   points, seeded ambient route, pause and journal validation. Test boundaries.
3. Add lazy Home scene with ambient/static/off settings, dark overlay, reduced
   motion, visibility pause and cleanup. Keep composer accessible and unobscured.
4. Add focused game overlay, keyboard controls, journal, pause and close actions.
   Persist discoveries only; no tool/model/backend effects. Restore focus on exit.
5. Validate types, build, pure logic and actual Electron UI for scene, game,
   movement, discovery, exit/focus and draft preservation. Inspect screenshots.

No new package, no changes to agent authorization or session execution.
