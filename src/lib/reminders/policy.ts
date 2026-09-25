import { MISSED_TICK_GRACE_MS } from "./schedule";

/**
 * Firing policy: what the scheduler does with a slot it finds due. Pure.
 *
 * The hard case is lateness. The scheduler can be late for dull reasons — a
 * cron tick Vercel skipped, a home server rebooting, a deploy — and for bad
 * ones, like a panel that was off for a weekend. The rules:
 *
 *  - On time, or late by less than a tick or two: fire normally.
 *  - A recurring slot that is badly late is *skipped*, not fired. The next one
 *    is coming, and "bins out" announced at 2 am because the server came back
 *    then is worse than silence. The skipped slot is recorded (status
 *    DISMISSED, resolution "missed") so the agenda can say so honestly.
 *  - A one-off that is badly late is skipped the same way. It has no next slot,
 *    so it shows as Missed on the agenda rather than vanishing.
 *  - Between the two: fire, flagged `late`, so the card can say "due 7:30 pm".
 */

/** Late by up to this is just a slow tick; nobody needs to be told. */
export const ON_TIME_MS = 2 * 60 * 1000;
/** A recurring slot later than this is skipped rather than announced. */
export const RECURRING_CATCH_UP_MS = 30 * 60 * 1000;
/** A one-off may be this late and still fire (matches the write-path guard). */
export const ONE_OFF_CATCH_UP_MS = MISSED_TICK_GRACE_MS;

/**
 * An alert nobody acted on is closed after this. A kitchen panel should not
 * still be showing Tuesday's bins on Thursday; the occurrence is kept, marked
 * DISMISSED/"expired", and the next slot starts clean.
 */
export const ALERT_TTL_MS = 6 * 60 * 60 * 1000;

export type FirePlan = { action: "fire"; late: boolean } | { action: "skip"; reason: "missed" };

export function planSeriesFire(
  kind: "ONE_OFF" | "RECURRING",
  scheduledFor: Date,
  now: Date,
): FirePlan {
  const lateBy = now.getTime() - scheduledFor.getTime();
  const limit = kind === "RECURRING" ? RECURRING_CATCH_UP_MS : ONE_OFF_CATCH_UP_MS;
  if (lateBy > limit) return { action: "skip", reason: "missed" };
  return { action: "fire", late: lateBy > ON_TIME_MS };
}

/** Whether an open (fired, unanswered) alert has outlived its welcome. */
export function isAlertStale(firedAt: Date | null, now: Date): boolean {
  if (!firedAt) return false;
  return now.getTime() - firedAt.getTime() > ALERT_TTL_MS;
}
