import os from 'node:os';
import fs from 'node:fs';
import {spawn} from 'node:child_process';

export function describeRuntime(workspaceRoot, hostEnabled = false) {
  return {
    platform: process.platform, architecture: process.arch,
    workspaceRoot, homeDirectory: os.homedir(),
    execution: {
      workspace: process.platform === 'linux' ? 'bubblewrap: workspace files, isolated network, no host devices' : 'unavailable',
      host: hostEnabled ? 'native OS shell; subject to permission policies' : 'disabled',
      shell: process.platform === 'win32' ? 'PowerShell' : '/bin/sh'
    },
    isolation: fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv') ? 'container detected; host means this runtime, not an external machine' : 'not detected; not a guarantee of bare-metal execution'
  };
}

// Background host shell jobs. Output is retained as a bounded tail with
// absolute offsets so pollers read deltas without re-reading from the start.
export const JOB_OUTPUT_CAP = 100_000;
export const JOB_POLL_CAP = 50_000;
export const JOB_TIMEOUT_DEFAULT = 900_000;
export const JOB_TIMEOUT_MAX = 3_600_000;

const stopProcessTree = child => {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {windowsHide:true}).on('error', () => {});
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
};

export class ShellJobManager {
  constructor({activeChildProcesses = new Map(), maxConcurrentPerSession = 4, maxJobs = 64} = {}) {
    this.activeChildProcesses = activeChildProcesses;
    this.maxConcurrentPerSession = maxConcurrentPerSession;
    this.maxJobs = maxJobs;
    this.jobs = new Map();
    this.closed = false;
  }

  start({command, cwd, timeout = JOB_TIMEOUT_DEFAULT}, context = {}) {
    if (this.closed) throw new Error('Shell job manager is shut down');
    if (typeof command !== 'string' || !command.trim()) throw new Error('Command must be non-empty');
    if (!Number.isFinite(timeout) || timeout < 1000 || timeout > JOB_TIMEOUT_MAX) throw new Error(`Job timeout must be between 1000 and ${JOB_TIMEOUT_MAX}ms`);
    if (!fs.statSync(cwd).isDirectory()) throw new Error('Working directory is not a directory');
    this.pruneFinished();
    const running = [...this.jobs.values()].filter(job => job.status === 'running');
    if (running.length >= this.maxJobs) throw new Error(`Too many shell jobs (limit ${this.maxJobs}); poll or kill existing jobs first`);
    const sessionId = context.sessionId || null;
    if (sessionId && running.filter(job => job.sessionId === sessionId).length >= this.maxConcurrentPerSession) {
      throw new Error(`This session already has ${this.maxConcurrentPerSession} running shell jobs; poll or kill them before starting more`);
    }
    const jobId = 'job_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const job = {
      jobId, command, cwd, sessionId, scopeId: context.scopeId || null, runId: context.runId || null,
      pid: null, status: 'running', startedAt: Date.now(), endedAt: null,
      exitCode: null, signal: null, timedOut: false, killRequested: false, spawnError: null,
      stdout: '', stdoutStart: 0, stderr: '', stderrStart: 0,
      stdoutCursor: 0, stderrCursor: 0, stdoutDropped: 0, stderrDropped: 0
    };
    let settle; job.done = new Promise(resolve => { settle = resolve; });
    job.settle = settle;
    const executable = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const args = process.platform === 'win32' ? ['-NoLogo','-NoProfile','-NonInteractive','-Command',command] : ['-c',command];
    const child = spawn(executable, args, {cwd, windowsHide:true, detached:process.platform!=='win32', env:process.env});
    job.pid = child.pid;
    job.child = child;
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => this.append(job, 'stdout', data));
    child.stderr.on('data', data => this.append(job, 'stderr', data));
    const runId = context.runId;
    if (runId) {
      if (!this.activeChildProcesses.has(runId)) this.activeChildProcesses.set(runId, new Set());
      this.activeChildProcesses.get(runId).add(child);
    }
    const timer = setTimeout(() => { job.timedOut = true; stopProcessTree(child); }, timeout);
    child.on('error', error => {
      job.spawnError = error.message;
      if (!child.pid) { clearTimeout(timer); this.finalize(job, 'error'); }
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (runId) {
        const group = this.activeChildProcesses.get(runId);
        group?.delete(child);
        if (group && group.size === 0) this.activeChildProcesses.delete(runId);
      }
      job.exitCode = exitCode; job.signal = signal;
      this.finalize(job, job.killRequested ? 'killed' : job.timedOut ? 'timeout' : job.spawnError ? 'error' : signal ? 'killed' : exitCode === 0 ? 'completed' : 'failed');
    });
    this.jobs.set(jobId, job);
    return this.snapshot(job);
  }

  append(job, stream, data) {
    const text = typeof data === 'string' ? data : data.toString();
    let buffer = job[stream] + text;
    let start = job[stream + 'Start'];
    if (buffer.length > JOB_OUTPUT_CAP) {
      const drop = buffer.length - JOB_OUTPUT_CAP;
      start += drop;
      job[stream + 'Dropped'] += drop;
      buffer = buffer.slice(drop);
    }
    job[stream] = buffer;
    job[stream + 'Start'] = start;
  }

  finalize(job, status) {
    if (job.status !== 'running') return;
    job.status = status;
    job.endedAt = Date.now();
    job.child = null;
    job.settle(job);
  }

  owned(jobId, context = {}) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown or expired shell job: ${jobId}`);
    for (const field of ['sessionId', 'scopeId']) {
      if (job[field] && context[field] && job[field] !== context[field]) {
        throw new Error(`Shell job ${jobId} belongs to a different ${field === 'sessionId' ? 'session' : 'project scope'}`);
      }
    }
    return job;
  }

  async poll({jobId, waitMs = 0}, context = {}) {
    const job = this.owned(jobId, context);
    if (job.status === 'running' && waitMs > 0) {
      await Promise.race([job.done, new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 30_000)))]);
    }
    const take = stream => {
      const buffer = job[stream], start = job[stream + 'Start'];
      const from = Math.max(job[stream + 'Cursor'], start);
      let delta = buffer.slice(from - start);
      let truncated = false;
      if (delta.length > JOB_POLL_CAP) { delta = delta.slice(0, JOB_POLL_CAP); truncated = true; }
      job[stream + 'Cursor'] = from + delta.length;
      return {delta, truncated};
    };
    const stdout = take('stdout'), stderr = take('stderr');
    return {...this.snapshot(job), stdout: stdout.delta, stderr: stderr.delta,
      truncated: stdout.truncated || stderr.truncated || undefined,
      cursors: {stdout: job.stdoutCursor, stderr: job.stderrCursor}};
  }

  async kill(jobId, context = {}) {
    const job = this.owned(jobId, context);
    if (job.status === 'running') {
      job.killRequested = true;
      stopProcessTree(job.child);
      await job.done;
    }
    return this.snapshot(job);
  }

  list(context = {}) {
    const matches = job => !(job.sessionId && context.sessionId && job.sessionId !== context.sessionId)
      && !(job.scopeId && context.scopeId && job.scopeId !== context.scopeId);
    return {
      jobs: [...this.jobs.values()].filter(matches)
        .sort((a, b) => b.startedAt - a.startedAt).slice(0, 20)
        .map(job => this.snapshot(job))
    };
  }

  pruneFinished() {
    if (this.jobs.size < this.maxJobs) return;
    const finished = [...this.jobs.values()].filter(job => job.status !== 'running').sort((a, b) => a.endedAt - b.endedAt);
    for (const job of finished) {
      if (this.jobs.size < this.maxJobs) break;
      this.jobs.delete(job.jobId);
    }
  }

  snapshot(job) {
    return {
      jobId: job.jobId, command: job.command, cwd: job.cwd, pid: job.pid,
      status: job.status, startedAt: job.startedAt, endedAt: job.endedAt,
      runtimeMs: (job.endedAt || Date.now()) - job.startedAt,
      done: job.status !== 'running',
      exitCode: job.exitCode, signal: job.signal, error: job.spawnError,
      stdoutDropped: job.stdoutDropped, stderrDropped: job.stderrDropped
    };
  }

  killForRun(runId) {
    let killed = false;
    for (const job of this.jobs.values()) {
      if (job.runId === runId && job.status === 'running') {
        job.killRequested = true;
        stopProcessTree(job.child);
        killed = true;
      }
    }
    return killed;
  }

  async killAll() {
    this.closed = true;
    const running = [...this.jobs.values()].filter(job => job.status === 'running');
    for (const job of running) {
      job.killRequested = true;
      stopProcessTree(job.child);
    }
    await Promise.allSettled(running.map(job => job.done));
  }
}

export function executeHostShell({command,cwd,timeout=30000}, {runId} = {}, processes = new Map()) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('Command must be non-empty');
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) throw new Error('Timeout must be between 1 and 300000ms');
  if (!fs.statSync(cwd).isDirectory()) throw new Error('Working directory is not a directory');
  const executable = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['-NoLogo','-NoProfile','-NonInteractive','-Command',command] : ['-c',command];
  return new Promise((resolve,reject) => {
    const child=spawn(executable,args,{cwd,windowsHide:true,detached:process.platform!=='win32',env:process.env});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let stdout='',stderr='',timedOut=false;
    const append=(current,data)=> (current+data.toString()).slice(0,500000);
    child.stdout.on('data',data=>{stdout=append(stdout,data);});
    child.stderr.on('data',data=>{stderr=append(stderr,data);});
    if(runId) {if(!processes.has(runId)) processes.set(runId,new Set());processes.get(runId).add(child);}
    const stop=()=>{
      if(process.platform==='win32') spawn('taskkill',['/pid',String(child.pid),'/f','/t'],{windowsHide:true}).on('error',()=>{});
      else {try {process.kill(-child.pid,'SIGKILL');}catch {child.kill('SIGKILL');}}
    };
    const timer=setTimeout(()=>{timedOut=true;stop();},timeout);
    const cleanup=()=>{clearTimeout(timer);const group=processes.get(runId);group?.delete(child);if(group?.size===0) processes.delete(runId);};
    child.on('error',error=>{cleanup();reject(error);});
    child.on('close',(exitCode,signal)=>{
      cleanup();
      const interrupted=timedOut||Boolean(signal);
      resolve({command,cwd,execution:'host',exitCode,signal,stdout,stderr,timedOut,success:exitCode===0&&!interrupted,
        ...(interrupted?{code:'TOOL_OUTCOME_UNKNOWN',error:'The command was interrupted after starting. Verify external state before retrying.'}:{})});
    });
  });
}
