import { EventEmitter } from "node:events";
import { prisma } from "@/lib/prisma";
import { controlSender } from "@/lib/livekit/control";
import { reportError } from "@/lib/errors/report";
import type {
  ReminderStateCommand,
  RemindersChangedCommand,
} from "@/lib/control/commands";

/**
 * The reminders event bus: one place that tells the rest of the system
 * "something about reminders changed".
 *
 * Two audiences, two transports:
 *
 *  - **Panels** hear it over the LiveKit lobby, as control commands. State
 *    changes go to *every* active panel in the household, not only the ones a
 *    reminder targets, because the agenda on every panel lists the whole
 *    house's day and an alert cleared in the kitchen must clear everywhere.
 *  - **This process** hears it through `reminderEvents`. The in-process
 *    scheduler listens for `changed` so that a reminder created for two
 *    minutes from now wakes the timer instead of waiting out its poll.
 *
 * Broadcasting is best-effort by design. A panel that misses a message catches
 * up on its next agenda poll, so a LiveKit hiccup costs latency, never
 * correctness — and a failure here must never fail the write that caused it.
 */

export interface ReminderBusEvents {
  /** Anything that might move the next due time: create, edit, snooze. */
  changed: [{ householdId: string }];
}

export const reminderEvents = new EventEmitter<ReminderBusEvents>();
// A process may have several listeners (scheduler, SSE bridges later).
reminderEvents.setMaxListeners(50);

type HouseholdCommand = ReminderStateCommand | RemindersChangedCommand;

/** Send a command to every connected, active panel in a household. */
export async function notifyHousehold(
  householdId: string,
  command: HouseholdCommand,
): Promise<number> {
  try {
    const devices = await prisma.device.findMany({
      where: { householdId, pairing: "ACTIVE" },
      select: { id: true },
    });
    const sender = controlSender();
    const connected = await sender.connected(
      householdId,
      devices.map((d) => d.id),
    );
    if (connected.length > 0) await sender.send(householdId, connected, command);
    return connected.length;
  } catch (e) {
    reportError(e, {
      code: "reminders.bus.notify",
      route: "lib/reminders/bus",
      householdId,
      commandType: command.type,
    });
    return 0;
  }
}

/** A reminder was created, edited or deleted: panels refetch, timer re-arms. */
export function remindersChanged(
  householdId: string,
  reason: RemindersChangedCommand["reason"],
): Promise<number> {
  reminderEvents.emit("changed", { householdId });
  return notifyHousehold(householdId, { type: "remindersChanged", reason });
}
