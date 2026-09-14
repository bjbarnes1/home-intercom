import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { MAX_MONITORED_REGIONS } from "@/lib/location/places";

export const dynamic = "force-dynamic";

/**
 * GET /api/location/places — the geofences a phone should monitor.
 *
 * Readable by every household member, not just admins: the phone needs them to
 * register regions, and hiding the list from the people being geofenced would
 * be exactly the covert-tracking design we're avoiding.
 */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const places = await prisma.place.findMany({
      where: { householdId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, lat: true, lng: true, radiusM: true, icon: true },
    });

    return NextResponse.json({
      places,
      // iOS silently stops monitoring past its cap, so say it out loud rather
      // than letting geofences fail quietly on the phone.
      maxMonitored: MAX_MONITORED_REGIONS,
      overBudget: Math.max(0, places.length - MAX_MONITORED_REGIONS),
    });
  }, { route: "/api/location/places" });
}

const CreatePlace = z.object({
  name: z.string().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(50).max(10_000).default(150),
  icon: z.string().max(60).optional(),
});

/** POST /api/location/places — admin adds a geofence. */
export async function POST(req: Request) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const parsed = CreatePlace.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const place = await prisma.place.create({
      data: { householdId: admin.householdId, ...parsed.data },
      select: { id: true, name: true, lat: true, lng: true, radiusM: true, icon: true },
    });

    const total = await prisma.place.count({ where: { householdId: admin.householdId } });
    return NextResponse.json(
      {
        place,
        // Warn on the request that crosses the line, not later when a geofence
        // mysteriously never fires.
        warning:
          total > MAX_MONITORED_REGIONS
            ? `Over the ${MAX_MONITORED_REGIONS}-region iOS limit — ${total - MAX_MONITORED_REGIONS} place(s) will not be monitored.`
            : null,
      },
      { status: 201 },
    );
  }, { route: "/api/location/places" });
}
