import { describe, it, expect } from "vitest";
import { localDay, recentDays, streakFrom, upcomingDays } from "./board";

describe("localDay", () => {
  it("formats yyyy-mm-dd in the given timezone", () => {
    // 2026-01-01T12:00Z is still 2026-01-01 late evening in Sydney (UTC+11).
    const d = new Date("2026-01-01T12:00:00Z");
    expect(localDay(d, "Australia/Sydney")).toBe("2026-01-01");
  });

  it("rolls the day forward across the timezone boundary", () => {
    // 13:30Z on 2026-01-01 is 00:30 on 2026-01-02 in Sydney.
    const d = new Date("2026-01-01T13:30:00Z");
    expect(localDay(d, "Australia/Sydney")).toBe("2026-01-02");
    expect(localDay(d, "UTC")).toBe("2026-01-01");
  });
});

describe("recentDays", () => {
  it("returns n days, today first, descending", () => {
    const now = new Date("2026-03-10T06:00:00Z");
    const days = recentDays(now, "UTC", 3);
    expect(days).toEqual(["2026-03-10", "2026-03-09", "2026-03-08"]);
  });
});

describe("streakFrom", () => {
  it("counts consecutive done days including today when today is done", () => {
    expect(streakFrom([true, true, true, false])).toBe(3);
  });

  it("ignores an incomplete today (counts from yesterday)", () => {
    expect(streakFrom([false, true, true, false])).toBe(2);
  });

  it("is zero when yesterday broke and today not done", () => {
    expect(streakFrom([false, false, true])).toBe(0);
  });

  it("is zero for an empty history", () => {
    expect(streakFrom([])).toBe(0);
  });

  it("counts a lone completed today", () => {
    expect(streakFrom([true, false])).toBe(1);
  });
});

describe("day walks across a DST transition", () => {
  /*
   * Sydney's 2026 transitions, sampled at local midnight — which is when the
   * board rolls over, and the only time of day the old fixed-86,400,000ms walk
   * got it wrong. Verified against that old implementation: both cases below
   * reproduce on it and pass here.
   */
  const tz = "Australia/Sydney";

  it("does not skip the day DST starts over", () => {
    // 2026-10-04T13:00Z is local midnight on Sunday 5 October. Stepping back a
    // fixed 24h from there lands on 3 October: 4 October vanished from the
    // board, and streakFrom saw a gap where a completed day had been.
    const days = recentDays(new Date("2026-10-04T13:00:00Z"), tz, 5);
    expect(days).toEqual([
      "2026-10-05",
      "2026-10-04",
      "2026-10-03",
      "2026-10-02",
      "2026-10-01",
    ]);
  });

  it("does not repeat a day when DST ends", () => {
    // 2026-04-05T13:00Z is local midnight on 5 April; the fixed step landed on
    // 5 April again, so the board showed the same day twice.
    const days = recentDays(new Date("2026-04-05T13:00:00Z"), tz, 5);
    expect(days).toEqual([
      "2026-04-05",
      "2026-04-04",
      "2026-04-03",
      "2026-04-02",
      "2026-04-01",
    ]);
    expect(new Set(days).size).toBe(days.length);
  });

  it("walks forward across the same transition without skipping", () => {
    // 23:00 local on 1 October — Sydney is still UTC+10 here, so this instant
    // is late on the 1st, not midnight on the 2nd. The window still spans the
    // transition, which is the point.
    const days = upcomingDays(new Date("2026-10-01T13:00:00Z"), tz, 5);
    expect(days).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
  });
});
