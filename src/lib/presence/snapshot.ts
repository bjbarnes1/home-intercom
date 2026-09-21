import { prisma } from "@/lib/prisma";
import type { DeviceSnapshot } from "@/lib/zones/resolve";
import { onlineAmong, PRESENCE_WINDOW_MS } from "@/lib/presence/store";

export { PRESENCE_WINDOW_MS };

/**
 * Whether a stored timestamp still counts as live.
 *
 * Kept for the one thing it is still honest about: judging a Date someone
 * already holds. It is NOT how liveness is decided any more — Device.lastSeenAt
 * is now a durable "when did we last hear from this at all" column, refreshed
 * every few minutes rather than every ten seconds, so measuring it against a
 * twenty-second window would report every live panel as offline.
 *
 * Ask the presence store instead: onlineAmong(), or isDeviceOnline() for one.
 */
export function isOnline(
  lastSeenAt: Date | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs - new Date(lastSeenAt).getTime() <= PRESENCE_WINDOW_MS;
}

export interface HouseholdPresenceSnapshot {
  devices: DeviceSnapshot[];
  zoneMembership: Record<string, string[]>;
}

/**
 * Canonical household presence view for intercom, announce, reminders, and
 * zone/device listings. One place owns the online window + zone map so callers
 * cannot drift.
 *
 * Two sources, deliberately: Postgres for the roster — who the household's
 * devices are, and their Do-Not-Disturb — and Redis for which of them are
 * alive. The roster is config a household would be upset to lose; liveness is
 * worthless twenty seconds after it is written.
 *
 * Liveness is one round trip for the whole household, because the roster query
 * already tells us exactly which ids to ask about. The keyspace is never
 * scanned.
 */
export async function loadHouseholdSnapshot(
  householdId: string,
  now: Date | number = Date.now(),
): Promise<HouseholdPresenceSnapshot> {
  const [devices, memberships] = await Promise.all([
    prisma.device.findMany({
      where: { householdId, pairing: "ACTIVE" },
      select: { id: true, doNotDisturb: true },
    }),
    prisma.zoneMembership.findMany({
      where: { zone: { householdId } },
      select: { zoneId: true, deviceId: true },
    }),
  ]);

  const nowMs = typeof now === "number" ? now : now.getTime();
  const online = await onlineAmong(
    devices.map((d) => d.id),
    nowMs,
  );

  const zoneMembership: Record<string, string[]> = {};
  for (const m of memberships) {
    (zoneMembership[m.zoneId] ??= []).push(m.deviceId);
  }

  return {
    devices: devices.map((d) => ({
      id: d.id,
      online: online.has(d.id),
      doNotDisturb: d.doNotDisturb,
    })),
    zoneMembership,
  };
}
