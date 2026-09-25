import { reportError } from "@/lib/errors/report";
import { ReminderScheduler } from "./scheduler";
import { nextDueAt, runReminderTick } from "./engine";
import { reminderEvents } from "./bus";

/**
 * Hosting the scheduler in this process.
 *
 * Opt-in with `REMINDER_SCHEDULER=inprocess`, and only meaningful where the
 * server is a long-lived Node process: `next start` on a home server, or the
 * Hub running its own stack. On Vercel a function instance lives for one
 * request, so a timer set there would never fire; Vercel Cron hitting
 * /api/cron/tick remains the scheduler in that deployment.
 *
 * The singleton lives on globalThis so dev-mode hot reload does not stack up a
 * new loop (and a new bus listener) on every edit.
 */

const KEY = Symbol.for("famos.reminderScheduler");
type Holder = { scheduler?: ReminderScheduler; unsubscribe?: () => void };
const holder = ((globalThis as Record<symbol, unknown>)[KEY] ??= {}) as Holder;

export function inProcessSchedulerEnabled(): boolean {
  return (process.env.REMINDER_SCHEDULER ?? "").trim().toLowerCase() === "inprocess";
}

export function getReminderScheduler(): ReminderScheduler {
  holder.scheduler ??= new ReminderScheduler({
    tick: runReminderTick,
    nextDueAt,
    onError: (e) => reportError(e, { code: "reminders.scheduler.pass", route: "ReminderScheduler" }),
  });
  return holder.scheduler;
}

/** Start the loop and wire it to the bus. Safe to call more than once. */
export function startReminderScheduler(): ReminderScheduler {
  const scheduler = getReminderScheduler();
  if (!holder.unsubscribe) {
    const onChanged = () => scheduler.wake();
    reminderEvents.on("changed", onChanged);
    holder.unsubscribe = () => reminderEvents.off("changed", onChanged);
  }
  scheduler.start();
  return scheduler;
}

export async function stopReminderScheduler(): Promise<void> {
  holder.unsubscribe?.();
  holder.unsubscribe = undefined;
  await holder.scheduler?.stop();
}
