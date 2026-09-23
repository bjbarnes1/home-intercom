import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";
import { controlSender } from "@/lib/livekit/control";

export const dynamic = "force-dynamic";

const Body = z.object({
  handoffId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  fromDeviceId: z.string().min(1).max(64),
  ok: z.boolean(),
  error: z.string().max(200).optional(),
});

/**
 * POST /api/music/handoff/ack — the panel that was handed the music says
 * whether it actually started.
 *
 * Relayed to the sending panel as a musicHandoffResult. That panel is the one
 * that has to act on it — go quiet, or keep playing and say why not — and it
 * is only listening on the control channel.
 *
 * Nothing is stored. The sender matches the answer to the id it chose, and
 * ignores one it is not waiting for. A panel in this household could send a
 * false "ok" to make another pause, but it can already pause any panel here
 * with /api/music/control, so this grants nothing new.
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
      const { handoffId, fromDeviceId, ok, error } = parsed.data;

      const source = await prisma.device.findFirst({
        // Same household only: a device id is not a capability.
        where: { id: fromDeviceId, householdId: me.householdId },
        select: { id: true, pairing: true },
      });
      if (!source || source.pairing !== "ACTIVE") {
        return NextResponse.json({ error: "No such panel" }, { status: 404 });
      }

      await controlSender().send(me.householdId, [source.id], {
        type: "musicHandoffResult",
        handoffId,
        ok,
        ...(error ? { error } : {}),
        to: me.room ?? me.displayName,
      });

      return NextResponse.json({ ok: true });
    },
    { route: "/api/music/handoff/ack" },
  );
}
