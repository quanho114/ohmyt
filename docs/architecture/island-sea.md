# Island Sea

Home lazy-loads the original archipelago artwork and the IslandSea component when
no chat background is selected. `Appearance.islandSea` is normalized and persisted
through the existing appearance store: ambient (default), static or off. Controls
are available on Home and Appearance settings. Reduced motion disables decorative
animation; hidden documents stop RAF, and playing pauses on window blur.

Ra khơi opens a DOM dialog with an independently moving boat, coastline collision,
five reachable water-side landmarks, keyboard sailing, E/Space interaction,
a journal, pause and close controls. Discoveries persist in a versioned local
storage key. Invalid data and storage failures do not authorize or affect tools.
Closing restores launch focus and preserves the Home composer. There are no model
calls, agent actions, server endpoints or new dependencies.

Current implementation uses one hand-directed map artwork rather than generated
seed maps. Landmarks use conservative coastline masks. Creature sprites are independent of the scenery: paired atlas poses, bird flight,
shark patrol/circling in navigable water, dinosaur head reactions and octopus
surfacing/waving. Proximity, discovery and clicking an animal trigger reactions.
The click response is visual/textual, not an agent tool call. A Canvas 2D overlay
renders these at 30fps with DPR capped at 2 and no React updates per frame.

Boat wake particles follow actual screen-space displacement, widen and expire
within 1.35 seconds. The pool is capped at 40; anchored boats do not emit a trail.
A small hull ripple and decorative sea ripples are separate. Pause/hidden stops
RAF and freezes poses; reduced motion freezes decorative poses/ripples while
retaining essential boat movement. Coordinate projection matches the full-map Home background and play view.
Home now displays the entire image across its panel; a separate scrollable glass
content layer keeps the composer legible. The compass opens the unobstructed game. Click/keyboard interaction is only active
in the play view; Home effects do not steal composer input.

The game remains exploration rather than combat. Dark appearance tints the
scenery instead of using a separate night atlas. Full-resolution generated PNGs
exceed the original 500 KiB design budget; assets load only with the scene enabled.

Source/provenance: public/island-sea/README.md. No Monocode code or art copied.
Validation: `node test/ui/test_island_sea_life.ts`, `node test/ui/test_island_sea_model.ts`,
`xvfb-run -a npx electron --no-sandbox --ozone-platform=x11 test/ui/test_island_sea_ui.cjs`,
`node test/ui/test_appearance.js`, `npx tsc --noEmit`, `npm run build`.
