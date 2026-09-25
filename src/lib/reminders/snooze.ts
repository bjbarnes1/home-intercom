import { DateTime } from "luxon";
import { z } from "zod";

/**
 * Snooze maths. Pure — the clock and the timezone are arguments.
 *
 * A snooze belongs to an *occurrence*, never to the series: snoozing tonight's
 * bins until 8 pm re-fires tonight's bins at 8 pm and leaves next Tuesday's
 * exactly where it was. (The old model kept `snoozedUntil` on the reminder and
 * let it override the next run, which quietly swallowed a slot whenever a
 * snooze outlived the gap to the next one.)
 */

export const SNOOZE_PRESETS = ["5m", "15m", "1h", "tomorrow"] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

/** Longest a snooze may run. Past this it is a new reminder, not a snooze. */
export const MAX_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** Shortest custom snooze; anything less is a double-tap, not an intention. */
export const MIN_SNOOZE_MS = 60 * 1000;

export const SnoozeRequestSchema = z.union([
  z.object({ preset: z.enum(SNOOZE_PRESETS) }),
  z.object({ minutes: z.number().int().min(1).max(MAX_SNOOZE_MS / 60_000) }),
  z.object({ until: z.string().datetime({ offset: true }) }),
]);
export type SnoozeRequest = z.infer<typeof SnoozeRequestSchema>;

export class SnoozeError extends Error {}

export interface SnoozeContext {
  now: Date;
  timezone: string;
  /**
   * The slot the occurrence belongs to. "Tomorrow" keeps its wall-clock time,
   * because a reminder set for 7:30 pm is about the evening, and pushing it to
   * a fixed 9 am would be a different reminder.
   */
  scheduledFor: Date;
}

const PRESET_MINUTES: Record<Exclude<SnoozePreset, "tomorrow">, number> = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
};

export const SNOOZE_LABEL: Record<SnoozePreset, string> = {
  "5m": "5 min",
  "15m": "15 min",
  "1h": "1 hour",
  tomorrow: "Tomorrow",
};

/** When a snooze request should re-fire. Throws SnoozeError on a bad request. */
export function resolveSnooze(req: SnoozeRequest, ctx: SnoozeContext): Date {
  const now = ctx.now.getTime();
  let at: number;

  if ("preset" in req) {
    if (req.preset === "tomorrow") {
      const slot = DateTime.fromJSDate(ctx.scheduledFor, { zone: ctx.timezone || "UTC" });
      const today = DateTime.fromJSDate(ctx.now, { zone: ctx.timezone || "UTC" });
      at = today
        .plus({ days: 1 })
        .set({ hour: slot.hour, minute: slot.minute, second: 0, millisecond: 0 })
        .toMillis();
    } else {
      at = now + PRESET_MINUTES[req.preset] * 60_000;
    }
  } else if ("minutes" in req) {
    at = now + req.minutes * 60_000;
  } else {
    at = new Date(req.until).getTime();
  }

  if (!Number.isFinite(at)) throw new SnoozeError("That time is not valid");
  if (at - now < MIN_SNOOZE_MS) throw new SnoozeError("Pick a time at least a minute from now");
  if (at - now > MAX_SNOOZE_MS) throw new SnoozeError("Snooze can be a week at most");
  return new Date(at);
}
