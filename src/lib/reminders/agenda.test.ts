import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { buildAgenda, dayWindow, type AgendaOccurrenceRow, type AgendaReminderRow } from "./agenda";

const TZ = "Australia/Melbourne";
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();
const window = dayWindow(DateTime.fromISO("2026-09-29", { zone: TZ }));

const gus = { kind: "kid" as const, id: "kid_gus", name: "Gus" };

const bins: AgendaReminderRow = {
  id: "rem_bins",
  kind: "RECURRING",
  text: "Take out the bins",
  details: null,
  enabled: true,
  timezone: TZ,
  runAt: null,
  nextRunAt: at("2026-09-29T19:30"),
  recurrence: { freq: "weekly", interval: 1, weekdays: [2], time: "19:30", start: "2026-09-01" },
  cron: null,
  assignee: gus,
};

const dentist: AgendaReminderRow = {
  id: "rem_dentist",
  kind: "ONE_OFF",
  text: "Dentist",
  details: "Bring the Medicare card",
  enabled: true,
  timezone: TZ,
  runAt: at("2026-09-29T15:00"),
  nextRunAt: at("2026-09-29T15:00"),
  recurrence: null,
  cron: null,
  assignee: null,
};

const occ = (o: Partial<AgendaOccurrenceRow>): AgendaOccurrenceRow => ({
  id: "occ_1",
  reminderId: "rem_bins",
  scheduledFor: at("2026-09-29T19:30"),
  status: "PENDING",
  snoozedUntil: null,
  firedAt: at("2026-09-29T19:30"),
  resolution: null,
  ...o,
});

describe("buildAgenda", () => {
  it("lists today's slots before anything has fired, in time order", () => {
    const items = buildAgenda([bins, dentist], [], window, at("2026-09-29T08:00"));
    expect(items.map((i) => [i.title, i.status, i.repeat])).toEqual([
      ["Dentist", "upcoming", null],
      ["Take out the bins", "upcoming", "Every Tuesday at 7:30 pm"],
    ]);
    expect(items[1].assignee).toEqual(gus);
    expect(items[1].occurrenceId).toBeNull();
  });

  it("an occurrence carries what actually happened", () => {
    const items = buildAgenda([bins], [occ({ status: "COMPLETED" })], window, at("2026-09-29T20:00"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "done", occurrenceId: "occ_1" });
  });

  it("a snoozed occurrence sorts at its snooze time", () => {
    const items = buildAgenda(
      [bins, { ...dentist, runAt: at("2026-09-29T19:45"), nextRunAt: at("2026-09-29T19:45") }],
      [occ({ status: "SNOOZED", snoozedUntil: at("2026-09-29T20:30") })],
      window,
      at("2026-09-29T19:40"),
    );
    expect(items.map((i) => [i.title, i.status])).toEqual([
      ["Dentist", "upcoming"],
      ["Take out the bins", "snoozed"],
    ]);
  });

  it("shows something snoozed into today from yesterday", () => {
    const items = buildAgenda(
      [{ ...bins, recurrence: { freq: "weekly", interval: 1, weekdays: [1], time: "19:30", start: "2026-09-01" } }],
      [occ({ scheduledFor: at("2026-09-28T19:30"), status: "SNOOZED", snoozedUntil: at("2026-09-29T07:00") })],
      window,
      at("2026-09-29T06:00"),
    );
    expect(items.map((i) => [i.status, i.snoozedUntil])).toEqual([["snoozed", at("2026-09-29T07:00").toISOString()]]);
  });

  it("marks a slot the server slept through as missed, not silently gone", () => {
    const items = buildAgenda([bins], [occ({ status: "DISMISSED", resolution: "missed", firedAt: null })], window, at("2026-09-29T23:00"));
    expect(items[0].status).toBe("missed");
  });

  it("a past slot that is about to fire shows as due; one that predates the reminder is left off", () => {
    expect(buildAgenda([bins], [], window, at("2026-09-29T19:30:20"))[0].status).toBe("due");
    const created = { ...bins, nextRunAt: at("2026-10-06T19:30") };
    expect(buildAgenda([created], [], window, at("2026-09-29T21:00"))).toEqual([]);
  });

  it("ignores disabled reminders' future slots but keeps their history", () => {
    const off = { ...bins, enabled: false };
    expect(buildAgenda([off], [], window, at("2026-09-29T08:00"))).toEqual([]);
    expect(buildAgenda([off], [occ({ status: "COMPLETED" })], window, at("2026-09-29T21:00"))).toHaveLength(1);
  });
});
