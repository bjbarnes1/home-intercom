/**
 * ReminderScheduler: the long-running background service that fires
 * reminders. It is the Node/Next.js equivalent of a .NET `BackgroundService`:
 * `start()` / `stop()` lifecycle, one loop, graceful shutdown that waits for
 * the in-flight pass.
 *
 * ## Timer strategy: sleep until due, never longer than a poll
 *
 * A fixed one-minute poll (what Vercel Cron gives us) means a 7:30 reminder
 * fires anywhere up to 7:30:59. On a panel in the kitchen that is visibly
 * wrong. So after each pass the scheduler asks the database for the earliest
 * instant anything is due (a slot, a snooze ending, an alert ageing out) and
 * sets one timer for exactly then, clamped:
 *
 *   - never longer than `maxSleepMs` (30 s). Another process may have written
 *     a reminder this one was not told about; the cap bounds how late that
 *     can be. It also bounds drift after the host sleeps: a timer that fires
 *     late just runs a pass that finds everything overdue and applies the
 *     catch-up policy (policy.ts).
 *   - never shorter than `minSleepMs`, so an overdue row that keeps failing
 *     cannot spin the loop.
 *
 * `wake()` short-circuits the sleep. The API calls it (through the reminders
 * bus) after a create or snooze, so a reminder set for two minutes from now
 * is timed precisely without waiting for the next poll. A wake during a pass
 * is remembered and runs straight after, never concurrently: there is only
 * ever one pass in flight per process.
 *
 * Correctness across processes does not live here: the engine's optimistic
 * claims make overlapping passes (this loop plus the Vercel cron backstop, or
 * two app instances) harmless. This class only decides *when* to run.
 *
 * Deliberately free of Prisma and Next imports, so the timing logic is tested
 * with fake timers and fake dependencies.
 */

export interface SchedulerDeps {
  /** One idempotent pass over everything due at `now`. */
  tick: (now: Date) => Promise<unknown>;
  /** Earliest instant anything will be due, or null for "nothing scheduled". */
  nextDueAt: () => Promise<Date | null>;
  now?: () => number;
  maxSleepMs?: number;
  minSleepMs?: number;
  /** After a failed pass, wait this long before trying again. */
  errorBackoffMs?: number;
  onError?: (error: unknown) => void;
}

export type SchedulerState = "stopped" | "sleeping" | "running" | "stopping";

export interface SchedulerStatus {
  state: SchedulerState;
  passes: number;
  lastPassAt: number | null;
  lastError: string | null;
  /** When the timer is next set to fire. */
  nextWakeAt: number | null;
}

export const DEFAULT_MAX_SLEEP_MS = 30_000;
export const DEFAULT_MIN_SLEEP_MS = 250;
export const DEFAULT_ERROR_BACKOFF_MS = 5_000;

export class ReminderScheduler {
  private state: SchedulerState = "stopped";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private rerun = false;
  private passes = 0;
  private lastPassAt: number | null = null;
  private lastError: string | null = null;
  private nextWakeAt: number | null = null;

  private readonly now: () => number;
  private readonly maxSleepMs: number;
  private readonly minSleepMs: number;
  private readonly errorBackoffMs: number;

  constructor(private readonly deps: SchedulerDeps) {
    this.now = deps.now ?? Date.now;
    this.maxSleepMs = deps.maxSleepMs ?? DEFAULT_MAX_SLEEP_MS;
    this.minSleepMs = deps.minSleepMs ?? DEFAULT_MIN_SLEEP_MS;
    this.errorBackoffMs = deps.errorBackoffMs ?? DEFAULT_ERROR_BACKOFF_MS;
  }

  /** Begin the loop. The first pass runs immediately. Idempotent. */
  start(): void {
    if (this.state !== "stopped") return;
    this.state = "sleeping";
    this.arm(0);
  }

  /** Stop the loop and wait for any in-flight pass to finish. */
  async stop(): Promise<void> {
    if (this.state === "stopped") return;
    this.state = "stopping";
    this.clearTimer();
    await this.inflight;
    this.state = "stopped";
    this.nextWakeAt = null;
  }

  /** Something changed: run a pass as soon as possible. */
  wake(): void {
    if (this.state === "stopped" || this.state === "stopping") return;
    if (this.inflight) {
      this.rerun = true;
      return;
    }
    this.arm(0);
  }

  status(): SchedulerStatus {
    return {
      state: this.state,
      passes: this.passes,
      lastPassAt: this.lastPassAt,
      lastError: this.lastError,
      nextWakeAt: this.nextWakeAt,
    };
  }

  /** Clamp "due at" into a sleep duration. Exposed for tests. */
  sleepFor(dueAt: Date | null): number {
    if (!dueAt) return this.maxSleepMs;
    const ms = dueAt.getTime() - this.now();
    return Math.min(this.maxSleepMs, Math.max(this.minSleepMs, ms));
  }

  private arm(ms: number): void {
    this.clearTimer();
    this.nextWakeAt = this.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pass();
    }, ms);
    // Never hold a process open just to fire reminders (tests, CLI scripts).
    (this.timer as { unref?: () => void }).unref?.();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async pass(): Promise<void> {
    if (this.state !== "sleeping" || this.inflight) return;
    this.state = "running";
    let delay = this.maxSleepMs;

    this.inflight = (async () => {
      try {
        await this.deps.tick(new Date(this.now()));
        this.lastError = null;
        delay = this.sleepFor(await this.deps.nextDueAt());
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
        this.deps.onError?.(e);
        delay = this.errorBackoffMs;
      } finally {
        this.passes++;
        this.lastPassAt = this.now();
      }
    })();

    await this.inflight;
    this.inflight = null;

    // stop() may have run while the pass was awaited; TS cannot see that.
    const state = this.state as SchedulerState;
    if (state === "stopping" || state === "stopped") return;
    this.state = "sleeping";
    if (this.rerun) {
      this.rerun = false;
      delay = 0;
    }
    this.arm(delay);
  }
}
