import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { mintToken } from "@/lib/livekit/token";
import { LOBBY_ROOM } from "@/lib/livekit/rooms";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/presence — endpoint heartbeat. Authenticated by device secret.
 * Bumps lastSeenAt and returns a fresh lobby token so the endpoint can (re)join
 * the control channel. Called on boot and periodically.
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
    room: LOBBY_ROOM,
    role: "lobby",
    ttlSeconds: 60 * 60, // an hour; refreshed each heartbeat
  });

  const row = await prisma.device.findUniqueOrThrow({
    where: { id: device.id },
    select: {
      doNotDisturb: true,
      autoAnswer: true,
      chimeEnabled: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      hasLeds: true,
    },
  });

  return NextResponse.json({
    lobbyToken,
    livekitUrl: env.livekit.publicUrl,
    doNotDisturb: row.doNotDisturb,
    autoAnswer: row.autoAnswer,
    chimeEnabled: row.chimeEnabled,
    quietHoursEnabled: row.quietHoursEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    hasLeds: row.hasLeds,
    mock: env.mockLocalServices,
  });
}
