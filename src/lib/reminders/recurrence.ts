import { DateTime } from "luxon";
import { z } from "zod";

/**
 * Structured recurrence rules for reminders.
 *
 * Why not cron: cron cannot say "every other Tuesday" (it has no phase), and
 * "every 2nd Tuesday" is ambiguous in English: fortnightly, or the second
 * Tuesday of the month. The rule shape below makes that choice explicit and
 * stores it, so the UI can show exactly what will happen and the AI parser has
 * to commit to one reading instead of hiding it in a cron string.
 *
 * All maths happens in the reminder's IANA timezone on *wall-clock* time:
 * "7:30 pm every Tuesday" stays 7:30 pm across DST changes. A wall time that
 * does not exist (the spring-forward gap) is shifted forward by Luxon.
 *
 * The rule maps onto an RFC 5545 RRULE subset (`toRRule`) so it can be exported
 * to calendars or exposed over MCP without translation loss.
 */

/** ISO weekday: 1 = Monday … 7 = Sunday (Luxon's convention). */
export const WeekdaySchema = z.number().int().min(1).max(7);
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm");
const ISODATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const base = {
  /** Local wall-clock time of day, 24h. */
  time: HHMM,
  /** Local date the series starts on; anchors the interval phase. */
  start: ISODATE,
  /** Optional last local date (inclusive). */
  until: ISODATE.nullish(),
};

export const RecurrenceRuleSchema = z.discriminatedUnion("freq", [
  z.object({ freq: z.literal("daily"), interval: z.number().int().min(1).max(365), ...base }),
  z.object({
    freq: z.literal("weekly"),
    interval: z.number().int().min(1).max(52),
    weekdays: z.array(WeekdaySchema).min(1).max(7),
    ...base,
  }),
  z.object({
    freq: z.literal("monthly"),
    interval: z.number().int().min(1).max(12),
    /** Day of month 1–31. Months that are too short use their last day. */
    monthDay: z.number().int().min(1).max(31),
    ...base,
  }),
  z.object({
    freq: z.literal("monthly_nth"),
    interval: z.number().int().min(1).max(12),
    /** 1–4 = first…fourth, -1 = last. */
    nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
    weekday: WeekdaySchema,
    ...base,
  }),
]);

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

/** Parse untrusted JSON (a DB column, an API body) into a rule, or null. */
export function parseRecurrence(value: unknown): RecurrenceRule | null {
  const r = RecurrenceRuleSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Longest gap we ever need to scan: 12 months, plus a 31-day month, plus slack. */
const MAX_SCAN_DAYS = 800;

/**
 * The first occurrence strictly after `after`, or null if the series has
 * ended. Pure: the only clock is the argument.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  timezone: string,
  after: Date,
): Date | null {
  const zone = timezone || "UTC";
  const [hour, minute] = rule.time.split(":").map((n) => parseInt(n, 10));
  const start = DateTime.fromISO(rule.start, { zone }).startOf("day");
  if (!start.isValid) return null;
  const until = rule.until ? DateTime.fromISO(rule.until, { zone }).endOf("day") : null;

  let day = DateTime.fromJSDate(after, { zone }).startOf("day");
  if (day < start) day = start;

  for (let i = 0; i < MAX_SCAN_DAYS; i++, day = day.plus({ days: 1 })) {
    if (until && day > until) return null;
    if (!matchesDay(rule, day, start)) continue;
    const at = day.set({ hour, minute, second: 0, millisecond: 0 });
    if (at.toMillis() > after.getTime()) return at.toJSDate();
  }
  return null;
}

/** All occurrences in [from, to), for building a day's agenda. */
export function occurrencesBetween(
  rule: RecurrenceRule,
  timezone: string,
  from: Date,
  to: Date,
  limit = 50,
): Date[] {
  const out: Date[] = [];
  let cursor = new Date(from.getTime() - 1);
  while (out.length < limit) {
    const next = nextOccurrence(rule, timezone, cursor);
    if (!next || next.getTime() >= to.getTime()) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

/** Whole calendar days between two local dates. DST days don't skew phase. */
function calendarDays(a: DateTime, b: DateTime): number {
  const ua = Date.UTC(a.year, a.month - 1, a.day);
  const ub = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((ub - ua) / 86_400_000);
}

function monthsBetween(a: DateTime, b: DateTime): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

function matchesDay(rule: RecurrenceRule, day: DateTime, start: DateTime): boolean {
  switch (rule.freq) {
    case "daily":
      return calendarDays(start, day) % rule.interval === 0;
    case "weekly": {
      if (!rule.weekdays.includes(day.weekday)) return false;
      // Phase counts whole weeks from the Monday of the start week, so
      // "every other Tuesday" is anchored to the week the series began in.
      const weeks = Math.floor(calendarDays(start.startOf("week"), day.startOf("week")) / 7);
      return weeks % rule.interval === 0;
    }
    case "monthly": {
      if (monthsBetween(start, day) % rule.interval !== 0) return false;
      return day.day === Math.min(rule.monthDay, day.daysInMonth ?? 31);
    }
    case "monthly_nth": {
      if (day.weekday !== rule.weekday) return false;
      if (monthsBetween(start, day) % rule.interval !== 0) return false;
      if (rule.nth === -1) return day.day + 7 > (day.daysInMonth ?? 31);
      return Math.ceil(day.day / 7) === rule.nth;
    }
  }
}

const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const NTH: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", [-1]: "last" };

/** "19:30" → "7:30 pm", "07:00" → "7 am". */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const s = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** Plain-English summary, e.g. "Every other Tuesday at 7:30 pm". */
export function describeRecurrence(rule: RecurrenceRule): string {
  const at = `at ${formatTime12(rule.time)}`;
  switch (rule.freq) {
    case "daily":
      return rule.interval === 1 ? `Every day ${at}` : `Every ${rule.interval} days ${at}`;
    case "weekly": {
      const days = [...rule.weekdays].sort((a, b) => a - b);
      const list =
        days.join() === "1,2,3,4,5"
          ? "weekday"
          : days.length === 1
            ? DAY_LONG[days[0]]
            : days.map((d) => DAY_SHORT[d]).join(", ");
      if (rule.interval === 1) return `Every ${list} ${at}`;
      if (rule.interval === 2) return `Every other ${list} ${at}`;
      return `Every ${rule.interval} weeks on ${list} ${at}`;
    }
    case "monthly": {
      const day = rule.monthDay >= 29 ? `${ordinal(rule.monthDay)} (or last day)` : ordinal(rule.monthDay);
      const every = rule.interval === 1 ? "Monthly" : `Every ${rule.interval} months`;
      return `${every} on the ${day} ${at}`;
    }
    case "monthly_nth": {
      const every = rule.interval === 1 ? "of each month" : `of every ${rule.interval} months`;
      return `The ${NTH[rule.nth]} ${DAY_LONG[rule.weekday]} ${every} ${at}`;
    }
  }
}

const RR_DAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/**
 * RFC 5545 RRULE for interop (calendar export, MCP). One documented divergence:
 * external calendars skip months too short for a BYMONTHDAY of 29–30, where
 * this engine clamps to the last day. The 31st is exported as -1 (last day),
 * which is exact.
 */
export function toRRule(rule: RecurrenceRule): string {
  const parts: string[] = [];
  const [h, m] = rule.time.split(":");
  switch (rule.freq) {
    case "daily":
      parts.push("FREQ=DAILY");
      break;
    case "weekly":
      parts.push("FREQ=WEEKLY", `BYDAY=${rule.weekdays.map((d) => RR_DAY[d]).join(",")}`);
      break;
    case "monthly":
      parts.push("FREQ=MONTHLY", `BYMONTHDAY=${rule.monthDay === 31 ? -1 : rule.monthDay}`);
      break;
    case "monthly_nth":
      parts.push("FREQ=MONTHLY", `BYDAY=${rule.nth}${RR_DAY[rule.weekday]}`);
      break;
  }
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  parts.push(`BYHOUR=${parseInt(h, 10)}`, `BYMINUTE=${parseInt(m, 10)}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, "")}T235959`);
  return `RRULE:${parts.join(";")}`;
}
