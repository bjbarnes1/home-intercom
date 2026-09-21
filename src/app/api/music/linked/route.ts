import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  linked: z.boolean(),
  /**
   * What this panel is playing, so the other panels can say so. Null when
   * nothing is. Trimmed hard: a line on a screen, not a listening history.
   */
  nowPlaying: z
    .object({
      title: z.string().max(200),
      artist: z.string().max(200),
    })
    .nullish(),
});

/**
 * POST /api/music/linked — this panel can (or can no longer) play music, and
 * what it is playing right now.
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

      const { linked, nowPlaying } = parsed.data;
      await prisma.device.update({
        where: { id: device.id },
        data: {
          musicLinkedAt: linked ? new Date() : null,
          nowPlayingTitle: nowPlaying?.title ?? null,
          nowPlayingArtist: nowPlaying?.artist ?? null,
          // Timestamped so a panel that stops reporting goes quiet here too,
          // rather than leaving a song on screen for ever.
          nowPlayingAt: nowPlaying ? new Date() : null,
        },
      });

      return NextResponse.json({ ok: true });
    },
    { route: "/api/music/linked" },
  );
}
