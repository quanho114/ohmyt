# Tool limit activity

User journey: when a response reaches its tool step limit, the user can see
which additional tool calls were not executed and why.

- RED: `node test/test_tool_limit_activity.js` failed with
  `Rejected tool limit-app must appear in saved activity`.
- GREEN: the same test passes using a real in-memory daemon and two rejected
  calls. It checks live events, saved activity, exact file paths, partial outcome,
  bounded text recovery, and that rejected tools never execute.
- Vietnamese and English server-rendered activity show the step-limit label.
- `node test/test_final_tool_recovery.js` also checks standalone rejected activity
  and repeated calls during the recovery turn.
- Existing `test_tool_budget.js` and `test_response_activity.js` pass.
- `npm run build` passes (existing bundle-size warning).

Scope: the correction preserves the configured step limit and partial outcome.
Historical messages already saved without the rejected calls are not rewritten.
UI rendering is verified with SSR; browser interaction and repository-wide
coverage were not measured for this targeted change.
