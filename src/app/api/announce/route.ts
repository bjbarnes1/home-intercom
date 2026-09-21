import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { deliverAnnouncement } from "@/lib/announce/deliver";

export const dynamic = "force-dynamic";

const Announce = z
  .object({
    text: z.string().min(1).max(500),
    from: z.string().max(40).optional(),
    targetDeviceId: z.string().optional(),
    targetZoneId: z.string().optional(),
  })
  .refine((v) => !!v.targetDeviceId !== !!v.targetZoneId, {
    message: "Provide exactly one of targetDeviceId or targetZoneId",
  });

/**
 * POST /api/announce — say something aloud on a zone's speakers.
 * The work lives in `deliverAnnouncement` so geofence rules can announce
 * through the same path rather than re-implementing it.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = Announce.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { text, from, targetDeviceId, targetZoneId } = parsed.data;

    const outcome = await deliverAnnouncement({
      householdId: user.householdId,
      text,
      from: from ?? user.name,
      targetDeviceId,
      targetZoneId,
      initiatorUserId: user.id,
    });

    return NextResponse.json({
      reached: outcome.reached,
      notConnected: outcome.notConnected,
      suppressedByDnd: outcome.suppressedByDnd,
      offline: outcome.offline,
      voice: outcome.voice,
      voiceError: outcome.voiceError,
      audioUrl: outcome.audioUrl,
    });
  }, { route: "/api/announce" });
}
