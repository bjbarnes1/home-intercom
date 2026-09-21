import { prisma } from "@/lib/prisma";
import { resolveRoom, shouldFollow, type Sighting } from "@/lib/ble/room";

/**
 * Turning what a phone heard into where its owner is, and the music following.
 *
 * Only the answer is kept — one row per person saying which room and since
 * when. Every sighting would be a movement log of a family's own home, which is
 * not a thing worth storing in order to move some music.
 */

export interface FollowResult {
  /** The room they are in now, or null when nothing was audible. */
  beaconId: string | null;
  label: string | null;
  /** True when this call moved them. */
  moved: boolean;
  /** The panel the music should follow to, when there is one and they asked for it. */
  followTo: string | null;
}

export async function applySightings(
  userId: string,
  householdId: string,
  sightings: Sighting[],
  now: Date = new Date(),
): Promise<FollowResult> {
  // Only beacons this household has placed. A phone can hear anything; it does
  // not get to tell us about somebody else's house.
  const beacons = await prisma.roomBeacon.findMany({
    where: { householdId },
    select: { id: true, label: true, deviceId: true },
  });
  const known = new Map(beacons.map((b) => [b.id, b]));
  const mine = sightings.filter((s) => known.has(s.beaconId));

  const [fix, user] = await Promise.all([
    prisma.roomFix.findUnique({ where: { userId }, select: { beaconId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { followMeMusic: true } }),
  ]);

  const previous = fix?.beaconId ?? null;
  const next = resolveRoom(mine, previous, now.getTime());

  // Losing the signal is not a move, so it does not overwrite a good fix.
  if (next === null) {
    return { beaconId: previous, label: previous ? (known.get(previous)?.label ?? null) : null, moved: false, followTo: null };
  }

  const moved = shouldFollow(previous, next);
  if (moved) {
    await prisma.roomFix.upsert({
      where: { userId },
      create: { userId, beaconId: next, since: now },
      update: { beaconId: next, since: now },
    });
  }

  const beacon = known.get(next);
  return {
    beaconId: next,
    label: beacon?.label ?? null,
    moved,
    // Only a room with a panel in it can take the music.
    followTo: moved && user?.followMeMusic ? (beacon?.deviceId ?? null) : null,
  };
}
