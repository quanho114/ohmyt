# Browser computer use

Electron desktop supports screenshot-driven control of HTTP/HTTPS tabs in its integrated browser. Open the browser pane and choose a model whose configured capabilities include both vision and tools. Existing DOM tools remain available. Chrome extension and external desktop applications do not expose these visual tools.

## Tools and coordinates

`browser_observe({tabId})` captures the visible page, excluding browser controls. It returns a JPEG image, `snapshotId`, image width/height, viewport dimensions, zoom, URL and page revision. Images are resized to at most 1280 pixels wide; coordinates supplied by the model refer to the returned image, not the desktop screen.

`browser_act({tabId,snapshotId,action,...})` performs one operation and returns a new observation:

- move/click: x, y; click optionally button left/right and clickCount 1/2.
- scroll: x, y, deltaY (Electron wheel delta, positive upward), magnitude at most 2000.
- drag: x, y, endX, endY; left button, 12 interpolated moves.
- type: text, at most 10000 characters, inserted into the focused control.
- keypress: Enter, Tab, Escape, Backspace, Delete, arrows, Home/End, PageUp/PageDown, Control+A/C/V/Z.

Coordinates outside the image are rejected. Snapshot ownership belongs to a chat/run. Navigation, viewport resize, zoom change, DOM mutations, scroll changes, user input and a 30-second expiry require another observation. Canvas pixel changes cannot be detected by a DOM mutation observer; animated content still needs careful fresh observation.

## Execution and user control

A visual run leases its tab until it finishes. Other runs, including DOM operations, cannot use that tab during the lease. Desktop's existing automatic tab availability remains; this change does not introduce per-chat tab selection.

Electron selects and focuses the operated tab. A temporary blue pointer marks the position. The browser controls show an active indicator and a Dừng AI button. Manual mouse-down/key-down stops visual control for that run. Cancellation propagates over runtime IPC; drag cleanup releases the held button. A stopped run cannot resume visual control by taking another screenshot. A new run may take control.

Known password/payment fields are blocked by focused-element/hit testing. This is a best-effort DOM check, not complete detection inside cross-origin frames or custom canvas controls. Existing permission evaluation applies before each tool, and visual tools must not bypass a denied DOM action. Website text and screenshots remain untrusted content.

## Model context and limits

Browser images are sent as multimodal message parts, never stringified base64 in tool results. The newest browser image remains in context; older observations retain metadata. Images are omitted from persisted activity and SSE tool completion output. User-attached images follow their existing retention rules.

Ordinary runs retain their five-tool-round budget. Using a visual tool raises the limit to twenty rounds followed by a tool-free conclusion. Three consecutive visual errors, or three identical actions producing identical screenshots, request a conclusion. Permission denials retain their existing stopping rules. Model capabilities are configuration-based, not automatically inferred from the provider name.

## Verification

- `npm run test:chrome`: existing bridge/extension regressions.
- `npm run test:browser:vision`: simulated model through the real agent loop plus actual Electron input against a local fixture. Linux requires xvfb-run.
- `xvfb-run -a node_modules/.bin/electron --no-sandbox test/test_integrated_browser.cjs`: existing embedded browser checks.
- `node test/test_image_attachments.js` and `node test/test_tool_budget.js`.

These tests verify orchestration and native input, not the decision accuracy of a live vision model on arbitrary websites. Third-party login, cross-origin frame input, continuous animation and cross-platform DPI remain areas for further real-device evaluation.

## AI cursor in the Ubuntu browser pane

The shared browser cursor uses the generated white arrow with rose outline, a compact contextual badge, eased 140–300 ms
travel, click rings and typing/scroll/drag labels. Native DOM, Browser Use CDP
input and vision-coordinate tools use the same indicator. It follows actual action
coordinates; there is no simulated random browsing or movement of the OS pointer.
Closed shadow content and pointer-events:none keep the indicator outside normal
page interaction. It is aria-hidden, excluded from screenshots sent to the model,
and its animation does not invalidate native observation snapshots. It fades
after 1.8 seconds of inactivity and clears on stop, pause, release, navigation
and chat switch. Reduced-motion preference skips decorative travel.

`npm run test:browser:cursor` exercises real Electron: movement, DOM and CDP hooks,
screenshot pixel masking, stable snapshots, takeover before click, pause/release,
reduced motion and idle fade. A fixture preview is saved in
`output/browser-ai-cursor.png`. The shared implementation is
`electron/browser-cursor.cjs`; Agent Core is unchanged by this UX addition.

The selected imagegen preview is preserved in electron/assets/agent-cursor-rose-source.png. The trimmed 2× sprite and embedded RGBA pixels are loaded locally, with no external image request. Canvas rendering keeps the cursor visible on pages that block data images with CSP. The idle arrow has no badge; only typing/scroll/drag show a pastel status label.
