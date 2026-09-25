import { z } from "zod";

/**
 * What the language model is allowed to say about a reminder request.
 *
 * The model is a *parser*, not a calculator. It reports what the person said —
 * "tomorrow", "Tuesday night", "every other week", the name they used — as
 * labelled slots. It never produces a timestamp, a database id or a cron
 * string. Everything that turns slots into facts (which Tuesday, what time
 * "night" is in this house, which member "Soph" is) happens in resolve.ts, in
 * code, against the household's own data.
 *
 * That split is the capstone research's rule applied to reminders: the model
 * must not produce the value. It keeps date arithmetic out of the model, where
 * it is least reliable, and keeps household identifiers out of the prompt's
 * attack surface. It also makes the offline fallback parser a drop-in: it
 * fills the same slots with regexes.
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const PARTS_OF_DAY = [
  "morning",
  "midday",
  "afternoon",
  "after_school",
  "evening",
  "dinner",
  "night",
  "bedtime",
] as const;

const Weekday = z.enum(WEEKDAYS);

export const SlotsSchema = z.object({
  /** The task as a short imperative for a screen: "Take out the bins". */
  title: z.string().min(1).max(200),
  details: z.string().max(1000).nullable(),
  /** The name as said ("Sophia", "Raff", "me", "everyone"), or null. */
  assignee: z.string().max(80).nullable(),

  date_kind: z.enum(["none", "today", "tomorrow", "in_days", "weekday", "calendar"]),
  in_days: z.number().int().min(0).max(366).nullable(),
  weekday: Weekday.nullable(),
  weekday_which: z.enum(["this", "next"]).nullable(),
  cal_month: z.number().int().min(1).max(12).nullable(),
  cal_day: z.number().int().min(1).max(31).nullable(),
  cal_year: z.number().int().min(2000).max(2100).nullable(),

  time_kind: z.enum(["none", "clock", "part_of_day", "relative"]),
  hour: z.number().int().min(0).max(23).nullable(),
  minute: z.number().int().min(0).max(59).nullable(),
  /** True when the person gave no am/pm and nothing else settles it ("at 7"). */
  hour_ambiguous: z.boolean(),
  part_of_day: z.enum(PARTS_OF_DAY).nullable(),
  relative_minutes: z.number().int().min(1).max(60 * 24 * 7).nullable(),

  repeat_kind: z.enum(["none", "daily", "weekdays", "weekly", "monthly_day", "monthly_nth"]),
  repeat_interval: z.number().int().min(1).max(52).nullable(),
  repeat_weekdays: z.array(Weekday).max(7),
  repeat_month_day: z.number().int().min(1).max(31).nullable(),
  repeat_nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]).nullable(),

  /** Anything the model could not settle, in words for the person. */
  ambiguities: z.array(z.string().max(200)).max(5),
});

export type Slots = z.infer<typeof SlotsSchema>;

/** Slots with nothing set — the fallback parser starts from this. */
export function emptySlots(title: string): Slots {
  return {
    title,
    details: null,
    assignee: null,
    date_kind: "none",
    in_days: null,
    weekday: null,
    weekday_which: null,
    cal_month: null,
    cal_day: null,
    cal_year: null,
    time_kind: "none",
    hour: null,
    minute: null,
    hour_ambiguous: false,
    part_of_day: null,
    relative_minutes: null,
    repeat_kind: "none",
    repeat_interval: null,
    repeat_weekdays: [],
    repeat_month_day: null,
    repeat_nth: null,
    ambiguities: [],
  };
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const int = (min: number, max: number) => ({ type: "integer", minimum: min, maximum: max });

/** JSON Schema for the `record_reminder` tool, mirroring SlotsSchema. */
export const SLOTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "details", "assignee",
    "date_kind", "in_days", "weekday", "weekday_which", "cal_month", "cal_day", "cal_year",
    "time_kind", "hour", "minute", "hour_ambiguous", "part_of_day", "relative_minutes",
    "repeat_kind", "repeat_interval", "repeat_weekdays", "repeat_month_day", "repeat_nth",
    "ambiguities",
  ],
  properties: {
    title: { type: "string", description: "The task as a short imperative for a screen, e.g. 'Take out the bins'. No names, no times." },
    details: nullable({ type: "string", description: "Extra context the person gave, if any." }),
    assignee: nullable({ type: "string", description: "Who it is for, exactly as said ('Sophia', 'me', 'everyone'). Null if unsaid." }),
    date_kind: { type: "string", enum: ["none", "today", "tomorrow", "in_days", "weekday", "calendar"] },
    in_days: nullable(int(0, 366)),
    weekday: nullable({ type: "string", enum: [...WEEKDAYS] }),
    weekday_which: nullable({ type: "string", enum: ["this", "next"] }),
    cal_month: nullable(int(1, 12)),
    cal_day: nullable(int(1, 31)),
    cal_year: nullable(int(2000, 2100)),
    time_kind: { type: "string", enum: ["none", "clock", "part_of_day", "relative"] },
    hour: nullable({ ...int(0, 23), description: "24h. For 'at 7' with no am/pm, give 7 and set hour_ambiguous." }),
    minute: nullable(int(0, 59)),
    hour_ambiguous: { type: "boolean" },
    part_of_day: nullable({ type: "string", enum: [...PARTS_OF_DAY] }),
    relative_minutes: nullable({ ...int(1, 10080), description: "For 'in 20 minutes' / 'in 2 hours'." }),
    repeat_kind: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly_day", "monthly_nth"] },
    repeat_interval: nullable({ ...int(1, 52), description: "2 for 'every other' / 'every second' / fortnightly." }),
    repeat_weekdays: { type: "array", items: { type: "string", enum: [...WEEKDAYS] } },
    repeat_month_day: nullable(int(1, 31)),
    repeat_nth: nullable({ type: "integer", enum: [1, 2, 3, 4, -1], description: "For 'the 2nd Tuesday of the month'. -1 = last." }),
    ambiguities: { type: "array", items: { type: "string" }, description: "Short questions for anything you could not settle." },
  },
} as const;
