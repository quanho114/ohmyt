# Full integration implementation checklist

Architecture: preserve AgentLoop; expand BrowserUseRuntime and native/browser sidecars. Core model, approval, budgets and cancellation remain authoritative. Browser Use stays pinned to the exercised 0.13.11 contract. No paid Cloud services.

Acceptance gates:
- [x] Complete direct capability surface: bounded evaluation, keyboard, screenshots, AX, wait, frame/DOM coverage, custom action registration.
- [x] Isolate embedded profiles/tabs by chat within each OS-user app data directory; owner checks cover native and CDP paths.
- [x] Pin network connections through a validating local egress proxy in both modes, block private/mixed DNS, redirects and loopback bypass; retain fail-closed cleanup.
- [x] Pause/resume at adapter boundaries, human authentication handoff, snapshots invalidated on resume; cancel while paused and in flight.
- [x] Redact sensitive field values from DOM/AX output; trace metadata excludes page/text/credentials; bounded histories/events and latency metrics.
- [x] MCP JSON-RPC facade routes through explicit parent authorization, existing tools and run context; custom tools cannot bypass adapter policy.
- [x] Optional subagent: expose only bounded parent-controlled workflow execution; every step goes through parent permissions, no autonomous upstream Agent/model bypass.
- [x] Real Electron/Python E2E: multi-tab, login cookies/isolation, files, reconnect, pause/resume, cancellation, DOM/frames/shadow, egress denial.
- [x] Run regression suites, classify and repair relevant failures; record actual results and reproducible local benchmarks.
- [x] Update feature matrix, local instructions, security guarantees and limitations against final implementation.

Changes are made incrementally. Tests cover actual boundaries rather than merely mirroring implementation. Platform and live-model claims are limited to what was executed.

Evidence: [final audit](browser-use-production-audit.md) and the reproducible `npm run test:browser-use:full` JSON report. These gates cover implemented scope; they do not establish live paid-model success rates or untested platform support.
