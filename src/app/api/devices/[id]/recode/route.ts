import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { generatePairingCode, generateDeviceSecret } from "@/lib/devices/pairing";

export const dynamic = "force-dynamic";

/**
 * POST /api/devices/:id/recode — (re)issue a pairing code for a device.
 * Admin only. Sets the device PENDING, mints a fresh code, and rotates the
 * device secret so any previously-paired phone is revoked on the next claim.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const device = await prisma.device.findUnique({ where: { id } });
    if (!device || device.householdId !== admin.householdId) {
      return NextResponse.json({ error: "Unknown device" }, { status: 404 });
    }

    const updated = await prisma.device.update({
      where: { id },
      data: {
        pairing: "PENDING",
        pairingCode: generatePairingCode(),
        deviceSecret: generateDeviceSecret(),
        lastSeenAt: null,
      },
      select: { id: true, displayName: true, pairingCode: true },
    });

    return NextResponse.json({ device: updated });
  });
}
