# Activity summary adaptations

- DeepSeek Harness revision `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`:
  `packages/client/ui-chat/src/client/chat/ReasoningRow.tsx`.
  MIT, Copyright (c) 2026 DeepSeek; full text in `LICENSE.deepseek`.
  Adapts the completed-paragraph preview algorithm and collapsed reasoning policy.
- OpenAI Codex revision `970111f6cb62cc02fe36a82ea7d71b37a2889c97`:
  `codex-rs/tui/src/chatwidget/streaming.rs` (`latest_summary_line`).
  Apache-2.0; full license and upstream notice in `LICENSE.codex` / `NOTICE.codex`.
  Adapts heading/strong-marker cleanup from Rust to TypeScript.

The combined algorithm only formats provider-supplied text for display. It does
not call another model, translate reasoning, infer task success or synthesize
plans. ohmyt owns the event ordering, tool authorization and receipts. No upstream
runtime or full UI package is imported. Long previews are visually ellipsized;
the disclosure retains the complete text.
