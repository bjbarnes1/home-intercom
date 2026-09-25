/**
 * Next.js server start hook: the place a long-running process starts its
 * background services.
 *
 * Only the reminder scheduler lives here, and only when asked for
 * (`REMINDER_SCHEDULER=inprocess`), on the Node runtime. See
 * src/lib/reminders/host.ts for why it is opt-in.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { inProcessSchedulerEnabled, startReminderScheduler, stopReminderScheduler } = await import(
    "@/lib/reminders/host"
  );
  if (!inProcessSchedulerEnabled()) return;

  startReminderScheduler();
  console.info("[reminders] in-process scheduler started");

  // Graceful shutdown: let the pass in flight finish rather than cutting a
  // delivery off halfway through its sends.
  const shutdown = () => {
    void stopReminderScheduler().finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
