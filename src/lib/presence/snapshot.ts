import { prisma } from "@/lib/prisma";
import type { DeviceSnapshot } from "@/lib/zones/resolve";

/** Heartbeat considered "online" within this window (matches presence interval). */
export const PRESENCE_WINDOW_MS = 20_000;

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
 */
export async function loadHouseholdSnapshot(
  householdId: string,
  now: Date | number = Date.now(),
): Promise<HouseholdPresenceSnapshot> {
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
  for (const m of memberships) {
    (zoneMembership[m.zoneId] ??= []).push(m.deviceId);
  }

  return {
    devices: devices.map((d) => ({
      id: d.id,
      online: isOnline(d.lastSeenAt, now),
      doNotDisturb: d.doNotDisturb,
    })),
    zoneMembership,
  };
}
