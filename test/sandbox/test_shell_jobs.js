import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDaemon} from '../../server/index.js';
import {createRunScope} from '../../server/project_scope.js';
import {JOB_OUTPUT_CAP, JOB_POLL_CAP} from '../../server/local_runtime.js';

const isWin = process.platform === 'win32';
const sleepCmd = ms => isWin ? `Start-Sleep -Milliseconds ${ms}` : `sleep ${ms / 1000}`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyt-shell-jobs-'));
const d = createDaemon({dbPath: ':memory:', workspaceRoot: dir, hostEnabled: true, port: 0, authToken: 'test-token'});
const start = (args, context) => d.tools.get('shell_job_start').execute(args, context);
const poll = (args, context) => d.tools.get('shell_job_poll').execute(args, context);
const kill = (jobId, context) => d.tools.get('shell_job_kill').execute({jobId}, context);
const list = context => d.tools.get('shell_job_list').execute({}, context);
try {
  // Registration and schema surface
  for (const name of ['shell_job_start', 'shell_job_poll', 'shell_job_kill', 'shell_job_list']) assert.ok(d.tools.get(name));
  assert.ok(d.tools.forStandalone({scopeId: 'standalone:jobs'}).get('shell_job_start'));
  assert.ok(d.tools.forStandalone({scopeId: 'standalone:jobs'}).get('shell_job_poll'));
  assert.equal(d.tools.describeRuntime().backgroundJobs.includes('shell_job_start'), true);
  assert.throws(() => d.tools.validateCall({name: 'shell_job_start', arguments: {command: 'x', bogus: 1}}), /Unknown argument/);
  assert.throws(() => d.tools.validateCall({name: 'shell_job_start', arguments: {}}), /Missing required argument/);
  assert.throws(() => d.tools.validateCall({name: 'shell_job_poll', arguments: {jobId: 'j', waitMs: 'soon'}}), /must be number/);
  await assert.rejects(poll({jobId: 'job_missing'}, {}), /Unknown or expired shell job/);

  // Start returns immediately, poll drains incremental deltas, job completes.
  const ctx = {runId: 'r-life', sessionId: 'sess-1', scopeId: 'scope-1'};
  const lifecycleCmd = isWin ? 'Write-Output one; Start-Sleep -Milliseconds 800; Write-Output two' : 'echo one; sleep 0.8; echo two';
  const job = await start({command: lifecycleCmd}, ctx);
  assert.equal(job.status, 'running');
  assert.equal(job.done, false);
  assert.ok(job.jobId.startsWith('job_'));
  assert.ok(job.pid > 0);
  const first = await poll({jobId: job.jobId}, ctx);
  assert.equal(first.status, 'running');
  const finished = await poll({jobId: job.jobId, waitMs: 15000}, ctx);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.done, true);
  assert.equal(finished.exitCode, 0);
  assert.ok(finished.stdout.includes('one'));
  assert.ok(finished.stdout.includes('two'));
  assert.equal(finished.stderr, '');
  assert.ok(finished.runtimeMs > 0);
  const drained = await poll({jobId: job.jobId}, ctx);
  assert.equal(drained.stdout, '');
  assert.equal(drained.cursors.stdout, finished.cursors.stdout);

  // Session and scope ownership is enforced on poll, kill and list.
  const isoJob = await start({command: sleepCmd(60000)}, {runId: 'r-iso', sessionId: 'sess-1', scopeId: 'scope-1'});
  await assert.rejects(poll({jobId: isoJob.jobId}, {runId: 'r-other', sessionId: 'sess-2'}), /different session/);
  await assert.rejects(poll({jobId: isoJob.jobId}, {runId: 'r-other', sessionId: 'sess-1', scopeId: 'scope-9'}), /different project scope/);
  await assert.rejects(kill(isoJob.jobId, {sessionId: 'sess-2'}), /different session/);
  assert.ok((await list({sessionId: 'sess-1'})).jobs.some(entry => entry.jobId === isoJob.jobId));
  assert.equal((await list({sessionId: 'sess-2'})).jobs.some(entry => entry.jobId === isoJob.jobId), false);
  const isoKilled = await kill(isoJob.jobId, {runId: 'r-iso', sessionId: 'sess-1', scopeId: 'scope-1'});
  assert.equal(isoKilled.status, 'killed');

  // Explicit kill terminates the process tree and reports the final state.
  const killJob = await start({command: sleepCmd(60000)}, {runId: 'r-kill', sessionId: 'sess-1'});
  const killed = await kill(killJob.jobId, {sessionId: 'sess-1'});
  assert.equal(killed.status, 'killed');
  assert.equal(killed.done, true);

  // Timeout auto-terminates the job with a known outcome.
  const timeoutJob = await start({command: sleepCmd(60000), timeout: 1000}, {sessionId: 'sess-1'});
  const timedOut = await poll({jobId: timeoutJob.jobId, waitMs: 8000}, {sessionId: 'sess-1'});
  assert.equal(timedOut.status, 'timeout');
  assert.equal(timedOut.done, true);

  // Aborting the owning run kills its jobs through the shared process map.
  const abortJob = await start({command: sleepCmd(60000)}, {runId: 'run-abort', sessionId: 'sess-1'});
  assert.equal(d.tools.killProcessesForRun('run-abort'), true);
  const aborted = await poll({jobId: abortJob.jobId, waitMs: 8000}, {sessionId: 'sess-1'});
  assert.equal(aborted.status, 'killed');
  assert.equal(d.tools.activeChildProcesses.has('run-abort'), false);

  // Output is delivered in bounded deltas and the retained buffer keeps a tail.
  assert.ok(JOB_OUTPUT_CAP > JOB_POLL_CAP);
  const bigJob = await start({command: 'node -e "process.stdout.write(\'x\'.repeat(120000))"'}, {sessionId: 'sess-1'});
  let total = '', truncatedSeen = false, dropped = 0;
  for (let i = 0; i < 12; i++) {
    const update = await poll({jobId: bigJob.jobId, waitMs: i === 0 ? 15000 : 1000}, {sessionId: 'sess-1'});
    total += update.stdout;
    truncatedSeen ||= Boolean(update.truncated);
    dropped = update.stdoutDropped;
    if (update.done && !update.stdout) break;
  }
  assert.equal(total.length, JOB_OUTPUT_CAP);
  assert.equal(dropped, 120000 - JOB_OUTPUT_CAP);
  assert.ok(truncatedSeen);

  // Concurrent jobs per session are capped so runs cannot leak process trees.
  const capJobs = [];
  for (let i = 0; i < 4; i++) capJobs.push(await start({command: sleepCmd(60000)}, {runId: 'r-cap-' + i, sessionId: 'sess-cap'}));
  await assert.rejects(start({command: sleepCmd(60000)}, {runId: 'r-cap-overflow', sessionId: 'sess-cap'}), /running shell jobs/);
  for (const job of capJobs) assert.equal((await kill(job.jobId, {sessionId: 'sess-cap'})).status, 'killed');

  // Project scope: job tools follow the shell_host boundary and grants.
  const projectRoot = path.join(dir, 'project');
  fs.mkdirSync(projectRoot);
  d.db.addProject('job-project', 'Job project', projectRoot);
  d.db.createSession('job-session', 'default-assistant', 'Job test', 'job-project');
  const scope = createRunScope(d.db, d.db.getSession('job-session'), 'project-job-test');
  const projectTools = d.tools.forWorkspace(projectRoot, scope);
  assert.ok(projectTools.get('shell_job_start'));
  assert.ok(projectTools.get('shell_job_list'));
  assert.equal(d.permissions.evaluate('shell_job_poll', 'job_x', scope).action, 'ALLOW');
  assert.equal(d.permissions.evaluate('shell_job_list', 'job_x', scope).action, 'ALLOW');
  assert.equal(d.permissions.evaluate('shell_job_start', 'npm run dev', scope).action, 'ASK');
  const policyTarget = `npm run dev · ${JSON.stringify({command: 'npm run dev'})}`;
  d.db.setScopedPolicy(scope.scopeId, `shell_host:${policyTarget}`, 'ALLOW');
  assert.equal(d.permissions.evaluate('shell_job_start', 'npm run dev', scope, policyTarget).action, 'ALLOW');

  // Job mutations share the shell_host permission class: a shell_host DENY
  // cannot be routed around with shell_job_start.
  assert.equal(d.permissions.evaluate('shell_job_start', 'npm run dev').action, 'ASK');
  assert.equal(d.permissions.evaluate('shell_job_poll', 'job_x').action, 'ALLOW');
  d.db.setPolicy('shell_host:*', 'DENY');
  assert.equal(d.permissions.evaluate('shell_job_start', 'npm run dev').action, 'DENY');
  assert.equal(d.permissions.evaluate('shell_job_kill', 'job_x').action, 'DENY');
  assert.equal(d.permissions.evaluate('shell_host', 'npm run dev').action, 'DENY');

  // Daemon shutdown terminates running jobs instead of leaking them.
  const stopJob = await start({command: sleepCmd(60000)}, {runId: 'r-stop', sessionId: 'sess-1'});
  await d.stop();
  assert.equal(d.tools.shellJobs.jobs.get(stopJob.jobId).status, 'killed');

  // Host-disabled daemons do not expose job tools.
  const other = createDaemon({dbPath: ':memory:', workspaceRoot: dir});
  assert.equal(other.tools.get('shell_job_start'), undefined);
  assert.equal(other.tools.describeRuntime().backgroundJobs, 'unavailable');
  other.db.close();
  console.log('✓ Background shell jobs: lifecycle, deltas, ownership, kill/timeout/abort, caps, permission class and shutdown passed');
} finally {
  await d.stop();
  fs.rmSync(dir, {recursive: true, force: true});
}
