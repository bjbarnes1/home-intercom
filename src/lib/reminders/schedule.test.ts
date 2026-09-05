import { describe, it, expect } from "vitest";
import {
  computeNextRun,
  isDue,
  validateCron,
  snoozeUntil,
  type ScheduleInput,
} from "./schedule";

const base: ScheduleInput = {
  kind: "RECURRING",
  enabled: true,
  timezone: "UTC",
};

describe("computeNextRun — recurring", () => {
  it("returns the next cron occurrence after `from`", () => {
    // Every day at 07:30 UTC.
    const from = new Date("2026-01-01T06:00:00.000Z");
    const next = computeNextRun({ ...base, cron: "30 7 * * *" }, from);
    expect(next?.toISOString()).toBe("2026-01-01T07:30:00.000Z");
  });

  it("rolls over to the next day when `from` is past today's time", () => {
    const from = new Date("2026-01-01T08:00:00.000Z");
    const next = computeNextRun({ ...base, cron: "30 7 * * *" }, from);
    expect(next?.toISOString()).toBe("2026-01-02T07:30:00.000Z");
  });

  it("respects the timezone", () => {
    // 07:30 in New York (UTC-5 in January) == 12:30 UTC.
    const from = new Date("2026-01-01T00:00:00.000Z");
    const next = computeNextRun(
      { ...base, cron: "30 7 * * *", timezone: "America/New_York" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-01-01T12:30:00.000Z");
  });

  it("returns null for an invalid cron", () => {
    expect(computeNextRun({ ...base, cron: "not a cron" }, new Date())).toBeNull();
  });
});

describe("computeNextRun — one-off", () => {
  const oneOff: ScheduleInput = { kind: "ONE_OFF", enabled: true };

  it("returns runAt when it is in the future", () => {
    const runAt = new Date("2026-06-01T09:00:00.000Z");
    const next = computeNextRun({ ...oneOff, runAt }, new Date("2026-05-01T00:00:00Z"));
    expect(next?.toISOString()).toBe(runAt.toISOString());
  });

  it("returns runAt even if slightly in the past (not yet fired) so it fires now", () => {
    const runAt = new Date("2026-05-01T09:00:00.000Z");
    const next = computeNextRun({ ...oneOff, runAt }, new Date("2026-05-01T09:05:00Z"));
    expect(next?.toISOString()).toBe(runAt.toISOString());
  });

  it("is spent once it has fired", () => {
    const runAt = new Date("2026-05-01T09:00:00.000Z");
    const next = computeNextRun(
      { ...oneOff, runAt, lastRunAt: runAt },
      new Date("2026-05-01T09:05:00Z"),
    );
    expect(next).toBeNull();
  });
});

describe("computeNextRun — gating", () => {
  it("disabled reminders never fire", () => {
    expect(
      computeNextRun({ ...base, cron: "* * * * *", enabled: false }, new Date()),
    ).toBeNull();
  });

  it("a live snooze overrides the schedule", () => {
    const from = new Date("2026-01-01T06:00:00.000Z");
    const snoozedUntil = new Date("2026-01-01T06:10:00.000Z");
    const next = computeNextRun({ ...base, cron: "30 7 * * *", snoozedUntil }, from);
    expect(next?.toISOString()).toBe(snoozedUntil.toISOString());
  });

  it("an expired snooze is ignored", () => {
    const from = new Date("2026-01-01T06:00:00.000Z");
    const snoozedUntil = new Date("2026-01-01T05:00:00.000Z"); // already past
    const next = computeNextRun({ ...base, cron: "30 7 * * *", snoozedUntil }, from);
    expect(next?.toISOString()).toBe("2026-01-01T07:30:00.000Z");
  });
});

describe("isDue", () => {
  const now = new Date("2026-01-01T07:30:00.000Z");
  it("true when nextRunAt is now or past", () => {
    expect(isDue(new Date("2026-01-01T07:30:00.000Z"), now)).toBe(true);
    expect(isDue(new Date("2026-01-01T07:29:00.000Z"), now)).toBe(true);
  });
  it("false when nextRunAt is in the future or missing", () => {
    expect(isDue(new Date("2026-01-01T07:31:00.000Z"), now)).toBe(false);
    expect(isDue(null, now)).toBe(false);
  });
});

describe("validateCron", () => {
  it("accepts a valid expression", () => {
    expect(validateCron("30 7 * * *")).toBeNull();
  });
  it("rejects an invalid one with a message", () => {
    expect(validateCron("99 99 * * *")).not.toBeNull();
  });
});

describe("snoozeUntil", () => {
  it("adds minutes to now", () => {
    const now = new Date("2026-01-01T07:30:00.000Z");
    expect(snoozeUntil(now, 10).toISOString()).toBe("2026-01-01T07:40:00.000Z");
  });
  it("rejects non-positive minutes", () => {
    expect(() => snoozeUntil(new Date(), 0)).toThrow();
  });
});
