import parser from "cron-parser";

/**
 * Schedule math for reminders. Pure functions — no DB, no clock reads except
 * the explicit `from` argument — so the scheduler logic is fully testable.
 */

export type ReminderKind = "RECURRING" | "ONE_OFF";

export interface ScheduleInput {
  kind: ReminderKind;
  enabled: boolean;
  /** 5-field cron expression, required for RECURRING. */
  cron?: string | null;
  /** Fire time for ONE_OFF. */
  runAt?: Date | null;
  /** IANA timezone the cron/runAt are interpreted in. */
  timezone?: string;
  /** If set and in the future, the reminder is snoozed until this instant. */
  snoozedUntil?: Date | null;
  /** Last time this reminder actually fired (used to advance ONE_OFF past). */
  lastRunAt?: Date | null;
}

/**
 * Compute the next instant a reminder should fire strictly after `from`,
 * or null if it will never fire again (disabled, or a spent one-off).
 */
export function computeNextRun(input: ScheduleInput, from: Date): Date | null {
  if (!input.enabled) return null;

  // A live snooze always wins: fire when the snooze ends.
  if (input.snoozedUntil && input.snoozedUntil.getTime() > from.getTime()) {
    return input.snoozedUntil;
  }

  if (input.kind === "ONE_OFF") {
    if (!input.runAt) return null;
    // Already fired → spent.
    if (input.lastRunAt && input.lastRunAt.getTime() >= input.runAt.getTime()) {
      return null;
    }
    return input.runAt;
  }

  // RECURRING
  if (!input.cron) return null;
  try {
    const interval = parser.parseExpression(input.cron, {
      currentDate: from,
      tz: input.timezone || "UTC",
    });
    return interval.next().toDate();
  } catch {
    // An invalid cron never fires (surfaced as a validation error at write time).
    return null;
  }
}

/**
 * Whether a reminder is due at `now` given its materialised nextRunAt.
 * The scheduler polls and calls this to decide what to fire.
 */
export function isDue(nextRunAt: Date | null | undefined, now: Date): boolean {
  if (!nextRunAt) return false;
  return nextRunAt.getTime() <= now.getTime();
}

/** Validate a cron expression; returns an error message or null if valid. */
export function validateCron(cron: string): string | null {
  try {
    parser.parseExpression(cron);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid cron expression";
  }
}

/**
 * Apply a snooze of `minutes` from `now`, returning the new snoozedUntil.
 */
export function snoozeUntil(now: Date, minutes: number): Date {
  if (minutes <= 0) throw new Error("Snooze minutes must be positive");
  return new Date(now.getTime() + minutes * 60_000);
}
