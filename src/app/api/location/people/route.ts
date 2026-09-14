import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { resolveSharing } from "@/lib/location/sharing";
import { placeContaining, type PlaceCircle } from "@/lib/location/places";

export const dynamic = "force-dynamic";

/**
 * GET /api/location/people — the map.
 *
 * Every household member sees every household member, children included. That
 * symmetry is the design: a map only some people can see is surveillance, and
 * one everybody can see is coordination. Someone not sharing appears in the
 * list with no position, rather than vanishing — "Raff isn't sharing" is more
 * useful than a silent gap.
 */
export async function GET() {
  return withAuth(async () => {
    const viewer = await requireUser();
    const now = new Date();

    const [users, places] = await Promise.all([
      prisma.user.findMany({
        where: { householdId: viewer.householdId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          locationShare: { select: { mode: true, liveUntil: true } },
          locationPings: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: {
              lat: true,
              lng: true,
              accuracyM: true,
              batteryPct: true,
              coarse: true,
              capturedAt: true,
            },
          },
          placeVisits: {
            where: { leftAt: null },
            orderBy: { arrivedAt: "desc" },
            take: 1,
            select: { arrivedAt: true, place: { select: { id: true, name: true, icon: true } } },
          },
        },
      }),
      prisma.place.findMany({
        where: { householdId: viewer.householdId },
        select: { id: true, name: true, lat: true, lng: true, radiusM: true, icon: true },
      }),
    ]);

    const circles: PlaceCircle[] = places;

    return NextResponse.json({
      people: users.map((user) => {
        const sharing = resolveSharing(user.locationShare, now);
        const fix = user.locationPings[0] ?? null;
        const openVisit = user.placeVisits[0] ?? null;

        // Prefer the phone's own geofence event; fall back to geometry so
        // someone who installed the app while already at home still reads as
        // "Home" rather than a bare dot on a map.
        const derived = fix ? placeContaining(fix, circles) : null;
        const at = openVisit
          ? { id: openVisit.place.id, name: openVisit.place.name, icon: openVisit.place.icon, since: openVisit.arrivedAt }
          : derived
            ? { id: derived.id, name: derived.name, icon: null, since: null }
            : null;

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          sharing: sharing.mode,
          reporting: sharing.reporting,
          liveUntil: sharing.liveUntil,
          lastFix: fix && sharing.reporting
            ? {
                lat: fix.lat,
                lng: fix.lng,
                accuracyM: fix.accuracyM,
                batteryPct: fix.batteryPct,
                coarse: fix.coarse,
                capturedAt: fix.capturedAt,
              }
            : null,
          at,
        };
      }),
      places,
      /** So the UI can be honest about how long any of this is kept. */
      viewerId: viewer.id,
    });
  }, { route: "/api/location/people" });
}
