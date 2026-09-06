import { describe, it, expect } from "vitest";
import { localDay, recentDays, streakFrom } from "./board";

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
