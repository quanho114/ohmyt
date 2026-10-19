# Answer cursor and first-chat titles

User journey: the response cursor stops when answer generation completes,
including the first reply in a new conversation while its title is still being
generated.

The driver emits `AnswerCompleted` after the final answer has completed and
passed the existing stop/denial checks, before waiting for the title request.
The client stores this separately from run completion and hides the cursor.
Run completion, title updates, request draining and cancellation retain their
existing order. New runs, text resets and text deltas clear the answer flag.

- RED: `node test/core/test_session_titles.js` failed to find answer completion while
  the mocked title request was held on a gate.
- RED: `node test/ui/test_answer_cursor.js` still rendered the cursor when the
  answer was complete but the run remained active.
- GREEN: both tests pass. Title generation still finishes and updates the title.
- `node test/ui/test_response_activity_ui.js` passes in Chrome, including cursor
  removal before overall completion and retention of answer text.
- `npx tsc --noEmit`, `npm run build` and `npm run test:harness` pass.
  Build reports the existing bundle-size warning.

These tests use fixtures and temporary databases, not live model requests.
Full application SSE rendering and repository-wide coverage were not measured.
