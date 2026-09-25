import { DateTime } from "luxon";
import type { RecurrenceRule, Weekday } from "@/lib/reminders/recurrence";
import type { MemberRef, When } from "@/lib/reminders/types";
import type { ProposedDraft } from "@/lib/reminders/ai/resolve";

/**
 * The Creation Modal's form, and the pure conversions between it and a draft.
 *
 * The form is shaped around how people pick things on a touchscreen (a day
 * tile, an hour stepper, "fortnightly"), not around the stored rule. These
 * functions are the only place that translation happens, in both directions,
 * so what the AI proposes and what the person edits are always the same thing.
 */

export type RepeatFreq = "daily" | "weekly" | "fortnightly" | "monthly";

export interface ReminderForm {
  title: string;
  details: string;
  assignee: MemberRef | null;
  mode: "once" | "repeat";
  /** Local date, YYYY-MM-DD (once). */
  day: string;
  /** Local time, HH:mm. */
  time: string;
  freq: RepeatFreq;
  weekdays: Weekday[];
  monthMode: "day" | "nth";
  monthDay: number;
  nth: 1 | 2 | 3 | 4 | -1;
  nthWeekday: Weekday;
}

/** A sensible blank form: the next whole half-hour today. */
export function blankForm(now: DateTime): ReminderForm {
  const next = now.plus({ minutes: 30 - (now.minute % 30) }).startOf("minute");
  const day = next.toISODate()!;
  return {
    title: "",
    details: "",
    assignee: null,
    mode: "once",
    day,
    time: next.toFormat("HH:mm"),
    freq: "weekly",
    weekdays: [now.weekday as Weekday],
    monthMode: "day",
    monthDay: now.day,
    nth: (Math.min(4, Math.ceil(now.day / 7)) as 1 | 2 | 3 | 4),
    nthWeekday: now.weekday as Weekday,
  };
}

export function formToWhen(form: ReminderForm, tz: string, now: DateTime): When {
  if (form.mode === "once") {
    const [h, m] = form.time.split(":").map(Number);
    const at = DateTime.fromISO(form.day, { zone: tz }).set({ hour: h, minute: m, second: 0, millisecond: 0 });
    return { kind: "once", at: at.toISO()! };
  }
  const start = now.setZone(tz).toISODate()!;
  const base = { time: form.time, start };
  let rule: RecurrenceRule;
  switch (form.freq) {
    case "daily":
      rule = { freq: "daily", interval: 1, ...base };
      break;
    case "weekly":
    case "fortnightly":
      rule = {
        freq: "weekly",
        interval: form.freq === "fortnightly" ? 2 : 1,
        weekdays: [...form.weekdays].sort((a, b) => a - b),
        ...base,
      };
      break;
    case "monthly":
      rule =
        form.monthMode === "day"
          ? { freq: "monthly", interval: 1, monthDay: form.monthDay, ...base }
          : { freq: "monthly_nth", interval: 1, nth: form.nth, weekday: form.nthWeekday, ...base };
      break;
  }
  return { kind: "recurring", rule };
}

/** Fold an AI draft into the form, keeping anything the draft didn't settle. */
export function applyDraft(form: ReminderForm, draft: ProposedDraft, tz: string): ReminderForm {
  const next: ReminderForm = {
    ...form,
    title: draft.title || form.title,
    details: draft.details ?? form.details,
    assignee: draft.assignee ? { kind: draft.assignee.kind, id: draft.assignee.id } : form.assignee,
  };
  const when = draft.when;
  if (!when) return next;
  if (when.kind === "once") {
    const at = DateTime.fromISO(when.at, { zone: tz });
    return { ...next, mode: "once", day: at.toISODate()!, time: at.toFormat("HH:mm") };
  }
  const r = when.rule;
  const withTime = { ...next, mode: "repeat" as const, time: r.time };
  switch (r.freq) {
    case "daily":
      return { ...withTime, freq: "daily" };
    case "weekly":
      return { ...withTime, freq: r.interval === 2 ? "fortnightly" : "weekly", weekdays: r.weekdays as Weekday[] };
    case "monthly":
      return { ...withTime, freq: "monthly", monthMode: "day", monthDay: r.monthDay };
    case "monthly_nth":
      return { ...withTime, freq: "monthly", monthMode: "nth", nth: r.nth, nthWeekday: r.weekday as Weekday };
  }
}

/** What stops Save, in words. Null when the form can be saved. */
export function formProblem(form: ReminderForm, tz: string, now: DateTime): string | null {
  if (!form.title.trim()) return "Give it a name";
  if (form.mode === "once") {
    const when = formToWhen(form, tz, now);
    if (when.kind === "once" && DateTime.fromISO(when.at) <= now.plus({ seconds: 30 })) return "That time has passed";
  } else if ((form.freq === "weekly" || form.freq === "fortnightly") && form.weekdays.length === 0) {
    return "Pick at least one day";
  }
  return null;
}

/** Step a HH:mm time by minutes, wrapping round the day. */
export function stepTime(time: string, deltaMin: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + deltaMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Flip am ↔ pm. */
export function flipMeridiem(time: string): string {
  return stepTime(time, Number(time.slice(0, 2)) >= 12 ? -720 : 720);
}
