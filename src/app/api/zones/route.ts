import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

const PRESENCE_WINDOW_MS = 20_000;

/** GET /api/zones — zones with their member devices and online counts. */
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
              select: { id: true, displayName: true, room: true, lastSeenAt: true },
            },
          },
        },
      },
    });

    const now = Date.now();
    return NextResponse.json({
      zones: zones.map((z) => {
        const devices = z.memberships.map((m) => ({
          id: m.device.id,
          displayName: m.device.displayName,
          room: m.device.room,
          online:
            m.device.lastSeenAt != null &&
            now - new Date(m.device.lastSeenAt).getTime() <= PRESENCE_WINDOW_MS,
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
