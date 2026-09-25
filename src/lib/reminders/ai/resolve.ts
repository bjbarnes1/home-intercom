import { DateTime } from "luxon";
import {
  describeRecurrence,
  formatTime12,
  type RecurrenceRule,
  type Weekday,
} from "../recurrence";
import type { Member, MemberRef, When } from "../types";
import { WEEKDAYS, type Slots } from "./slots";

/**
 * Slots → a reminder draft, deterministically.
 *
 * Every judgement a family would make about what they meant is written down
 * here as a rule, so it is testable and the same every time:
 *
 *  - Parts of the day have household defaults ("night" is 7:30 pm, when bins
 *    go out, not 11 pm).
 *  - "At 7" with no am/pm means the next 7 o'clock that hasn't passed if no
 *    day was named; with a day named, 7–11 is morning and 1–6 is afternoon.
 *  - A time that has already passed today, with no day named, means tomorrow
 *    ("remind me at 4" said at 6 pm). A named day in the past is flagged.
 *  - "Every 2nd Tuesday" is read as fortnightly (how Australians say it) and
 *    the draft says so, because "the second Tuesday of the month" is a
 *    different reminder.
 *
 * Output is a *draft*. Nothing here writes; a person confirms first.
 */

export const PART_OF_DAY_DEFAULTS: Record<NonNullable<Slots["part_of_day"]>, string> = {
  morning: "07:30",
  midday: "12:00",
  afternoon: "15:30",
  after_school: "15:45",
  evening: "18:00",
  dinner: "18:00",
  night: "19:30",
  bedtime: "19:45",
};

/** When a day was given but no time. Flagged, so the person sees the guess. */
const DEFAULT_TIME = "09:00";

export interface ResolveContext {
  now: Date;
  timezone: string;
  members: Member[];
  /** Who is asking, when known, so "me" resolves. */
  speaker?: Member | null;
  /** The raw request, for the fortnightly-vs-monthly check. */
  raw?: string;
}

export interface ProposedDraft {
  title: string;
  details: string | null;
  assignee: (MemberRef & { name: string }) | null;
  /** Null when the request never said when; the modal asks. */
  when: When | null;
}

export interface Resolution {
  draft: ProposedDraft;
  /** Plain-language things the person should check before saving. */
  issues: string[];
  /** One line to read back: "Gus · Every Tuesday at 7:30 pm". */
  summary: string;
}

export function resolveSlots(slots: Slots, ctx: ResolveContext): Resolution {
  const issues: string[] = [...slots.ambiguities];
  const tz = ctx.timezone || "UTC";
  const now = DateTime.fromJSDate(ctx.now, { zone: tz });

  const assignee = resolveAssignee(slots.assignee, ctx, issues);
  const when =
    slots.repeat_kind !== "none" ? resolveRecurring(slots, now, issues) : resolveOnce(slots, now, issues);

  if (ctx.raw && /\b(2nd|second)\s+(mon|tue|wed|thu|fri|sat|sun)/i.test(ctx.raw) && !/\bof\s+(the|each|every)\s+month/i.test(ctx.raw)) {
    if (when?.kind === "recurring" && when.rule.freq === "weekly" && when.rule.interval === 2) {
      issues.push("Read as every other week. Say “2nd Tuesday of the month” for monthly.");
    }
  }

  const draft: ProposedDraft = {
    title: tidyTitle(slots.title),
    details: slots.details?.trim() || null,
    assignee,
    when,
  };
  return { draft, issues: dedupe(issues), summary: summarise(draft, now) };
}

// ─── People ────────────────────────────────────────────────────────────────

const EVERYONE = /^(everyone|everybody|all|the house|the family|the kids|kids|us)$/i;
const SELF = /^(me|myself|i)$/i;

function resolveAssignee(mention: string | null, ctx: ResolveContext, issues: string[]) {
  if (!mention) return null;
  const said = mention.trim();
  if (EVERYONE.test(said)) return null;
  if (SELF.test(said)) {
    if (ctx.speaker) return { kind: ctx.speaker.kind, id: ctx.speaker.id, name: ctx.speaker.name };
    issues.push("Who is “me” on this panel? Pick a person.");
    return null;
  }
  const found = matchMember(said, ctx.members);
  if (found.length === 1) return { kind: found[0].kind, id: found[0].id, name: found[0].name };
  if (found.length > 1) issues.push(`Did you mean ${found.map((m) => m.name).join(" or ")}?`);
  else issues.push(`I don't know who “${said}” is. Pick a person.`);
  return null;
}

/** Household members a spoken name could mean, best match first. */
export function matchMember(said: string, members: Member[]): Member[] {
  const n = normaliseName(said);
  if (!n) return [];
  const exact = members.filter((m) => normaliseName(m.name) === n);
  if (exact.length) return exact;
  // "Soph" ↔ "Sophia", "Raff" ↔ "Rafferty": either is a prefix of the other.
  const prefix = members.filter((m) => {
    const name = normaliseName(m.name);
    return Math.min(name.length, n.length) >= 3 && (name.startsWith(n) || n.startsWith(name));
  });
  if (prefix.length) return prefix;
  // One slip of the tongue or transcription ("Georgete").
  return members.filter((m) => {
    const name = normaliseName(m.name);
    return name.length >= 4 && levenshtein(name, n) <= 1;
  });
}

function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]s$/, "")
    .replace(/[^a-z]/g, "");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// ─── Time of day ───────────────────────────────────────────────────────────

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Time of day for a slot set, or null when none was given. */
function timeOfDay(slots: Slots, dayNamed: boolean, day: DateTime, now: DateTime): string | null {
  if (slots.time_kind === "part_of_day" && slots.part_of_day) return PART_OF_DAY_DEFAULTS[slots.part_of_day];
  if (slots.time_kind !== "clock" || slots.hour == null) return null;
  const minute = slots.minute ?? 0;
  let hour = slots.hour;
  if (slots.hour_ambiguous && hour >= 1 && hour <= 12) {
    const am = hour === 12 ? 0 : hour;
    const pm = hour === 12 ? 12 : hour + 12;
    if (!dayNamed) {
      // Today: the next one of the two that has not passed.
      const amAt = day.set({ hour: am, minute });
      const pmAt = day.set({ hour: pm, minute });
      hour = amAt > now ? am : pmAt > now ? pm : am; // both past → am, rolled to tomorrow later
    } else {
      hour = hour === 12 ? 12 : hour >= 7 ? am : pm;
    }
  }
  return hhmm(hour, minute);
}

// ─── One-off ───────────────────────────────────────────────────────────────

const WD: Record<(typeof WEEKDAYS)[number], Weekday> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

function resolveOnce(slots: Slots, now: DateTime, issues: string[]): When | null {
  if (slots.time_kind === "relative" && slots.relative_minutes) {
    return { kind: "once", at: now.plus({ minutes: slots.relative_minutes }).set({ second: 0, millisecond: 0 }).toISO()! };
  }

  const today = now.startOf("day");
  let day: DateTime;
  let dayNamed = true;
  switch (slots.date_kind) {
    case "today":
      day = today;
      break;
    case "tomorrow":
      day = today.plus({ days: 1 });
      break;
    case "in_days":
      day = today.plus({ days: slots.in_days ?? 0 });
      break;
    case "weekday": {
      if (!slots.weekday) {
        issues.push("Which day?");
        return null;
      }
      const target = WD[slots.weekday];
      let ahead = (target - today.weekday + 7) % 7;
      if (slots.weekday_which === "next" && ahead === 0) ahead = 7;
      day = today.plus({ days: ahead });
      // "Tuesday" said on a Tuesday whose time has gone means next Tuesday;
      // handled below once the time is known.
      break;
    }
    case "calendar": {
      if (!slots.cal_month || !slots.cal_day) {
        issues.push("Which date?");
        return null;
      }
      day = DateTime.fromObject(
        { year: slots.cal_year ?? today.year, month: slots.cal_month, day: slots.cal_day },
        { zone: now.zone },
      );
      if (!day.isValid) {
        issues.push("That date doesn't exist.");
        return null;
      }
      if (!slots.cal_year && day < today) day = day.plus({ years: 1 });
      break;
    }
    default:
      day = today;
      dayNamed = false;
  }

  let time = timeOfDay(slots, dayNamed, day, now);
  if (!time) {
    if (!dayNamed) {
      issues.push("When should it go off?");
      return null;
    }
    time = DEFAULT_TIME;
    issues.push(`No time given, so it's set for ${formatTime12(DEFAULT_TIME)}.`);
  }

  const [h, m] = time.split(":").map(Number);
  let at = day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  if (at <= now) {
    if (!dayNamed || (slots.date_kind === "weekday" && slots.weekday_which !== "next")) {
      at = at.plus({ days: slots.date_kind === "weekday" ? 7 : 1 });
    } else {
      issues.push("That time has already passed. Pick a later one.");
    }
  }
  return { kind: "once", at: at.toISO()! };
}

// ─── Recurring ─────────────────────────────────────────────────────────────

function resolveRecurring(slots: Slots, now: DateTime, issues: string[]): When | null {
  let time = timeOfDay(slots, true, now.startOf("day"), now);
  if (slots.time_kind === "relative") issues.push("A repeating reminder needs a time of day.");
  if (!time) {
    time = DEFAULT_TIME;
    issues.push(`No time given, so it's set for ${formatTime12(DEFAULT_TIME)}.`);
  }
  const start = now.toISODate()!;
  const interval = slots.repeat_interval ?? 1;
  let rule: RecurrenceRule;

  switch (slots.repeat_kind) {
    case "daily":
      rule = { freq: "daily", interval, time, start };
      break;
    case "weekdays":
      rule = { freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], time, start };
      break;
    case "weekly": {
      const days = slots.repeat_weekdays.length
        ? slots.repeat_weekdays.map((d) => WD[d])
        : slots.weekday
          ? [WD[slots.weekday]]
          : [now.weekday as Weekday];
      rule = { freq: "weekly", interval: Math.min(interval, 52), weekdays: [...new Set(days)].sort(), time, start };
      break;
    }
    case "monthly_day":
      rule = {
        freq: "monthly",
        interval: Math.min(interval, 12),
        monthDay: slots.repeat_month_day ?? slots.cal_day ?? now.day,
        time,
        start,
      };
      break;
    case "monthly_nth": {
      const wd = slots.repeat_weekdays[0] ?? slots.weekday;
      if (!wd || !slots.repeat_nth) {
        issues.push("Which week of the month?");
        return null;
      }
      rule = { freq: "monthly_nth", interval: Math.min(interval, 12), nth: slots.repeat_nth, weekday: WD[wd], time, start };
      break;
    }
    default:
      return null;
  }
  return { kind: "recurring", rule };
}

// ─── Presentation ──────────────────────────────────────────────────────────

function tidyTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function describeWhen(when: When | null, now: DateTime): string {
  if (!when) return "No time yet";
  if (when.kind === "recurring") return describeRecurrence(when.rule);
  const at = DateTime.fromISO(when.at, { zone: now.zone });
  const days = Math.round(at.startOf("day").diff(now.startOf("day"), "days").days);
  const time = formatTime12(at.toFormat("HH:mm"));
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Tomorrow at ${time}`;
  if (days < 7) return `${at.toFormat("cccc")} at ${time}`;
  return `${at.toFormat("ccc d LLL")} at ${time}`;
}

function summarise(draft: ProposedDraft, now: DateTime): string {
  const when = describeWhen(draft.when, now);
  return draft.assignee ? `${draft.assignee.name} · ${when}` : when;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}
