# Scheduled tasks (habits) and event triggers

Habits let a chat run work on a recurring schedule ("check deployment status every morning at 8"), and triggers let a chat react to its own run outcomes ("when a run fails, summarize what went wrong"). Both share one substrate: firing **enqueues the prompt into the session's durable inbox**, and the existing inbox/queue machinery runs it like any queued user message.

## Semantics

- Schedules are structured, never free-form cron: `{kind:'interval',minutes}` (1–525600), `{kind:'daily',hour,minute}` or `{kind:'weekly',weekday,hour,minute}` (weekday 0=Sunday, local daemon time). `normalizeHabitSchedule` rejects anything else, so next-run math stays deterministic and testable.
- The scheduled slot timestamp is the inbox idempotency key (`habit:<id>:<slot>`): a repeated tick or a daemon restart can never enqueue the same fire twice. After a long daemon downtime a due habit catches up **once**, then schedules from now.
- A due habit fires at most once per slot; the next slot is computed from `max(now, slot)`.
- Scheduled runs are ordinary runs: the session's agent, scope, permission policies and approval gates all apply. A tool that needs human approval puts the run into `waiting_approval` and waits in the UI — the scheduler never widens authorization and never approves anything itself.
- Disabling a habit stops firing immediately; deleting it cascades with the session. `POST /api/habits/:id/run` enqueues one manual run without disturbing the schedule.
- Recorded state (`last_run_at`, `last_status`, `last_inbox_id`, `next_run_at`) lives in SQLite and survives restarts.

## Event triggers

A habit can define a `trigger` instead of a schedule: `{kind:'run_failed'}` or `{kind:'run_completed'}`. The scheduler listens to the agent loop's terminal run events and fires same-session triggers after the run settles. Three guards keep triggers safe:

- Runs sourced from this substrate (`run_queue_` items with a `habit:` client message id) never fire triggers — no self-feeding loops.
- Durable goal rounds (`run_goal_*`) never fire triggers — automatic goal chains stay under their own admission.
- One enqueue per triggering run (the run id is part of the idempotency key).

The HTTP surface accepts `trigger` in place of `schedule`; the two are mutually exclusive, and a PATCH can convert between them. `test/core/test_triggers.js` covers validation, firing, the loop guard and the HTTP surface.

## Wiring

`HabitScheduler` (`server/habits.js`) ticks every 30 seconds while the daemon runs, reads due habits from the `habits` table, enqueues through `harness.inbox` and calls `agentLoop.pumpInbox`. `daemon.start()` starts the timer; `daemon.stop()` stops it. The HTTP management surface lives in `server/api/habits_routes.js`: `GET/POST /api/habits`, `GET/PATCH/DELETE /api/habits/:id` and `POST /api/habits/:id/run`.

Conditional triggers (run when an event happens) are planned on top of this substrate; they must not grow a second scheduler or a second execution path.

## Tests

`node test/core/test_habits.js` covers schedule validation, local-time next-run math, single-fire slots, idempotent enqueue, disable, the queued run path, restart catch-up on a real database and the HTTP management surface. `node test/core/test_triggers.js` covers trigger validation, failed/completed-run firing, loop and goal-round guards, and the HTTP surface. Both run as part of `npm test`.
