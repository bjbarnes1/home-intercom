import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";
import { controlSender } from "@/lib/livekit/control";
import { isOnline } from "@/lib/presence/snapshot";

export const dynamic = "force-dynamic";

const Body = z.object({ fromDeviceId: z.string().min(1).max(64) });

/**
 * POST /api/music/fetch — bring what another panel is playing to this one.
 *
 * The mirror of a handoff, and deliberately not a different mechanism: the
 * panel holding the queue is the only one that has the tracks, the position and
 * the account, so this asks it to hand over rather than reaching into its
 * player. It then runs exactly the same path as tapping a room from that end.
 *
 * Which means the answer here is only "the request was delivered". Whether the
 * music arrives is the handoff's business, and the asking panel finds out the
 * way it would anyway — by the music starting.
 */
export async function POST(req: Request) {
  return withRoute(
    async () => {
      const me = await deviceFromRequest(req);
      if (!me || me.pairing !== "ACTIVE") {
        return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
      }

      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { fromDeviceId } = parsed.data;

      if (fromDeviceId === me.id) {
        return NextResponse.json({ error: "It is already playing here" }, { status: 400 });
      }

      const source = await prisma.device.findFirst({
        // Same household only: a device id is not a capability.
        where: { id: fromDeviceId, householdId: me.householdId },
        select: {
          id: true,
          displayName: true,
          room: true,
          pairing: true,
          lastSeenAt: true,
          nowPlayingTitle: true,
        },
      });

      if (!source || source.pairing !== "ACTIVE") {
        return NextResponse.json({ error: "No such panel" }, { status: 404 });
      }
      if (!isOnline(source.lastSeenAt)) {
        return NextResponse.json({ error: "That panel is asleep" }, { status: 409 });
      }
      if (!me.hasSpeaker) {
        return NextResponse.json({ error: "This panel has no speaker" }, { status: 409 });
      }
      if (!me.musicLinkedAt) {
        return NextResponse.json(
          { error: "Sign in to Apple Music on this panel first" },
          { status: 409 },
        );
      }

      await controlSender().send([source.id], {
        type: "musicFetch",
        toDeviceId: me.id,
        from: me.room ?? me.displayName,
      });

      return NextResponse.json({ ok: true, from: source.room ?? source.displayName });
    },
    { route: "/api/music/fetch" },
  );
}
