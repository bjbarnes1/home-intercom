import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { mintToken } from "@/lib/livekit/token";
import { lobbyRoom } from "@/lib/livekit/rooms";
import { env } from "@/lib/env";
import { reportError } from "@/lib/errors/report";
import { shouldPersistLastSeen, touch } from "@/lib/presence/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/presence — endpoint heartbeat. Authenticated by device secret.
 *
 * Records liveness, returns a fresh lobby token so the panel can (re)join the
 * control channel, and tells it the settings and room name it should be
 * showing. Called on boot and every ten seconds after.
 *
 * This is the hottest path in the product and it now costs, in the common
 * case, ZERO Postgres queries. It used to cost three: the auth lookup by
 * device secret, the lastSeenAt write, and a re-read for the settings. Two
 * panels at six beats a minute were enough that the gap between queries never
 * reached the database's minimum idle window, so a billed compute instance
 * could never suspend — 96% duty cycle, for a household of two screens.
 *
 * Now: the auth lookup reads through a cache that carries the settings with
 * it, liveness is a Redis key whose TTL is the presence window, and the
 * durable lastSeenAt column is refreshed every few minutes rather than every
 * ten seconds. Postgres is touched on a cache miss and on the writeback.
 */
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  await touch(device.id);

  /*
   * The durable column answers a different question from the Redis key: not
   * "is this alive now" but "when did we last hear from it at all", which is
   * how you find the panel that has been dark for a fortnight. Worth keeping,
   * not worth writing six times a minute.
   */
  if (await shouldPersistLastSeen(device.id)) {
    await prisma.device
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch((e) =>
        reportError(e, { code: "presence.writeback", route: "/api/presence" }),
      );
  }

  /*
   * mintToken now refuses to sign with the public dev credentials in
   * production. That is right — a token signed with a key the world knows is
   * worse than no token — but it must not take the whole heartbeat with it.
   * This response also carries the panel's room, settings and DND state, and a
   * panel that cannot do audio should still know what room it is and show a
   * clock rather than sitting on "Connection failed".
   *
   * So the failure is reported in the payload and the rest still arrives.
   */
  let lobbyToken: string | null = null;
  let livekitError: string | null = null;
  try {
    lobbyToken = await mintToken({
      identity: device.id,
      name: device.displayName,
      room: lobbyRoom(device.householdId),
      role: "lobby",
      ttlSeconds: 60 * 60, // an hour; refreshed each heartbeat
    });
  } catch (e) {
    livekitError = e instanceof Error ? e.message : "LiveKit is not configured";
    reportError(e, { code: "presence.mint_lobby_token", route: "/api/presence" });
  }

  // The authenticated row already carries the settings — it is the same
  // Device row the re-read used to fetch a second time.
  const row = device;

  return NextResponse.json({
    lobbyToken,
    /*
     * Which room that token is for. The panel needs it to notice when the room
     * NAME changes underneath a connection it is already holding — renaming
     * the lobby per household stranded every panel that was connected at the
     * time, because it only ever reconnects when its socket drops.
     */
    lobbyRoomName: lobbyRoom(device.householdId),
    livekitUrl: env.livekit.publicUrl,
    // The panel is told which room it is on every beat. It only learned this
    // at pairing before, so a reload left it calling itself something generic
    // — or, worse, whatever the last screen it rendered had hardcoded.
    room: row.room ?? row.displayName,
    doNotDisturb: row.doNotDisturb,
    autoAnswer: row.autoAnswer,
    chimeEnabled: row.chimeEnabled,
    quietHoursEnabled: row.quietHoursEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    hasLeds: row.hasLeds,
    announceDwellSec: row.announceDwellSec,
    // Parent-set, via /api/devices/:id/music. The panel reads it here and has
    // no route of its own to change it.
    musicCleanOnly: row.musicCleanOnly,
    mock: env.mockLocalServices,
    ...(livekitError ? { livekitError } : {}),
  });
}
