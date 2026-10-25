# UI motion and streamed rendering

This pass keeps the ohmyt layout and improves chat motion. Reference:
[MonoCode](https://github.com/hardbeat920/monocode/tree/904289f497f7f87fa5cdb604ceeef1b16fe1deaf).
The relevant patterns are its
[stream publication queue](https://github.com/hardbeat920/monocode/blob/904289f497f7f87fa5cdb604ceeef1b16fe1deaf/src/app/model/harnessFlush.ts)
and [activity disclosure styles](https://github.com/hardbeat920/monocode/blob/904289f497f7f87fa5cdb604ceeef1b16fe1deaf/src/styles/index.css).
The implementation here is written for ohmyt's existing state and event flow.

| Behavior | Before | After |
| --- | --- | --- |
| Streaming text/reasoning | React publication per delta | Full synchronous state, paced publication at most every 30 ms while visible |
| Lifecycle/approval changes | Immediate | Still immediate, publishing the latest full snapshot and cancelling stale scheduled work |
| Hidden-window output | Frequent publications | 100 ms publication cadence; output continues advancing |
| Thinking disclosure | Content unmounted immediately | Persistent grid disclosure with 240 ms height easing and 160 ms opacity easing |
| Closed disclosure | Unmounted | Hidden from accessibility and keyboard interaction with `aria-hidden` and `inert` |
| Small icon controls | Color feedback | Color feedback plus a small press transform |
| Reduced motion | Existing global preference | Disclosure and press movement explicitly disabled too |

`FramePublisher` only schedules React publication. It does not buffer or reorder
tool execution, permission decisions, durable events or backend requests. The
producer's refs advance on each event; a terminal update supersedes any pending
render. Unmount cancels scheduled work.

## Empty chat layout

The new-chat screen centers the sky galaxy mark and one short question,
including the project name when present. The composer stays at the bottom in
both empty and active conversations, with no movement on the first message.
The four suggestion cards are removed from this screen; task shortcuts remain
in the composer's add menu. Both sections stay in normal flex flow so a narrow
pane, short window or growing input cannot cause overlap. Colors and focus
states use the active theme tokens. `test/chat-motion.checks.js` verifies that
the input keeps its bottom edge while preserving history and draft behavior.

## Validation

Live activity now remains visible after the first text delta, including providers
that supply no reasoning. The heading names the active tool or reports waiting,
reasoning, receiving a response, approval, or final settling. A local elapsed timer
runs until the stream ends. After eight seconds without text, reasoning, phase,
tool-status or progress changes, the UI reports waiting for a model update and
points to the existing Stop control. This measures visible updates, not backend
health or estimated completion. Active tools and human approvals retain their own
labels. New visible output clears the waiting note. No synthetic reasoning or
percentage is generated; available provider reasoning and tool receipts retain
their existing disclosure. HTML tool labels use the requested file name rather
than the full document. The answer cursor is hidden during tools and reasoning.

`node test/ui/test_response_activity_ui.js` also exercises silent-provider waits,
commentary followed by a pause, resumed output, approval, HTML tool labels,
narrow layout and final settling with a controlled browser clock.

- RED: `test_frame_publisher.ts` exercised the missing publisher; the browser
  activity test failed because the persistent disclosure did not exist.
- GREEN: `node test/ui/test_frame_publisher.ts` verifies one scheduled frame for
  400 updates, paced commits, immediate lifecycle snapshots, no stale terminal
  replay, hidden-window publication and cleanup.
- `node test/ui/test_response_activity_ui.js` passes in Chrome: live expansion,
  collapse on first answer, manual reopening, inaccessible closed controls,
  cursor completion and reduced-motion behavior.
- `node test/ui/test_smooth_stream_ui.js` compares 80 streamed chunks on a 500-message
  transcript. One isolated run recorded 84 commits without batching versus 25
  with batching (about 70% fewer commits). All received text remained visible.
  This is a fixture measurement, not an overall app-speed or frame-rate claim.
- `CHAT_MOTION_BROWSER=chrome CHAT_MOTION_CHECKS=1 node test/run_chat_motion.js /tmp/ohmyt-chat-motion.json`
  passes for history reading, scroll restoration, spring convergence, disabled
  auto-scroll, draft restoration, bottom-anchored input and reduced motion.
- `xvfb-run -a ./node_modules/.bin/electron --no-sandbox test/ui/test_session_switch_ui.cjs`
  passes on the built app, including delayed requests, rapid session switches,
  no blank frames and independent browser-panel state.
- `npx tsc --noEmit`, `npm run build`, `test_chat_motion.ts` and
  `test_stream_handoff.ts` pass. Build retains the existing bundle-size warning.

Use `npm run test:smooth-ui` for the focused regressions. Fixtures use local
servers and simulated output, without live model requests or user data.
Repository-wide coverage was not measured. This pass does not claim a full
MonoCode visual clone or guarantee performance parity on other machines.
