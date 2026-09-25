import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReminderScheduler } from "./scheduler";

/**
 * The hosted-service loop, driven by fake timers. What matters:
 *  - it sleeps until the next due instant, not a fixed poll;
 *  - never longer than the max (other writers exist), never a hot spin;
 *  - wake() short-circuits the sleep, and a wake mid-pass is not lost;
 *  - passes never overlap;
 *  - a failing pass backs off and the loop survives;
 *  - stop() waits for the pass in flight.
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T09:30:00Z"));
});
afterEach(() => vi.useRealTimers());

function harness(opts: { nextDue?: () => Date | null; tick?: () => Promise<void> } = {}) {
  const ticks: number[] = [];
  const scheduler = new ReminderScheduler({
    tick: async () => {
      ticks.push(Date.now());
      await opts.tick?.();
    },
    nextDueAt: async () => (opts.nextDue ? opts.nextDue() : null),
    maxSleepMs: 30_000,
    minSleepMs: 250,
    errorBackoffMs: 5_000,
  });
  return { scheduler, ticks };
}

describe("ReminderScheduler", () => {
  it("runs a pass immediately on start", async () => {
    const { scheduler, ticks } = harness();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ticks).toHaveLength(1);
    await scheduler.stop();
  });

  it("sleeps exactly until the next due reminder", async () => {
    const due = new Date(Date.now() + 12_345);
    const { scheduler, ticks } = harness({ nextDue: () => due });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(12_344);
    expect(ticks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ticks).toHaveLength(2);
    expect(ticks[1]).toBe(due.getTime());
    await scheduler.stop();
  });

  it("never sleeps past the max poll, even with nothing due", async () => {
    const { scheduler, ticks } = harness({ nextDue: () => null });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(ticks).toHaveLength(4); // 0, 30s, 60s, 90s
    await scheduler.stop();
  });

  it("does not spin on something overdue", async () => {
    const { scheduler, ticks } = harness({ nextDue: () => new Date(Date.now() - 60_000) });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticks.length).toBeLessThanOrEqual(5); // min sleep 250ms
    await scheduler.stop();
  });

  it("wake() cuts a long sleep short", async () => {
    const { scheduler, ticks } = harness({ nextDue: () => null });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(ticks).toHaveLength(2);
    await scheduler.stop();
  });

  it("a wake during a pass runs one more pass straight after, never concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { scheduler, ticks } = harness({
      tick: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1_000));
        inFlight--;
      },
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10); // first pass is mid-flight
    scheduler.wake();
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(ticks).toHaveLength(2);
    expect(maxInFlight).toBe(1);
    await scheduler.stop();
  });

  it("backs off after a failed pass and keeps running", async () => {
    let fail = true;
    const errors: unknown[] = [];
    const scheduler = new ReminderScheduler({
      tick: async () => {
        if (fail) throw new Error("db down");
      },
      nextDueAt: async () => null,
      errorBackoffMs: 5_000,
      onError: (e) => errors.push(e),
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveLength(1);
    expect(scheduler.status().lastError).toBe("db down");
    fail = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(scheduler.status()).toMatchObject({ passes: 2, lastError: null });
    await scheduler.stop();
  });

  it("stop() waits for the pass in flight and then stays stopped", async () => {
    let finished = false;
    const { scheduler, ticks } = harness({
      tick: async () => {
        await new Promise((r) => setTimeout(r, 1_000));
        finished = true;
      },
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(1_000);
    await stopping;
    expect(finished).toBe(true);
    expect(scheduler.status().state).toBe("stopped");
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ticks).toHaveLength(1);
  });

  it("clamps the sleep", () => {
    const { scheduler } = harness();
    expect(scheduler.sleepFor(null)).toBe(30_000);
    expect(scheduler.sleepFor(new Date(Date.now() + 5_000))).toBe(5_000);
    expect(scheduler.sleepFor(new Date(Date.now() + 3_600_000))).toBe(30_000);
    expect(scheduler.sleepFor(new Date(Date.now() - 1_000))).toBe(250);
  });
});
