export interface RenderClock {
  now: () => number;
  hidden: () => boolean;
  frame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  timer: (callback: () => void, delay: number) => number;
  cancelTimer: (id: number) => void;
}

const browserClock: RenderClock = {
  now: () => performance.now(),
  hidden: () => document.hidden,
  frame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
  timer: (callback, delay) => window.setTimeout(callback, delay),
  cancelTimer: id => window.clearTimeout(id),
};

// The producer keeps its full synchronous state. Only React publication is
// paced; a lifecycle or approval update always publishes the latest snapshot.
export class FramePublisher<T> {
  private commit: (value: T) => void;
  private clock: RenderClock;
  private pending: T | undefined;
  private hasPending = false;
  private scheduled: {kind: 'frame' | 'timer'; id: number} | null = null;
  private lastCommit = -Infinity;

  constructor(commit: (value: T) => void, clock: RenderClock = browserClock) {
    this.commit = commit;
    this.clock = clock;
  }

  publish(value: T, deferred = false) {
    this.pending = value;
    this.hasPending = true;
    if (!deferred) { this.flush(); return; }
    this.schedule();
  }

  private schedule() {
    if (this.scheduled) return;
    const hidden = this.clock.hidden();
    const run = () => {
      this.scheduled = null;
      if (!this.hasPending) return;
      if (!this.clock.hidden() && this.clock.now() - this.lastCommit < 30) {
        this.schedule();
        return;
      }
      this.flush();
    };
    this.scheduled = hidden
      ? {kind: 'timer', id: this.clock.timer(run, 100)}
      : {kind: 'frame', id: this.clock.frame(run)};
  }

  flush() {
    this.cancelScheduled();
    if (!this.hasPending) return;
    const value = this.pending as T;
    this.pending = undefined;
    this.hasPending = false;
    this.lastCommit = this.clock.now();
    this.commit(value);
  }

  cancel() {
    this.cancelScheduled();
    this.pending = undefined;
    this.hasPending = false;
  }

  private cancelScheduled() {
    if (!this.scheduled) return;
    if (this.scheduled.kind === 'frame') this.clock.cancelFrame(this.scheduled.id);
    else this.clock.cancelTimer(this.scheduled.id);
    this.scheduled = null;
  }
}
