import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { resolveSharing } from "@/lib/location/sharing";
import {
  COARSEN_AFTER_HOURS,
  DELETE_AFTER_DAYS,
} from "@/lib/location/retention";

export const dynamic = "force-dynamic";

/** GET /api/location/sharing — my own sharing state, and what it means. */
export async function GET() {
  return withAuth(async () => {
    const user = await requireUser();
    const share = await prisma.locationShare.findUnique({
      where: { userId: user.id },
      select: { mode: true, liveUntil: true },
    });
    const sharing = resolveSharing(share, new Date());

    return NextResponse.json({
      ...sharing,
      // Surfaced so the app can state the retention promise on the same screen
      // where someone turns sharing on, rather than burying it in a policy.
      retention: {
        coarsenAfterHours: COARSEN_AFTER_HOURS,
        deleteAfterDays: DELETE_AFTER_DAYS,
      },
    });
  }, { route: "/api/location/sharing" });
}

const PatchSharing = z.object({
  mode: z.enum(["OFF", "PLACES", "LIVE"]),
  /** Minutes a LIVE share should run for. Ignored for the other modes. */
  liveMinutes: z.number().int().min(5).max(240).default(60),
});

/**
 * PATCH /api/location/sharing — change *my own* sharing.
 *
 * Deliberately self-only: there is no path here for a parent to switch on a
 * child's sharing remotely. Turning it on is something a person does on their
 * own phone, where iOS also asks them, and where they can see it is on.
 */
export async function PATCH(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = PatchSharing.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { mode, liveMinutes } = parsed.data;

    const liveUntil =
      mode === "LIVE" ? new Date(Date.now() + liveMinutes * 60 * 1000) : null;

    const share = await prisma.locationShare.upsert({
      where: { userId: user.id },
      create: { userId: user.id, mode, liveUntil },
      update: { mode, liveUntil },
      select: { mode: true, liveUntil: true },
    });

    // Turning sharing off deletes the history too. "Stop sharing" that leaves a
    // week of your movements on a server isn't stopping sharing.
    let cleared = 0;
    if (mode === "OFF") {
      const [pings] = await Promise.all([
        prisma.locationPing.deleteMany({ where: { userId: user.id } }),
        prisma.placeVisit.deleteMany({ where: { userId: user.id } }),
      ]);
      cleared = pings.count;
    }

    return NextResponse.json({
      ...resolveSharing(share, new Date()),
      clearedPings: cleared,
    });
  }, { route: "/api/location/sharing" });
}
