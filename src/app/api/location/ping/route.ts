import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { resolveSharing, allowsFullPrecision } from "@/lib/location/sharing";
import { coarsenCoordinate } from "@/lib/location/retention";
import { firePlaceRules } from "@/lib/location/rules";
import type { PlaceTrigger } from "@prisma/client";

/**
 * How close to an existing arrival a second `enter` has to be to count as iOS
 * re-reporting the same crossing rather than a new one after a missed exit.
 */
const RE_REPORT_WINDOW_MS = 5 * 60 * 1000;

export const dynamic = "force-dynamic";

const PlaceEvent = z.object({
  placeId: z.string().min(1),
  type: z.enum(["enter", "exit"]),
  at: z.string().datetime(),
});

const Ping = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  batteryPct: z.number().int().min(0).max(100).optional(),
  source: z.enum(["significant", "region", "manual"]).default("significant"),
  capturedAt: z.string().datetime(),
  /**
   * Geofence crossings the phone computed itself. Core Location does this work
   * for free, which is why the server never needs a stream of raw fixes to know
   * someone got home.
   */
  events: z.array(PlaceEvent).max(20).default([]),
});

/**
 * POST /api/location/ping — a phone reports where it is.
 *
 * Sharing is enforced here, not on the phone. A client that keeps reporting
 * after someone turned sharing off is ignored, and a fix that arrives outside a
 * running LIVE share is stored coarse — the phone doesn't get to decide how
 * precisely it is recorded.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = Ping.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const now = new Date();

    const share = await prisma.locationShare.findUnique({
      where: { userId: user.id },
      select: { mode: true, liveUntil: true },
    });
    const sharing = resolveSharing(share, now);

    // Not sharing: accept the request so the phone doesn't retry forever, but
    // store nothing and tell it to stop.
    if (!sharing.reporting) {
      return NextResponse.json({ stored: false, sharing: sharing.mode, reporting: false });
    }

    const full = allowsFullPrecision(sharing);
    const capturedAt = new Date(body.capturedAt);

    await prisma.locationPing.create({
      data: {
        userId: user.id,
        lat: full ? body.lat : coarsenCoordinate(body.lat),
        lng: full ? body.lng : coarsenCoordinate(body.lng),
        accuracyM: full ? body.accuracyM : null,
        batteryPct: body.batteryPct,
        source: body.source,
        coarse: !full,
        capturedAt,
      },
    });

    // Only geofences this household owns — a phone can't invent a place id.
    const places = await prisma.place.findMany({
      where: {
        id: { in: body.events.map((e) => e.placeId) },
        householdId: user.householdId,
      },
      select: { id: true },
    });
    const known = new Set(places.map((p) => p.id));

    let arrivals = 0;
    let departures = 0;
    /// Crossings that actually changed state, so a duplicate enter doesn't
    /// announce twice.
    const crossings: Array<{ placeId: string; trigger: PlaceTrigger }> = [];

    for (const event of body.events) {
      if (!known.has(event.placeId)) continue;
      const at = new Date(event.at);

      if (event.type === "enter") {
        /*
         * An enter used to be dropped whenever ANY visit for this (user, place)
         * was still open, with no age bound and nothing else ever closing one.
         * Force-quit the app at school — iOS stops delivering region events to
         * a user-terminated app, so the exit never arrives — and that visit
         * stays open forever, silently swallowing every subsequent morning's
         * arrival while the route still answered {stored:true, arrivals:0}.
         *
         * An enter is iOS saying a boundary was crossed inward, so the person
         * was outside: an open visit means the exit was missed, not that they
         * never left. The one real exception is a re-report of the same
         * arrival, which lands within a few minutes of it.
         */
        await prisma.placeVisit.updateMany({
          where: { userId: user.id, placeId: { not: event.placeId }, leftAt: null },
          data: { leftAt: at },
        });

        const open = await prisma.placeVisit.findFirst({
          where: { userId: user.id, placeId: event.placeId, leftAt: null },
          select: { id: true, arrivedAt: true },
          orderBy: { arrivedAt: "desc" },
        });

        const isReReport =
          open != null &&
          Math.abs(at.getTime() - open.arrivedAt.getTime()) <= RE_REPORT_WINDOW_MS;

        if (!isReReport) {
          if (open) {
            // The exit we never saw. `at` is the only defensible timestamp for
            // it — bounded, because we now know they were outside just before.
            await prisma.placeVisit.update({
              where: { id: open.id },
              data: { leftAt: at },
            });
          }
          await prisma.placeVisit.create({
            data: { userId: user.id, placeId: event.placeId, arrivedAt: at },
          });
          arrivals += 1;
          crossings.push({ placeId: event.placeId, trigger: "ARRIVE" });
        }
      } else {
        const { count } = await prisma.placeVisit.updateMany({
          where: { userId: user.id, placeId: event.placeId, leftAt: null },
          data: { leftAt: at },
        });
        departures += count;
        if (count > 0) {
          crossings.push({ placeId: event.placeId, trigger: "DEPART" });
        }
      }
    }

    // "When Willoughby arrives Home, say Willoughby's home in the Kitchen."
    // Never throws — an announcement that fails must not fail the report that
    // triggered it, because losing the ping would lose the arrival itself.
    const rules = await firePlaceRules(user.householdId, user.id, crossings, now);

    return NextResponse.json({
      stored: true,
      reporting: true,
      sharing: sharing.mode,
      precision: full ? "exact" : "coarse",
      arrivals,
      departures,
      announced: rules.fired.map((f) => f.text),
      skippedByCooldown: rules.skippedByCooldown,
    });
  }, { route: "/api/location/ping" });
}
