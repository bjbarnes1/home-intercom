/**
 * The reminder state machine. Pure: no DB, no clock.
 *
 *            fire            snooze            (snooze ends) re-fire
 *  (slot) ───────▶ PENDING ─────────▶ SNOOZED ─────────────────────┐
 *                    │  ▲                 │                         │
 *                    │  └─────────────────┼─────────────────────────┘
 *        complete /  │                    │ complete / dismiss
 *        dismiss     ▼                    ▼
 *               COMPLETED / DISMISSED   (terminal)
 *
 * Terminal states are sticky, but repeating the same terminal action is a
 * no-op rather than an error: two panels tapping Complete on the same alert
 * within a second is normal in a family kitchen and must not show anyone an
 * error.
 */

export type ReminderStatus = "PENDING" | "SNOOZED" | "COMPLETED" | "DISMISSED";
export type OccurrenceAction = "complete" | "dismiss" | "snooze";

export const TERMINAL: ReadonlySet<ReminderStatus> = new Set(["COMPLETED", "DISMISSED"]);

export type TransitionResult =
  | { ok: true; to: ReminderStatus; noop: boolean }
  | { ok: false; reason: string };

const TARGET: Record<OccurrenceAction, ReminderStatus> = {
  complete: "COMPLETED",
  dismiss: "DISMISSED",
  snooze: "SNOOZED",
};

export function transition(from: ReminderStatus, action: OccurrenceAction): TransitionResult {
  const to = TARGET[action];
  if (TERMINAL.has(from)) {
    if (from === to) return { ok: true, to, noop: true };
    return {
      ok: false,
      reason: from === "COMPLETED" ? "Already done" : "Already dismissed",
    };
  }
  // PENDING or SNOOZED: every action is allowed. Snoozing a snoozed occurrence
  // moves the snooze, which is what "snooze again" means.
  return { ok: true, to, noop: false };
}

/** The statuses an action may start from — the optimistic-lock `where`. */
export function allowedFrom(action: OccurrenceAction): ReminderStatus[] {
  void action;
  return ["PENDING", "SNOOZED"];
}

/**
 * What the parent Reminder's status should read after an occurrence changes.
 * A one-off *is* its occurrence. A recurring series stays PENDING while it is
 * live: completing tonight's bins does not complete the bins.
 */
export function seriesStatusAfter(
  kind: "ONE_OFF" | "RECURRING",
  occurrenceStatus: ReminderStatus,
): ReminderStatus {
  if (kind === "ONE_OFF") return occurrenceStatus;
  return occurrenceStatus === "SNOOZED" ? "SNOOZED" : "PENDING";
}
