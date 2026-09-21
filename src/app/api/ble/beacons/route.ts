import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/ble/beacons — the room beacons this household has placed.
 *
 * A phone needs all of them before it can tell one room from another, and it
 * needs the UUID in particular: iOS monitors one region for the whole household
 * and tells the rooms apart by major/minor once inside it. Monitoring a region
 * per room would work too, but iOS allows twenty regions per app in total and
 * the household's places are already spending that budget.
 */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const beacons = await prisma.roomBeacon.findMany({
      where: { householdId },
      orderBy: { label: "asc" },
      select: { id: true, label: true, uuid: true, major: true, minor: true, deviceId: true },
    });

    return NextResponse.json({
      beacons,
      // The household's own UUID, taken from what has been placed. One region
      // covers every room, so they must share it.
      uuid: beacons[0]?.uuid ?? null,
    });
  });
}

const CreateBeacon = z.object({
  label: z.string().min(1).max(80),
  // Apple writes these uppercase with dashes; stored as given so a phone can
  // compare without normalising.
  uuid: z.string().uuid(),
  major: z.number().int().min(0).max(65535),
  minor: z.number().int().min(0).max(65535),
  /** The panel in this room, so music can follow somebody into it. */
  deviceId: z.string().max(64).optional(),
});

/** POST /api/ble/beacons — place a beacon in a room. */
export async function POST(req: Request) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const parsed = CreateBeacon.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { label, uuid, major, minor, deviceId } = parsed.data;

    if (deviceId) {
      const owned = await prisma.device.findFirst({
        where: { id: deviceId, householdId: admin.householdId },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "No such panel" }, { status: 404 });
      }
    }

    // One UUID per household: the phone monitors a single region and tells
    // rooms apart inside it, so a second UUID would simply never be heard.
    const existing = await prisma.roomBeacon.findFirst({
      where: { householdId: admin.householdId },
      select: { uuid: true },
    });
    if (existing && existing.uuid.toLowerCase() !== uuid.toLowerCase()) {
      return NextResponse.json(
        { error: `This household's beacons use ${existing.uuid}. Set the new beacon to match.` },
        { status: 409 },
      );
    }

    const beacon = await prisma.roomBeacon.create({
      data: { householdId: admin.householdId, label, uuid, major, minor, deviceId },
      select: { id: true, label: true, uuid: true, major: true, minor: true, deviceId: true },
    });

    return NextResponse.json({ beacon }, { status: 201 });
  });
}
