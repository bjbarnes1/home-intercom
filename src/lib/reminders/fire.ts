import { prisma } from "@/lib/prisma";
import { computeNextRun } from "@/lib/reminders/schedule";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets, type DeviceSnapshot } from "@/lib/zones/resolve";

/**
 * The scheduler core: fire every reminder that is due at `now`. Written as one
 * pure-ish function so it can run from a Vercel Cron route today or a
 * home-server interval later — identical behaviour either way.
 */

const PRESENCE_WINDOW_MS = 20_000;

export interface FireResult {
  due: number;
  fired: number;
  delivered: number;
  missed: number;
}

/** Snapshot of a household's devices + zone memberships, fetched once per tick. */
interface HouseholdSnapshot {
  devices: DeviceSnapshot[];
  zoneMembership: Record<string, string[]>;
}

async function loadHousehold(householdId: string, now: Date): Promise<HouseholdSnapshot> {
  const [devices, memberships] = await Promise.all([
    prisma.device.findMany({
      where: { householdId, pairing: "ACTIVE" },
      select: { id: true, lastSeenAt: true, doNotDisturb: true },
    }),
    prisma.zoneMembership.findMany({
      where: { zone: { householdId } },
      select: { zoneId: true, deviceId: true },
    }),
  ]);
  const zoneMembership: Record<string, string[]> = {};
  for (const m of memberships) (zoneMembership[m.zoneId] ??= []).push(m.deviceId);
  return {
    devices: devices.map((d) => ({
      id: d.id,
      online:
        d.lastSeenAt != null && now.getTime() - new Date(d.lastSeenAt).getTime() <= PRESENCE_WINDOW_MS,
      doNotDisturb: d.doNotDisturb,
    })),
    zoneMembership,
  };
}

export async function fireDueReminders(now: Date): Promise<FireResult> {
  const due = await prisma.reminder.findMany({
    where: { enabled: true, nextRunAt: { not: null, lte: now } },
  });

  const result: FireResult = { due: due.length, fired: 0, delivered: 0, missed: 0 };
  const snapshots = new Map<string, HouseholdSnapshot>();
  const sender = controlSender();

  for (const r of due) {
    // Advance the schedule and claim the fire atomically: only the request that
    // still sees this exact nextRunAt wins, so overlapping ticks can't double-fire.
    const next = computeNextRun(
      {
        kind: r.kind,
        enabled: r.enabled,
        cron: r.cron,
        runAt: r.runAt,
        timezone: r.timezone,
        snoozedUntil: null, // firing consumes any snooze
        lastRunAt: now,
      },
      now,
    );
    const claim = await prisma.reminder.updateMany({
      where: { id: r.id, nextRunAt: r.nextRunAt },
      data: { nextRunAt: next, lastRunAt: now, snoozedUntil: null },
    });
    if (claim.count !== 1) continue; // another tick already fired it
    result.fired++;

    // Resolve targets among this household's connected endpoints.
    let snap = snapshots.get(r.householdId);
    if (!snap) {
      snap = await loadHousehold(r.householdId, now);
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
          .catch((e) => console.error(`reminder ${r.id} -> ${deviceId} failed`, e)),
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
    .catch(() => {});
}
