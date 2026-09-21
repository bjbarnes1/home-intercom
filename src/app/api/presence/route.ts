import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { mintToken } from "@/lib/livekit/token";
import { lobbyRoom } from "@/lib/livekit/rooms";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/presence — endpoint heartbeat. Authenticated by device secret.
 * Bumps lastSeenAt and returns a fresh lobby token so the endpoint can (re)join
 * the control channel, along with the settings and the room name this panel
 * should be showing. Called on boot and periodically.
 */
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  const lobbyToken = await mintToken({
    identity: device.id,
    name: device.displayName,
    room: lobbyRoom(device.householdId),
    role: "lobby",
    ttlSeconds: 60 * 60, // an hour; refreshed each heartbeat
  });

  const row = await prisma.device.findUniqueOrThrow({
    where: { id: device.id },
    select: {
      displayName: true,
      room: true,
      doNotDisturb: true,
      autoAnswer: true,
      chimeEnabled: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      hasLeds: true,
      announceDwellSec: true,
    },
  });

  return NextResponse.json({
    lobbyToken,
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
    mock: env.mockLocalServices,
  });
}
