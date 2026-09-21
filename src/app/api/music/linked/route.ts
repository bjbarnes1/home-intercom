import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ linked: z.boolean() });

/**
 * POST /api/music/linked — this panel can (or can no longer) play music.
 *
 * The listener's Apple Music token never leaves the device that earned it. All
 * this records is that one exists, which is the only thing other panels need in
 * order to know whether a handoff has anywhere to land.
 */
export async function POST(req: Request) {
  return withRoute(
    async () => {
      const device = await deviceFromRequest(req);
      if (!device || device.pairing !== "ACTIVE") {
        return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
      }

      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      await prisma.device.update({
        where: { id: device.id },
        data: { musicLinkedAt: parsed.data.linked ? new Date() : null },
      });

      return NextResponse.json({ ok: true });
    },
    { route: "/api/music/linked" },
  );
}
