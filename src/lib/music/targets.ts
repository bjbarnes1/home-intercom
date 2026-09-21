import { prisma } from "@/lib/prisma";
import { isOnline } from "@/lib/presence/snapshot";

/**
 * Where audio can actually come out in this house.
 *
 * A playback target is one of our own paired endpoints with a speaker, and
 * nothing else. Controllers are parents' phones running the app — they are
 * remote controls, not speakers, so they are never offered as somewhere to
 * play. Neither is anything that has not been seen recently: a panel that is
 * unplugged or asleep cannot make a sound, and listing it invites a tap that
 * does nothing.
 */

export interface PlaybackTarget {
  id: string;
  name: string;
  /** Room label when the device has one; the panel's own name otherwise. */
  where: string;
  online: boolean;
  /** True for the device asking — the one whose browser is playing. */
  isSelf: boolean;
}

export interface TargetGroup {
  id: string;
  name: string;
  /** Members that are online right now; a group of sleeping panels is not playable. */
  deviceIds: string[];
}

export interface PlaybackTargets {
  devices: PlaybackTarget[];
  groups: TargetGroup[];
}

/** What a device row needs to look like to be considered. */
export interface TargetRow {
  id: string;
  displayName: string;
  room: string | null;
  hasSpeaker: boolean;
  lastSeenAt: Date | null;
}

/**
 * Pure so the filtering rules can be tested without a database: only devices
 * with a speaker, only ones seen inside the presence window, nearest thing to a
 * stable order (room, then name) so the list does not reshuffle under a finger.
 */
export function toTargets(
  rows: TargetRow[],
  selfId: string | null,
  now: Date | number = Date.now(),
): PlaybackTarget[] {
  return rows
    .filter((d) => d.hasSpeaker)
    .map((d) => ({
      id: d.id,
      name: d.displayName,
      where: d.room ?? d.displayName,
      online: isOnline(d.lastSeenAt, now),
      isSelf: d.id === selfId,
    }))
    .filter((d) => d.online)
    .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.where.localeCompare(b.where)));
}

/** Drop groups with nothing online left in them, and narrow the rest to what is. */
export function toGroups(
  groups: { id: string; name: string; deviceIds: string[] }[],
  online: Set<string>,
): TargetGroup[] {
  return groups
    .map((g) => ({ ...g, deviceIds: g.deviceIds.filter((id) => online.has(id)) }))
    // One speaker is not a group, and zero is not a target.
    .filter((g) => g.deviceIds.length > 1)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadPlaybackTargets(
  householdId: string,
  selfId: string | null,
  now: Date | number = Date.now(),
): Promise<PlaybackTargets> {
  const [rows, zones] = await Promise.all([
    prisma.device.findMany({
      // ENDPOINT only: a CONTROLLER is somebody's phone, not a speaker in a room.
      where: { householdId, pairing: "ACTIVE", type: "ENDPOINT" },
      select: { id: true, displayName: true, room: true, hasSpeaker: true, lastSeenAt: true },
    }),
    prisma.zone.findMany({
      where: { householdId },
      select: { id: true, name: true, memberships: { select: { deviceId: true } } },
    }),
  ]);

  const devices = toTargets(rows, selfId, now);
  const online = new Set(devices.map((d) => d.id));

  return {
    devices,
    groups: toGroups(
      zones.map((z) => ({ id: z.id, name: z.name, deviceIds: z.memberships.map((m) => m.deviceId) })),
      online,
    ),
  };
}
