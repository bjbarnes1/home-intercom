import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { seriesStatusAfter, transition } from "./lifecycle";
import { resolveSnooze, SnoozeError } from "./snooze";
import { ALERT_TTL_MS, isAlertStale, planSeriesFire } from "./policy";

const TZ = "Australia/Melbourne";
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();
const local = (d: Date) => DateTime.fromJSDate(d, { zone: TZ }).toFormat("yyyy-MM-dd HH:mm");

describe("transition", () => {
  it("allows every action from an open state", () => {
    for (const from of ["PENDING", "SNOOZED"] as const) {
      expect(transition(from, "complete")).toEqual({ ok: true, to: "COMPLETED", noop: false });
      expect(transition(from, "dismiss")).toEqual({ ok: true, to: "DISMISSED", noop: false });
      expect(transition(from, "snooze")).toEqual({ ok: true, to: "SNOOZED", noop: false });
    }
  });

  it("treats a repeated terminal action as a no-op, not an error (two panels, one tap each)", () => {
    expect(transition("COMPLETED", "complete")).toEqual({ ok: true, to: "COMPLETED", noop: true });
    expect(transition("DISMISSED", "dismiss")).toEqual({ ok: true, to: "DISMISSED", noop: true });
  });

  it("refuses to reopen a finished occurrence", () => {
    expect(transition("COMPLETED", "snooze")).toEqual({ ok: false, reason: "Already done" });
    expect(transition("DISMISSED", "complete")).toEqual({ ok: false, reason: "Already dismissed" });
  });

  it("a recurring series stays live when one occurrence is done", () => {
    expect(seriesStatusAfter("RECURRING", "COMPLETED")).toBe("PENDING");
    expect(seriesStatusAfter("RECURRING", "SNOOZED")).toBe("SNOOZED");
    expect(seriesStatusAfter("ONE_OFF", "COMPLETED")).toBe("COMPLETED");
  });
});

describe("resolveSnooze", () => {
  const ctx = { now: at("2026-09-29T19:31"), timezone: TZ, scheduledFor: at("2026-09-29T19:30") };

  it("presets", () => {
    expect(local(resolveSnooze({ preset: "5m" }, ctx))).toBe("2026-09-29 19:36");
    expect(local(resolveSnooze({ preset: "1h" }, ctx))).toBe("2026-09-29 20:31");
  });

  it("tomorrow keeps the reminder's own time of day", () => {
    expect(local(resolveSnooze({ preset: "tomorrow" }, ctx))).toBe("2026-09-30 19:30");
  });

  it("tomorrow keeps wall-clock time across DST", () => {
    const c = { now: at("2026-10-03T19:31"), timezone: TZ, scheduledFor: at("2026-10-03T19:30") };
    expect(local(resolveSnooze({ preset: "tomorrow" }, c))).toBe("2026-10-04 19:30");
  });

  it("custom minutes and absolute times", () => {
    expect(local(resolveSnooze({ minutes: 45 }, ctx))).toBe("2026-09-29 20:16");
    expect(local(resolveSnooze({ until: at("2026-09-29T21:00").toISOString() }, ctx))).toBe("2026-09-29 21:00");
  });

  it("rejects times in the past, too soon, or over a week away", () => {
    expect(() => resolveSnooze({ until: at("2026-09-29T19:00").toISOString() }, ctx)).toThrow(SnoozeError);
    expect(() => resolveSnooze({ until: at("2026-09-29T19:31:20").toISOString() }, ctx)).toThrow(SnoozeError);
    expect(() => resolveSnooze({ until: at("2026-10-07T20:00").toISOString() }, ctx)).toThrow(SnoozeError);
  });
});

describe("planSeriesFire", () => {
  const slot = at("2026-09-29T19:30");
  const plus = (min: number) => new Date(slot.getTime() + min * 60_000);

  it("fires on time", () => {
    expect(planSeriesFire("RECURRING", slot, plus(0.5))).toEqual({ action: "fire", late: false });
  });

  it("flags a late-but-reasonable fire", () => {
    expect(planSeriesFire("RECURRING", slot, plus(10))).toEqual({ action: "fire", late: true });
  });

  it("skips a recurring slot the server slept through, rather than announcing bins at 2 am", () => {
    expect(planSeriesFire("RECURRING", slot, plus(6 * 60))).toEqual({ action: "skip", reason: "missed" });
  });

  it("gives a one-off longer, since it has no next slot", () => {
    expect(planSeriesFire("ONE_OFF", slot, plus(45))).toEqual({ action: "fire", late: true });
    expect(planSeriesFire("ONE_OFF", slot, plus(90))).toEqual({ action: "skip", reason: "missed" });
  });
});

describe("isAlertStale", () => {
  it("closes alerts nobody answered", () => {
    const fired = at("2026-09-29T19:30");
    expect(isAlertStale(fired, new Date(fired.getTime() + ALERT_TTL_MS - 1))).toBe(false);
    expect(isAlertStale(fired, new Date(fired.getTime() + ALERT_TTL_MS + 1))).toBe(true);
    expect(isAlertStale(null, fired)).toBe(false);
  });
});
