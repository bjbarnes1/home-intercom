import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandoffWaiter } from "./handoffAck";

/**
 * The sending panel goes quiet on "it is playing there" and on nothing less.
 * Pausing on the 200 from /api/music/handoff is how a stale token at the other
 * end left both rooms silent with no error anywhere.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("HandoffWaiter", () => {
  it("resolves played when the other panel says it started", async () => {
    const w = new HandoffWaiter(vi.fn(), 1000, 5000);
    const outcome = w.expect("h1");
    w.settle({ handoffId: "h1", ok: true });
    await expect(outcome).resolves.toEqual({ kind: "played" });
  });

  it("passes on the other panel's reason when it could not play", async () => {
    const w = new HandoffWaiter(vi.fn(), 1000, 5000);
    const outcome = w.expect("h1");
    w.settle({ handoffId: "h1", ok: false, error: "Nobody is signed in" });
    await expect(outcome).resolves.toEqual({ kind: "refused", error: "Nobody is signed in" });
  });

  it("times out rather than waiting for ever on a panel that never answers", async () => {
    const w = new HandoffWaiter(vi.fn(), 1000, 5000);
    const outcome = w.expect("h1");
    vi.advanceTimersByTime(1000);
    await expect(outcome).resolves.toEqual({ kind: "timeout" });
  });

  it("ignores an answer for a handoff it did not send", async () => {
    const w = new HandoffWaiter(vi.fn(), 1000, 5000);
    const outcome = w.expect("h1");
    w.settle({ handoffId: "someone-else", ok: true });
    vi.advanceTimersByTime(1000);
    await expect(outcome).resolves.toEqual({ kind: "timeout" });
  });

  it("steps back when a timed-out handoff turns out to have started after all", async () => {
    const onLatePlay = vi.fn();
    const w = new HandoffWaiter(onLatePlay, 1000, 5000);
    const outcome = w.expect("h1");
    vi.advanceTimersByTime(1000);
    await outcome;

    w.settle({ handoffId: "h1", ok: true });
    expect(onLatePlay).toHaveBeenCalledTimes(1);
    // Once only.
    w.settle({ handoffId: "h1", ok: true });
    expect(onLatePlay).toHaveBeenCalledTimes(1);
  });

  it("does not step back on a late refusal, or on a late answer past the grace period", async () => {
    const onLatePlay = vi.fn();
    const w = new HandoffWaiter(onLatePlay, 1000, 5000);
    void w.expect("h1");
    void w.expect("h2");
    vi.advanceTimersByTime(1000);

    w.settle({ handoffId: "h1", ok: false });
    vi.advanceTimersByTime(5000);
    w.settle({ handoffId: "h2", ok: true });
    expect(onLatePlay).not.toHaveBeenCalled();
  });

  it("forgets a cancelled handoff, so a stray answer later does nothing", () => {
    const onLatePlay = vi.fn();
    const w = new HandoffWaiter(onLatePlay, 1000, 5000);
    void w.expect("h1");
    w.cancel("h1");
    vi.advanceTimersByTime(1000);
    w.settle({ handoffId: "h1", ok: true });
    expect(onLatePlay).not.toHaveBeenCalled();
  });
});
