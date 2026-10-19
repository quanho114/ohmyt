# Current user request and guided workflow context

On 2026-10-14, a project chat with `workflow_id=project-overview` answered the
message `chào bạn nhe` with another project overview. Its persisted run activity
contained four filesystem tool entries and a partial outcome. The prompt injected
the project-overview instructions on every turn as an imperative guided task.
Project selection and retained history compounded that task framing; the driver
still admitted the correct user message. Goal creation was not needed to explain
this failure.

`default_prompt.js` now treats workflow instructions as conditional historical
context. A separate current-request section says that the latest direct message
determines the task, using history to resolve actual references/continuations.
Project folders, session titles, open documents and previous work do not independently
request inspection. Intent is interpreted from the relationship between the latest
message, earlier proposals, unresolved decisions and actual results. A short response
may continue work, accept a proposal or simply acknowledge a completed answer.
The prompt encourages useful initiative with reasonable reversible assumptions,
focused clarification for consequential ambiguity, and proportionate use of tools,
planning and detail. No keyword router or canned response replaces the model.
History and project scope are preserved.

Persistent human approval for guided conversations remains enforced by
`authorization.js`, independently of the topic. The prompt change does not clear
`workflow_id`, grant permissions, bypass sandboxing or suppress partial outcomes
for actual incomplete work.

`npm run test:tasks` includes `test_task_turn_intent.js`, exercising the production
driver in project/workflow chats with contextual agreement, topic changes,
multilingual requests, ambiguity and translation. The same short message is tested
against different histories. It checks assembled conditional guidance, verbatim
messages/history and protocol/tool transport using scripted model outputs. Existing task tests
exercise approval persistence across follow-ups, branches and child sessions.

Follow-up on 2026-10-14: a live `gemini-3.8-flash` turn still resumed the
persisted `project-overview` workflow on the single-character greeting `ê`
(4 filesystem tools, ~17s), reasoning that "GUIDED TASK: project-overview"
implied a preset to continue. The conditional wording was not enough, so the
workflow header is now `PAST WORKFLOW (HISTORY ONLY, NOT A CURRENT TASK)`,
with an explicit rule: greetings/acknowledgments/minimal messages get a short
tool-free reply, and a short reply only continues work when it answers a
concrete pending proposal. The current-request section carries the same rule.
`test/evals/conversation/cases.js` gains a `greeting-after-completed` case
(`ê` after a completed overview, expecting no tools); scripted assertions were
updated to the new wording. `npm run test:tasks`, `npm run test:goal` and
`npm run test:harness` passed. Restart the daemon/desktop app to load it.
Live re-verification on the configured route is still recommended, since
fixture regressions alone do not prove live model behavior.
The lexical `isProgressOnlyReply` classifier was removed from the runtime. A
translated sentence or conversational response must not restart work just because
it contains a phrase promising an action. The model is instructed to judge whether
the requested result is complete from meaning and evidence. The driver still retries
empty responses within turn limits, follows explicit tool calls, and enforces
authorization, budgets, cancellation and outcome receipts. A nonempty answer is
not independently verified merely because the model stopped; a model can still
give an inadequate answer, which needs semantic evaluation rather than a phrase list.

Fixture regressions alone do not prove live model behavior. Eight synthetic cases
were also run on the configured `ag/gemini-3.8-flash-high` route on 2026-10-14:
social conversation in a project, topic change, acknowledgement after completed work,
acceptance of a pending read, acceptance of pending discussion, a French read request,
an ambiguous reference and translation of an action promise. All eight had the
expected tool/no-tool behavior; their returned answers were inspected. In the
ambiguous case, the harness captured the question and deliberately cancelled the
waiting run instead of answering for the user. This is one trial per case, not a
general intelligence score or guarantee across models.

The reusable live runner and case suite are in `test/evals/conversation/`. They
use a temporary synthetic project and read configured credentials locally, without
printing them or changing the user's conversations. Live calls consume provider
usage; they are not included in the ordinary offline regression command.
Restart the running daemon/desktop app to load the changed prompt module; existing
chat history remains and no user database migration is required.

Validation: `npm run test:tasks`, `npm run test:goal` and the full
`npm run test:harness` (including upgrade acceptance) passed after this change.

After the broader semantic-policy update, those targeted suites and conclusion
recovery tests passed again. The broad `npm test` command reached
`test/core/test_tool_limit_activity.js:53` and stopped on a rendered UI-label assertion;
loading the pre-update agent loop, prompt and driver from HEAD reproduced the same
assertion without changing the working tree. The broad suite is not reported as
fully passing. The live ambiguity case was repeated with
question capture: the model asked whether to change the parser or theme, retaining
the two distinct choices instead of performing an arbitrary action.
