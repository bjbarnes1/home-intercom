import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isWellFormedPairingCode } from "@/lib/devices/pairing";

export const dynamic = "force-dynamic";

const Claim = z.object({ code: z.string() });

/**
 * POST /api/devices/claim — an endpoint submits its pairing code and receives
 * its long-lived device secret + id. The code is cleared and the device becomes
 * ACTIVE. The secret is returned exactly once here.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Claim.safeParse(body);
  if (!parsed.success || !isWellFormedPairingCode(parsed.data.code)) {
    return NextResponse.json({ error: "Invalid pairing code" }, { status: 400 });
  }

  const code = parsed.data.code.toUpperCase().replace(/\s+/g, "");
  const device = await prisma.device.findUnique({ where: { pairingCode: code } });
  if (!device || device.pairing === "REVOKED") {
    return NextResponse.json({ error: "Unknown or revoked code" }, { status: 404 });
  }

  const updated = await prisma.device.update({
    where: { id: device.id },
    data: { pairing: "ACTIVE", pairingCode: null, lastSeenAt: new Date() },
    select: { id: true, displayName: true, room: true, deviceSecret: true },
  });

  return NextResponse.json({
    device: {
      id: updated.id,
      displayName: updated.displayName,
      room: updated.room,
      deviceSecret: updated.deviceSecret,
    },
  });
}
