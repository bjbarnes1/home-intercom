import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  isWellFormedPairingCode,
  isPairingCodeExpired,
} from "@/lib/devices/pairing";

export const dynamic = "force-dynamic";

const Claim = z.object({ code: z.string() });

/**
 * POST /api/devices/claim — endpoint submits pairing code and receives secret.
 * Codes expire 15 minutes after issue (device.updatedAt while PENDING).
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

  if (
    device.pairing === "PENDING" &&
    isPairingCodeExpired(device.updatedAt, new Date())
  ) {
    return NextResponse.json(
      { error: "Code expired — ask a parent to issue a new one" },
      { status: 410 },
    );
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
