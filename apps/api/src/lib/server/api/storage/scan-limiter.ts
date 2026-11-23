/**
 * Bounds work across callers: at most `maxPending` tasks accepted and not yet finished, of which at most `maxRunning`
 * run at once. A batch larger than `maxPending` on its own is accepted once nothing is pending, so it can still make
 * progress.
 */
export class ScanLimiter {
  /** Tasks accepted and not yet finished, running or waiting. */
  private pending = 0;
  private running = 0;
  /** Tasks waiting for a slot; each is started when a running task hands its slot over. */
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly maxRunning: number,
    private readonly maxPending: number,
  ) {}

  get pendingCount(): number {
    return this.pending;
  }

  /** Runs every task within the bounds and settles once all have finished; `null`, running none, if the batch would exceed them. */
  runAll(tasks: (() => Promise<void>)[]): Promise<void> | null {
    if (this.pending > 0 && this.pending + tasks.length > this.maxPending) return null;

    this.pending += tasks.length;
    return Promise.all(tasks.map((task) => this.inSlot(task).finally(() => (this.pending -= 1)))).then(() => undefined);
  }

  /** Runs `task` once a slot is free; its slot passes straight to the next waiting task. */
  private async inSlot(task: () => Promise<void>): Promise<void> {
    if (this.running < this.maxRunning) {
      this.running += 1;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    try {
      await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }
}
