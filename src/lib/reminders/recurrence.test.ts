import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  describeRecurrence,
  nextOccurrence,
  occurrencesBetween,
  parseRecurrence,
  toRRule,
  type RecurrenceRule,
} from "./recurrence";

const TZ = "Australia/Melbourne";
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();
const local = (d: Date | null) => (d ? DateTime.fromJSDate(d, { zone: TZ }).toFormat("ccc yyyy-MM-dd HH:mm") : null);

/** Walk n occurrences from `from`, as local strings. */
function walk(rule: RecurrenceRule, from: Date, n: number): string[] {
  const out: string[] = [];
  let cursor = from;
  for (let i = 0; i < n; i++) {
    const next = nextOccurrence(rule, TZ, cursor);
    if (!next) break;
    out.push(local(next)!);
    cursor = next;
  }
  return out;
}

describe("nextOccurrence", () => {
  it("daily at a wall-clock time", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, time: "07:30", start: "2026-09-01" };
    expect(walk(rule, at("2026-09-25T08:00"), 2)).toEqual(["Sat 2026-09-26 07:30", "Sun 2026-09-27 07:30"]);
  });

  it("is strictly after `after` — the slot itself is not next", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, time: "07:30", start: "2026-09-01" };
    expect(local(nextOccurrence(rule, TZ, at("2026-09-25T07:30")))).toBe("Sat 2026-09-26 07:30");
    expect(local(nextOccurrence(rule, TZ, at("2026-09-25T07:29")))).toBe("Fri 2026-09-25 07:30");
  });

  it("every Tuesday night (the bins)", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, weekdays: [2], time: "19:30", start: "2026-09-25" };
    expect(walk(rule, at("2026-09-25T12:00"), 3)).toEqual([
      "Tue 2026-09-29 19:30",
      "Tue 2026-10-06 19:30",
      "Tue 2026-10-13 19:30",
    ]);
  });

  it("fortnightly is anchored to the week the series started", () => {
    // Started Thu 24 Sep: that week's Tuesday (22nd) is in phase, so the
    // fortnight runs 6 Oct, 20 Oct — not 29 Sep.
    const rule: RecurrenceRule = { freq: "weekly", interval: 2, weekdays: [2], time: "19:30", start: "2026-09-24" };
    expect(walk(rule, at("2026-09-24T12:00"), 3)).toEqual([
      "Tue 2026-10-06 19:30",
      "Tue 2026-10-20 19:30",
      "Tue 2026-11-03 19:30",
    ]);
  });

  it("several weekdays in one rule", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, weekdays: [1, 3, 5], time: "15:45", start: "2026-09-01" };
    expect(walk(rule, at("2026-09-25T16:00"), 3)).toEqual([
      "Mon 2026-09-28 15:45",
      "Wed 2026-09-30 15:45",
      "Fri 2026-10-02 15:45",
    ]);
  });

  it("the 2nd Tuesday of each month", () => {
    const rule: RecurrenceRule = { freq: "monthly_nth", interval: 1, nth: 2, weekday: 2, time: "18:00", start: "2026-09-01" };
    expect(walk(rule, at("2026-09-25T00:00"), 3)).toEqual([
      "Tue 2026-10-13 18:00",
      "Tue 2026-11-10 18:00",
      "Tue 2026-12-08 18:00",
    ]);
  });

  it("the last Friday of each month", () => {
    const rule: RecurrenceRule = { freq: "monthly_nth", interval: 1, nth: -1, weekday: 5, time: "17:00", start: "2026-09-01" };
    expect(walk(rule, at("2026-09-01T00:00"), 2)).toEqual(["Fri 2026-09-25 17:00", "Fri 2026-10-30 17:00"]);
  });

  it("the 31st clamps to the last day of short months", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 1, monthDay: 31, time: "09:00", start: "2027-01-01" };
    expect(walk(rule, at("2027-01-01T00:00"), 3)).toEqual([
      "Sun 2027-01-31 09:00",
      "Sun 2027-02-28 09:00",
      "Wed 2027-03-31 09:00",
    ]);
  });

  it("keeps wall-clock time across the DST change (Melbourne, 4 Oct 2026)", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, time: "07:30", start: "2026-10-01" };
    const times = walk(rule, at("2026-10-02T12:00"), 3);
    expect(times).toEqual(["Sat 2026-10-03 07:30", "Sun 2026-10-04 07:30", "Mon 2026-10-05 07:30"]);
    // …and the UTC gap across the change is 23 hours, not 24.
    const a = nextOccurrence(rule, TZ, at("2026-10-03T12:00"))!;
    const b = nextOccurrence(rule, TZ, at("2026-10-02T12:00"))!;
    expect((a.getTime() - b.getTime()) / 3_600_000).toBe(23);
  });

  it("a time inside the spring-forward gap moves forward, not to the day before", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, time: "02:30", start: "2026-10-01" };
    expect(local(nextOccurrence(rule, TZ, at("2026-10-03T12:00")))).toBe("Sun 2026-10-04 03:30");
  });

  it("every 3 days keeps its phase from the start date", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 3, time: "08:00", start: "2026-09-01" };
    expect(walk(rule, at("2026-09-02T00:00"), 2)).toEqual(["Fri 2026-09-04 08:00", "Mon 2026-09-07 08:00"]);
  });

  it("does not fire before its start date", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, time: "08:00", start: "2026-12-01" };
    expect(local(nextOccurrence(rule, TZ, at("2026-09-25T00:00")))).toBe("Tue 2026-12-01 08:00");
  });

  it("stops after `until`", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, time: "08:00", start: "2026-09-01", until: "2026-09-26" };
    expect(walk(rule, at("2026-09-25T00:00"), 5)).toEqual(["Fri 2026-09-25 08:00", "Sat 2026-09-26 08:00"]);
  });
});

describe("occurrencesBetween", () => {
  it("lists a day's slots for the agenda", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, weekdays: [5], time: "19:30", start: "2026-09-01" };
    const day = DateTime.fromISO("2026-09-25", { zone: TZ });
    const slots = occurrencesBetween(rule, TZ, day.toJSDate(), day.plus({ days: 1 }).toJSDate());
    expect(slots.map(local)).toEqual(["Fri 2026-09-25 19:30"]);
  });
});

describe("describe / RRULE / parse", () => {
  it("reads naturally", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1, weekdays: [2], time: "19:30", start: "2026-09-01" })).toBe(
      "Every Tuesday at 7:30 pm",
    );
    expect(describeRecurrence({ freq: "weekly", interval: 2, weekdays: [2], time: "19:30", start: "2026-09-01" })).toBe(
      "Every other Tuesday at 7:30 pm",
    );
    expect(describeRecurrence({ freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], time: "07:00", start: "2026-09-01" })).toBe(
      "Every weekday at 7 am",
    );
    expect(describeRecurrence({ freq: "monthly_nth", interval: 1, nth: 2, weekday: 2, time: "18:00", start: "2026-09-01" })).toBe(
      "The 2nd Tuesday of each month at 6 pm",
    );
  });

  it("exports RFC 5545", () => {
    expect(toRRule({ freq: "weekly", interval: 2, weekdays: [2], time: "19:30", start: "2026-09-01" })).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=TU;INTERVAL=2;BYHOUR=19;BYMINUTE=30",
    );
    expect(toRRule({ freq: "monthly_nth", interval: 1, nth: -1, weekday: 5, time: "17:00", start: "2026-09-01" })).toBe(
      "RRULE:FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=17;BYMINUTE=0",
    );
  });

  it("rejects malformed rules from the database or an API body", () => {
    expect(parseRecurrence({ freq: "weekly", interval: 1, weekdays: [], time: "19:30", start: "2026-09-01" })).toBeNull();
    expect(parseRecurrence({ freq: "daily", interval: 1, time: "25:00", start: "2026-09-01" })).toBeNull();
    expect(parseRecurrence(null)).toBeNull();
  });
});
