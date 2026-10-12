# Chat fluidity — implementation and validation

Date: 12 October 2026. This change prioritizes the chat experience before the
persistent-assistant and external-runtime roadmap in the supplied brief.

## Reference actually read

The local MonoCode checkout is at
`889579b61c2342cc27751092ff0effbe9ec8e162`. Read:

- `src/features/sessions/hooks/useBottomChatMotion.ts`: continuous following,
  interruption, reduced motion and teardown.
- `src/features/sessions/ui/wordFade.tsx`: real incoming text, cadence-based
  fades and stable word spans.
- `src/features/sessions/ui/useComposerDockMotion.ts`: measured composer docking.
- `src/features/monos/ui/PanelStack.tsx`: interruptible panel transitions.
- `src/features/sessions/ui/TranscriptPool.tsx`: retained DOM and bounded pooling.

The MIT notice is preserved in `integrations/monocode/LICENSE.monocode`.
This is selective adaptation, not a port of MonoCode's renderer. In particular,
ohmyt follows native scroll position with a critically damped spring, whereas
MonoCode pins the scroll position and animates a transcript transform with a
velocity/growth estimate.

## Implemented

- Received text appears without a characters-per-second queue or final one-second
  wait. Stable word spans fade with an incoming-cadence duration of 120–400 ms.
  Code, math and links retain their existing rendering. The settings preview now
  uses the same text/cadence behavior.
- Following stops on upward wheel, touch, navigation keys and manual scrollbar
  movement. Nested scrollable code blocks can consume upward gestures. A return
  button rejoins the bottom. The last five visited scroll positions are retained
  while the chat stage remains mounted.
- Empty-session composer uses a centered slot and a measured 480 ms docking
  transition. Small-height windows use the ordinary dock. Resize, teardown and
  reduced-motion changes cancel the transition.
- Newly appended messages can enter; historical messages do not replay entrance
  animations. Historical message rendering is memoized, with stable action
  callbacks forwarding to the current handlers.
- Draft text, attached images and goal mode survive composer remounts during
  session switching. They remain in renderer memory and do not survive an app
  restart. Successfully emptied drafts are removed.
- Shared CSS motion timings cover navigation feedback and menus. Settings content
  slides/fades on page changes; interruption cancels the outgoing animation.
- Working status is compact by default and uses a text sweep. Tool and reasoning
  details remain accessible by expanding the heading. The existing auto-expand
  preference is respected; completion resets manual expansion state.

## Measurement

The fixture renders the real `ChatStage`, `ChatMessage`, code blocks and composer,
with mocked API responses so it cannot call models, execute tools or modify user
data. Each of five sessions contains 500 messages, including code blocks.
Streaming supplies twenty `word ` chunks at 10/30/60/120 chunks per second,
including pauses. These are synthetic word chunks, not provider-token telemetry.
The fixture also samples animation frames and React Profiler commits.

Windows, headless installed Chrome, 1200×800, Vite development mode:

| Metric | Before | After, latest recorded run |
| --- | ---: | ---: |
| Received characters visible at rate 10, after 180 ms settling | 100/100 | 100/100 |
| Rate 30 | 26/100 | 100/100 |
| Rate 60 | 24/100 | 100/100 |
| Rate 120 | 24/100 | 100/100 |
| p95 animation-frame interval | 33.3 ms | 16.8 ms |
| Frames longer than 25 ms | 27/487 | 6/428 |
| p95 React commit, including session switches | 113.7 ms | 68.5 ms |
| Five session-switch intervals | 215–461 ms | 146–402 ms |
| DOM nodes after switching | 8,792 | 8,796 |
| JS heap estimate | Not recorded | About 175 MB |

These single-run values are diagnostic, not a 60fps hardware certification or a
claim of parity with MonoCode. Subsequent runs varied substantially for commit
and session-switch times. The baseline did not measure heap, so no memory-saving
claim is supported. Transcript pooling and virtualization are not introduced in
this change; switching long transcripts remains an unresolved performance target.

Raw runs and screenshots are written under ignored `data/`:
`chat-motion-baseline.json`, `chat-motion-after.json`, `chat-motion-final.json`,
and corresponding PNGs. The table uses `chat-motion-final.json`.

## Checks

Renderer acceptance passed: reading history remains stationary, scroll positions
restore across sessions, spring movement is monotonic and settles, auto-scroll
off is honored, received prose is not hidden, reasoning remains inspectable,
drafts restore, composer docking works, and disabled/reduced motion is immediate.
Screenshots were inspected at 1200×800 and 520×620.

Production build passed. These focused checks passed:

- `test_chat_motion.ts`, `test_stream_handoff.ts`, `test_response_activity.js`
- `test_harness_controls.js`, `test_harness_replay.js`, `test_harness_agents.js`
- `test_harness_lifecycle.js`, `test_harness_compaction.js`
- `test_markdown_tables.js`, `test_appearance.js`, `test_settings_navigation.js`

Checks with limitations:

- Electron exits at startup with code `2147483651` on this machine. Renderer
  checks therefore used Chrome; native Electron pane interaction remains untested.
- Typecheck reports the pre-existing unreachable `completed` comparison in
  `MiniGoal.tsx`; the same comparison exists in Git HEAD. No type errors were
  reported in the new motion code.
- `test_project_isolation.js` fails when creating a symlink (`EPERM`).
- `test_isolation_migration.js` fails its POSIX `0600` file-mode assertion on Windows.
- `test_harness_migration_backup.js` fails removing its temporary directory
  (`EPERM`). Migration checks cannot be reported as passing.
- macOS/Linux, physical 60Hz hardware, full application focus/panel navigation,
  sustained large tool-result streams and provider quality benchmarks were not
  validated. The four-sprint Definition of Done is not yet fully satisfied.

## Reproduce

Unit checks: `node test/test_chat_motion.ts`.

Electron renderer measurement:

```powershell
$env:CHAT_MOTION_CHECKS = '1'
node test/run_chat_motion.js data/chat-motion-after.json
```

On this machine, the Chrome fallback uses the existing Playwright installation
from the sibling MonoCode checkout, without adding a production dependency:

```powershell
$env:CHAT_MOTION_BROWSER = 'chrome'
$env:CHAT_MOTION_CHECKS = '1'
node test/run_chat_motion.js data/chat-motion-after.json
```

The runner closes its browser and Vite server. Source changes outside the chat
motion files were observed during this session and are preserved; results refer
to the workspace as it existed when each command ran.
