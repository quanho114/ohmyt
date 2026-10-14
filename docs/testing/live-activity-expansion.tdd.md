# Live activity expansion

User journey: show reasoning and work while the assistant works, then collapse
the trace immediately when answer streaming begins. Manual toggles remain
available during and after a run.

- RED: `node test/test_response_activity_ui.js` failed because live thinking
  had `aria-expanded="false"` with individual tool auto-expansion disabled.
- GREEN: the same Chrome/Playwright test passes for reasoning, running tools,
  manual toggles, collapse on first answer, completion collapse, history reopening and
  the next run. Individual raw tool details still follow the appearance setting.
- `node test/test_response_activity.js` and
  `node test/test_tool_limit_activity.js` pass.
- `npx tsc --noEmit` and `npm run build` pass. Build reports the existing
  bundle-size warning.

Run the browser regression with `npm run test:activity:ui`. It uses a local Vite
fixture and Chrome, without live model requests or the user's application data.
Repository-wide coverage was not measured for this targeted presentation change.

Follow-up RED: the browser test expected `aria-expanded="false"` at the start
of the answer, but received `true`. GREEN: the same test now passes. Manual
toggles are scoped to the work/answer and streaming states, so opening the work
trace cannot prevent automatic collapse when the answer arrives.
