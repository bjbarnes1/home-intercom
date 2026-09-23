import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { rememberSecret } from "@/lib/devices/cache";
import { withRoute } from "@/lib/http";
import { NOW_PLAYING_WINDOW_MS } from "@/lib/music/targets";

export const dynamic = "force-dynamic";

/**
 * How old nowPlayingAt may get before an unchanged report refreshes it. Half
 * the window other panels believe it for, so a song that is still playing
 * never flickers off their screens between two 30-second reports.
 */
const NOW_PLAYING_REFRESH_MS = NOW_PLAYING_WINDOW_MS / 2;

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
 *
 * Every panel with MusicKit calls this every 30 seconds for as long as it is
 * on, so it writes only when something changed: linked or not, the song, or a
 * nowPlayingAt about to go stale. An idle panel costs no writes, and the auth
 * cache is refreshed with the new row rather than dropped, so the next
 * heartbeat does not miss it and go to Postgres.
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
      const now = new Date();

      // Compared against the authenticated row, which may be the cached copy.
      // Every write below puts the new row back in the cache, so the copy
      // this compares against is never older than the last write.
      const linkChanged = (device.musicLinkedAt != null) !== linked;
      const songChanged =
        (nowPlaying?.title ?? null) !== device.nowPlayingTitle ||
        (nowPlaying?.artist ?? null) !== device.nowPlayingArtist ||
        (nowPlaying != null) !== (device.nowPlayingAt != null);
      const songAging =
        nowPlaying != null &&
        (device.nowPlayingAt == null ||
          now.getTime() - device.nowPlayingAt.getTime() > NOW_PLAYING_REFRESH_MS);

      if (!linkChanged && !songChanged && !songAging) {
        return NextResponse.json({ ok: true });
      }

      const updated = await prisma.device.update({
        where: { id: device.id },
        data: {
          // Only whether it is set is ever read, so it is stamped when linking
          // and left alone while it stays linked.
          ...(linkChanged ? { musicLinkedAt: linked ? now : null } : {}),
          nowPlayingTitle: nowPlaying?.title ?? null,
          nowPlayingArtist: nowPlaying?.artist ?? null,
          // Timestamped so a panel that stops reporting goes quiet here too,
          // rather than leaving a song on screen for ever.
          nowPlayingAt: nowPlaying ? now : null,
        },
      });

      // musicLinkedAt is read off the authenticated device in /api/music/fetch,
      // so linking or unlinking has to reach the cache immediately rather than
      // waiting out its TTL. Writing the fresh row does that without the miss
      // a delete would cause on the next heartbeat.
      await rememberSecret(device.deviceSecret, updated);

      return NextResponse.json({ ok: true });
    },
    { route: "/api/music/linked" },
  );
}
