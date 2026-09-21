import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { onlineAmong } from "@/lib/presence/store";

export const dynamic = "force-dynamic";

/** GET /api/zones — zones with member devices and online counts. */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const zones = await prisma.zone.findMany({
      where: { householdId },
      orderBy: { name: "asc" },
      include: {
        memberships: {
          include: {
            device: {
              select: { id: true, displayName: true, room: true },
            },
          },
        },
      },
    });

    // One liveness round trip for every device across every zone, rather than
    // one per device — the ids are already in hand.
    const online = await onlineAmong(
      zones.flatMap((z) => z.memberships.map((m) => m.device.id)),
    );
    return NextResponse.json({
      zones: zones.map((z) => {
        const devices = z.memberships.map((m) => ({
          id: m.device.id,
          displayName: m.device.displayName,
          room: m.device.room,
          online: online.has(m.device.id),
        }));
        return {
          id: z.id,
          name: z.name,
          deviceCount: devices.length,
          onlineCount: devices.filter((d) => d.online).length,
          devices,
        };
      }),
    });
  });
}
