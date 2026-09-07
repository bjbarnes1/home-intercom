import { prisma } from "@/lib/prisma";
import { computeNextRun } from "@/lib/reminders/schedule";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets } from "@/lib/zones/resolve";
import {
  loadHouseholdSnapshot,
  type HouseholdPresenceSnapshot,
} from "@/lib/presence/snapshot";
import { reportError } from "@/lib/errors/report";

/**
 * Fire every reminder due at `now`. Same core for Vercel Cron or a home interval.
 */

export interface FireResult {
  due: number;
  fired: number;
  delivered: number;
  missed: number;
}

export async function fireDueReminders(now: Date): Promise<FireResult> {
  const due = await prisma.reminder.findMany({
    where: { enabled: true, nextRunAt: { not: null, lte: now } },
  });

  const result: FireResult = { due: due.length, fired: 0, delivered: 0, missed: 0 };
  const snapshots = new Map<string, HouseholdPresenceSnapshot>();
  const sender = controlSender();

  for (const r of due) {
    const next = computeNextRun(
      {
        kind: r.kind,
        enabled: r.enabled,
        cron: r.cron,
        runAt: r.runAt,
        timezone: r.timezone,
        snoozedUntil: null,
        lastRunAt: now,
      },
      now,
    );
    const claim = await prisma.reminder.updateMany({
      where: { id: r.id, nextRunAt: r.nextRunAt },
      data: { nextRunAt: next, lastRunAt: now, snoozedUntil: null },
    });
    if (claim.count !== 1) continue;
    result.fired++;

    let snap = snapshots.get(r.householdId);
    if (!snap) {
      snap = await loadHouseholdSnapshot(r.householdId, now);
      snapshots.set(r.householdId, snap);
    }
    const resolved = resolveTargets(
      { deviceId: r.targetDeviceId ?? undefined, zoneId: r.targetZoneId ?? undefined },
      snap.devices,
      snap.zoneMembership,
      { onlineOnly: true },
    );
    const connected = await sender.connected(resolved.targets);

    if (connected.length === 0) {
      result.missed++;
      await logEvent(r, "MISSED", now);
      continue;
    }

    await Promise.all(
      connected.map((deviceId) =>
        sender
          .send([deviceId], {
            type: "reminder",
            text: r.text,
            sound: r.sound ?? undefined,
            reminderId: r.id,
          })
          .catch((e) =>
            reportError(e, {
              code: "reminder.send",
              route: "fireDueReminders",
              reminderId: r.id,
              deviceId,
            }),
          ),
      ),
    );
    result.delivered++;
    await logEvent(r, "DELIVERED", now);
  }

  return result;
}

async function logEvent(
  r: { householdId: string; targetDeviceId: string | null; targetZoneId: string | null },
  outcome: "DELIVERED" | "MISSED",
  at: Date,
) {
  await prisma.intercomEvent
    .create({
      data: {
        householdId: r.householdId,
        type: "REMINDER",
        outcome,
        targetDeviceId: r.targetDeviceId,
        targetZoneId: r.targetZoneId,
        startedAt: at,
      },
    })
    .catch((e) =>
      reportError(e, {
        code: "reminder.log_event",
        route: "fireDueReminders",
        outcome,
      }),
    );
}
