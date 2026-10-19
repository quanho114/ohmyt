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

## Validation

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
  auto-scroll, draft restoration, composer docking and reduced motion.
- `xvfb-run -a ./node_modules/.bin/electron --no-sandbox test/ui/test_session_switch_ui.cjs`
  passes on the built app, including delayed requests, rapid session switches,
  no blank frames and independent browser-panel state.
- `npx tsc --noEmit`, `npm run build`, `test_chat_motion.ts` and
  `test_stream_handoff.ts` pass. Build retains the existing bundle-size warning.

Use `npm run test:smooth-ui` for the focused regressions. Fixtures use local
servers and simulated output, without live model requests or user data.
Repository-wide coverage was not measured. This pass does not claim a full
MonoCode visual clone or guarantee performance parity on other machines.
