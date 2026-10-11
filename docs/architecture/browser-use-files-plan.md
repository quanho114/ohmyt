# Browser Use files, extraction and recovery

Approved scope: file upload/download, PDF export, structured extraction and recovery
inside the ohmyt browser pane. One ohmyt agent loop remains responsible for approvals.

1. Add a per-chat file store: user-selected uploads and durable generated artifacts,
   opaque file IDs, size/quota limits and authenticated download endpoints.
2. Add Chrome file controls: staged file-input upload, authenticated URL downloads,
   PDF rendering; no model-controlled filesystem paths or global CDP file access.
3. Add schema-constrained extraction using the chat's selected model, with bounded
   DOM input/output, explicit source metadata and validation before returning data.
4. Add read-only recovery and classified stale/uncertain outcomes. Never retry a
   mutation automatically or bypass user takeover/domain/permission decisions.
5. Add file management in the Chrome pane, artifact downloads in tool cards, tests
   against real Electron/Python/Chromium, regression checks and usage documentation.

Acceptance: files survive run cleanup, another chat cannot list/read/upload them,
invalid schema/model output fails explicitly, cancellation leaves no partial artifact,
PDF/download results are verified from disk, and a stopped run cannot regain control.
