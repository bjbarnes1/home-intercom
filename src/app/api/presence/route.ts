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

  return NextResponse.json({
    lobbyToken,
    livekitUrl: env.livekit.publicUrl,
    doNotDisturb: device.doNotDisturb,
    autoAnswer: device.autoAnswer,
    mock: env.mockLocalServices,
  });
}
