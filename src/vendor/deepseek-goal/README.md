# DeepSeek Goal UI source

Source: https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c

MIT, Copyright (c) 2026 DeepSeek. Preserve `LICENSE` when distributing.

Copied presentation:

- `packages/client/ui-goal/src/client/GoalBar.tsx` and CSS.
- `packages/client/ui-conversation/src/client/skeleton/TodoPanel.tsx` and CSS.
- `packages/client/ui-primitives/src/InlineEditor`, `StateDot`, `Tooltip`,
  `ShortcutKeys`, their CSS and the tooltip input/dismiss helpers.
- The ten required icon declarations and their artwork, selected from
  `ui-primitives/src/icons/index.tsx`; artwork is unchanged.
- Goal locale dictionaries from `ui-goal/src/client/locales.ts`.

`GoalBar` and `TodoPanel` retain their original markup and interactions, with
one key adaptation: todo rows use ohmyt's step ID when available so duplicate
step text does not collide. Tooltip reads refs from props for React 19.
Their imports/types use `contracts.ts` and `primitives.ts`; Cordis slot
registration and projection adapters are removed because ohmyt supplies data
through `MiniGoal`. Component CSS files are byte-for-byte upstream copies.
`theme-bridge.css` binds upstream tokens to ohmyt's theme and composer width;
colors, containing layout and Vietnamese copy therefore are not a claim of
pixel-identical DeepSeek screenshots.

`MiniGoal.tsx` owns API polling, revision checks, pause/edit/resume/clear and maps
ohmyt steps onto TodoPanel items. ohmyt's additional `review_required` and
`blocked` actions remain outside the vendored components. No server, goal loop,
budget, persistence or model configuration is replaced. Completed goals hide
the goal strip; the current checklist remains visible, as a separate todo panel.

Goal creation/menu and `/goal` chat bubbles continue to use ohmyt's composer and
message components; this port covers the goal dock, checklist and their editor.

Validation: `node test/test_goal_deepseek_ui.js` uses the sibling MonoCode
Playwright installation and installed Chrome. It verifies visible behavior,
API action payloads and exact CSS against the ignored upstream checkout under
`data/deepseek-ui-reference`. Screenshots are under ignored `data/`.
