import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";
import { controlSender } from "@/lib/livekit/control";
import { isDeviceOnline } from "@/lib/presence/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  toDeviceId: z.string().min(1).max(64),
  trackIds: z.array(z.string().max(64)).min(1).max(100),
  startIndex: z.number().int().min(0),
  startTime: z.number().min(0),
});

/**
 * POST /api/music/handoff — move what is playing to another panel.
 *
 * Apple Music streams to one device per subscription, so this is a handoff
 * rather than a second speaker: the caller stops once the target has been told.
 *
 * Refused rather than silently dropped when the target cannot actually take it:
 * a panel in another household, one that is asleep, one with no speaker, or one
 * where nobody has linked an Apple Music account. A tap that appears to work
 * and then does nothing is worse than a refusal that says which of those it was.
 */
export async function POST(req: Request) {
  return withRoute(
    async () => {
      const from = await deviceFromRequest(req);
      if (!from || from.pairing !== "ACTIVE") {
        return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
      }

      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { toDeviceId, trackIds, startIndex, startTime } = parsed.data;

      if (toDeviceId === from.id) {
        return NextResponse.json({ error: "Already playing here" }, { status: 400 });
      }
      if (startIndex >= trackIds.length) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const target = await prisma.device.findFirst({
        // Scoped to the caller's household: a device id is not a capability.
        where: { id: toDeviceId, householdId: from.householdId },
        select: {
          id: true,
          displayName: true,
          room: true,
          pairing: true,
          hasSpeaker: true,
          lastSeenAt: true,
          musicLinkedAt: true,
        },
      });

      if (!target || target.pairing !== "ACTIVE") {
        return NextResponse.json({ error: "No such panel" }, { status: 404 });
      }
      if (!target.hasSpeaker) {
        return NextResponse.json({ error: "That panel has no speaker" }, { status: 409 });
      }
      if (!(await isDeviceOnline(target.id))) {
        return NextResponse.json({ error: "That panel is asleep" }, { status: 409 });
      }
      if (!target.musicLinkedAt) {
        return NextResponse.json(
          { error: "No Apple Music account is linked on that panel" },
          { status: 409 },
        );
      }

      await controlSender().send(from.householdId, [target.id], {
        type: "musicHandoff",
        trackIds,
        startIndex,
        startTime,
        from: from.room ?? from.displayName,
      });

      return NextResponse.json({ ok: true, to: target.room ?? target.displayName });
    },
    { route: "/api/music/handoff" },
  );
}
