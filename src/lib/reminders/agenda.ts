import { DateTime } from "luxon";
import { describeRecurrence, occurrencesBetween, type RecurrenceRule } from "./recurrence";
import type { AgendaItem, AgendaStatus, Member } from "./types";
import type { ReminderStatus } from "./lifecycle";

/**
 * The Daily Agenda, built purely from rows so it can be tested without a
 * database.
 *
 * A day's agenda is the union of two things that are easy to get out of step:
 *
 *  - **Slots the rules say exist today**, fired or not. Tonight's bins are on
 *    the agenda at 8 am, long before anything has fired.
 *  - **Occurrences that exist**, which carry what actually happened: done,
 *    snoozed to 8:15, missed while the power was out.
 *
 * They are joined on (reminder, slot instant). An occurrence wins where both
 * exist. An occurrence snoozed *into* today from an earlier day is listed at
 * its snooze time, because that is when it will ring.
 */

export interface AgendaReminderRow {
  id: string;
  kind: "ONE_OFF" | "RECURRING";
  text: string;
  details: string | null;
  enabled: boolean;
  timezone: string;
  runAt: Date | null;
  nextRunAt: Date | null;
  recurrence: RecurrenceRule | null;
  /** Legacy cron reminders: only their materialised next slot is listed. */
  cron: string | null;
  assignee: Member | null;
}

export interface AgendaOccurrenceRow {
  id: string;
  reminderId: string;
  scheduledFor: Date;
  status: ReminderStatus;
  snoozedUntil: Date | null;
  firedAt: Date | null;
  resolution: string | null;
}

export function dayWindow(date: DateTime): { start: Date; end: Date } {
  const start = date.startOf("day");
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

export function buildAgenda(
  reminders: AgendaReminderRow[],
  occurrences: AgendaOccurrenceRow[],
  window: { start: Date; end: Date },
  now: Date,
): AgendaItem[] {
  const byId = new Map(reminders.map((r) => [r.id, r]));
  const items = new Map<string, AgendaItem & { sortAt: number }>();
  const inWindow = (d: Date | null | undefined) =>
    !!d && d.getTime() >= window.start.getTime() && d.getTime() < window.end.getTime();

  // 1. What happened: every occurrence scheduled today or snoozed into today.
  for (const o of occurrences) {
    const r = byId.get(o.reminderId);
    if (!r) continue;
    const snoozedIn = o.status === "SNOOZED" && inWindow(o.snoozedUntil);
    if (!inWindow(o.scheduledFor) && !snoozedIn) continue;
    const key = slotKey(r.id, o.scheduledFor);
    const sortAt = (o.status === "SNOOZED" && o.snoozedUntil ? o.snoozedUntil : o.scheduledFor).getTime();
    items.set(key, {
      ...base(r, o.scheduledFor, key),
      occurrenceId: o.id,
      status: occurrenceStatus(o),
      snoozedUntil: o.snoozedUntil ? o.snoozedUntil.toISOString() : null,
      sortAt,
    });
  }

  // 2. What is still to come: today's slots that have not fired yet.
  for (const r of reminders) {
    if (!r.enabled) continue;
    for (const slot of slotsFor(r, window)) {
      const key = slotKey(r.id, slot);
      if (items.has(key)) continue;
      // A past slot with no occurrence either is about to fire (it is the
      // reminder's pending nextRunAt) or predates the reminder. Only the
      // former belongs on the agenda.
      const pending = r.nextRunAt?.getTime() === slot.getTime();
      if (slot.getTime() <= now.getTime() && !pending) continue;
      items.set(key, {
        ...base(r, slot, key),
        occurrenceId: null,
        status: slot.getTime() <= now.getTime() ? "due" : "upcoming",
        snoozedUntil: null,
        sortAt: slot.getTime(),
      });
    }
  }

  return [...items.values()]
    .sort((a, b) => a.sortAt - b.sortAt || a.title.localeCompare(b.title))
    .map(({ sortAt: _sortAt, ...item }) => item);
}

function slotsFor(r: AgendaReminderRow, window: { start: Date; end: Date }): Date[] {
  if (r.kind === "ONE_OFF") {
    return r.runAt && r.runAt >= window.start && r.runAt < window.end ? [r.runAt] : [];
  }
  if (r.recurrence) return occurrencesBetween(r.recurrence, r.timezone, window.start, window.end);
  // Legacy cron: we list the one slot the scheduler has materialised.
  return r.nextRunAt && r.nextRunAt >= window.start && r.nextRunAt < window.end ? [r.nextRunAt] : [];
}

function occurrenceStatus(o: AgendaOccurrenceRow): AgendaStatus {
  switch (o.status) {
    case "PENDING":
      return "due";
    case "SNOOZED":
      return "snoozed";
    case "COMPLETED":
      return "done";
    case "DISMISSED":
      return o.resolution === "missed" ? "missed" : "dismissed";
  }
}

function base(r: AgendaReminderRow, slot: Date, key: string) {
  return {
    key,
    reminderId: r.id,
    title: r.text,
    details: r.details,
    dueAt: slot.toISOString(),
    assignee: r.assignee,
    repeat: r.recurrence ? describeRecurrence(r.recurrence) : r.cron ? "Repeats" : null,
  };
}

function slotKey(reminderId: string, slot: Date): string {
  return `${reminderId}@${slot.getTime()}`;
}
