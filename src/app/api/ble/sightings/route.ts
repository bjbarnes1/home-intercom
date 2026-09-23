import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { applySightings } from "@/lib/ble/follow";
import { resolveSharing } from "@/lib/location/sharing";

export const dynamic = "force-dynamic";

const Body = z.object({
  sightings: z
    .array(
      z.object({
        beaconId: z.string().min(1).max(64),
        /** dBm. Anything outside this is not a radio reading. */
        rssi: z.number().min(-127).max(0),
        at: z.number().int().positive(),
      }),
    )
    .max(200),
});

/**
 * POST /api/ble/sightings — the beacons this phone can hear.
 *
 * Reported by the person's own phone rather than read by the panels: iOS can
 * monitor beacon regions in the background, which is the only arrangement where
 * "follow me" works with a phone in a pocket.
 *
 * The response says where they are and whether the music should follow. It does
 * not move it — that is the caller's to do with the handoff it already has, so
 * this route stays a statement of fact rather than an action at a distance.
 *
 * Gated on location sharing exactly like /api/location/ping.
 */
export async function POST(req: Request) {
  return withAuth(
    async () => {
      const user = await requireUser();
      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      // Which room someone is in is location, finer than anything the GPS path
      // stores, so it answers to the same switch. Not sharing: accept the
      // report so the phone does not retry, keep nothing, and drop any room
      // left over from before sharing was turned off.
      const share = await prisma.locationShare.findUnique({
        where: { userId: user.id },
        select: { mode: true, liveUntil: true },
      });
      const sharing = resolveSharing(share, new Date());
      if (!sharing.reporting) {
        await prisma.roomFix.deleteMany({ where: { userId: user.id } });
        return NextResponse.json({
          beaconId: null,
          label: null,
          moved: false,
          followTo: null,
          reporting: false,
        });
      }

      const result = await applySightings(user.id, user.householdId, parsed.data.sightings);
      return NextResponse.json(result);
    },
    { route: "/api/ble/sightings" },
  );
}
