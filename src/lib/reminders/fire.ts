import { runReminderTick, type TickResult } from "./engine";

/**
 * Fire every reminder due at `now`.
 *
 * Kept as the name the cron route has always called. The work moved to
 * `engine.ts` (the tick) and `deliver.ts` (getting one occurrence onto
 * panels), so the same pass can be driven by Vercel Cron or by the in-process
 * scheduler in `scheduler.ts` without either knowing about the other.
 */
export type FireResult = TickResult;

export function fireDueReminders(now: Date): Promise<FireResult> {
  return runReminderTick(now);
}
