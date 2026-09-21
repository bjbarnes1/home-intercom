import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";
import { controlSender } from "@/lib/livekit/control";
import { isDeviceOnline } from "@/lib/presence/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  deviceId: z.string().min(1).max(64),
  action: z.enum(["play", "pause", "next", "previous", "volume"]),
  value: z.number().min(0).max(1).optional(),
});

/**
 * POST /api/music/control — work another panel's player.
 *
 * Turning the music down in a room you are not in is the thing a shared house
 * actually needs: somebody is on a call, the kitchen is loud, and walking there
 * to fix it defeats the point of having panels everywhere.
 *
 * The panel holding the queue does the work, as with the handoff. This only
 * carries the instruction.
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
      const { deviceId, action, value } = parsed.data;

      if (action === "volume" && value === undefined) {
        return NextResponse.json({ error: "A volume needs a level" }, { status: 400 });
      }

      const target = await prisma.device.findFirst({
        // Same household only: a device id is not a capability.
        where: { id: deviceId, householdId: me.householdId },
        select: { id: true, displayName: true, room: true, pairing: true, lastSeenAt: true },
      });

      if (!target || target.pairing !== "ACTIVE") {
        return NextResponse.json({ error: "No such panel" }, { status: 404 });
      }
      if (!(await isDeviceOnline(target.id))) {
        return NextResponse.json({ error: "That panel is asleep" }, { status: 409 });
      }

      await controlSender().send(me.householdId, [target.id], {
        type: "musicControl",
        action,
        value,
      });
      return NextResponse.json({ ok: true });
    },
    { route: "/api/music/control" },
  );
}
