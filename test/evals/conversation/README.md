# Conversational intent evaluation

Run `node test/evals/conversation/run.js` explicitly for live model evaluation.
It uses the most recently updated project chat's configured model route, synthetic
history, and a disposable project containing a small README. Actual filesystem reads
are confined to that fixture. Other effectful tools are denied; clarification is
captured then cancelled. The user's stored conversations and database remain unchanged.

Optional environment variables:

- `CONVERSATION_EVAL_PROVIDER`, `CONVERSATION_EVAL_MODEL`: choose a configured route.
- `CONVERSATION_EVAL_CASE`: run one case ID from `cases.js`.
- `CONVERSATION_EVAL_DATA`: configuration/vault directory (default `data`).
- `CONVERSATION_EVAL_OUTPUT`: JSON report path (default a temporary directory).

This runs real provider requests and may consume usage. Credentials remain local
and are never printed. Outputs contain synthetic prompts' model responses, call
names, run status and clarification questions; review the answers as well as flags.

`structuralPass` checks settlement and expected tool activity, not arbitrary prose
quality. A text clarification is acceptable without an interaction tool, so a human
must verify its meaning. A captured question produces an intentionally cancelled
run. One trial is insufficient to claim general reliability; repeat across models,
paraphrases and languages when comparing quality. No production intent classifier
uses these case words or maps responses to canned replies.

`node test/core/test_task_turn_intent.js` uses the same cases with scripted outputs to
verify production context transport, history preservation and tool protocol offline.
`node test/core/test_final_conclusion.js` verifies bounded empty-output recovery and that
translated action phrases do not cause lexical retries.
