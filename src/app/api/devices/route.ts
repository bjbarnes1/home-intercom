import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import {
  generatePairingCode,
  generateDeviceSecret,
} from "@/lib/devices/pairing";
import { onlineAmong } from "@/lib/presence/store";

export const dynamic = "force-dynamic";

/** GET /api/devices — list devices with derived online state. */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const devices = await prisma.device.findMany({
      where: { householdId },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        room: true,
        type: true,
        pairing: true,
        doNotDisturb: true,
        // So the controller can show a parent which panels play clean only.
        musicCleanOnly: true,
        lastSeenAt: true,
      },
    });
    // lastSeenAt is kept in the response: it is the durable "last heard from
    // at all", which is how an admin spots a panel that has been dark for a
    // fortnight. `online` is the live signal and comes from the presence store.
    const online = await onlineAmong(devices.map((d) => d.id));
    return NextResponse.json({
      devices: devices.map((d) => ({
        ...d,
        online: online.has(d.id),
      })),
    });
  });
}

const CreateDevice = z.object({
  displayName: z.string().min(1).max(80),
  room: z.string().max(80).optional(),
  type: z.enum(["ENDPOINT", "CONTROLLER"]).default("ENDPOINT"),
});

/**
 * POST /api/devices — register a device in PENDING and issue a pairing code.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => null);
    const parsed = CreateDevice.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const device = await prisma.device.create({
      data: {
        householdId: admin.householdId,
        displayName: parsed.data.displayName,
        room: parsed.data.room,
        type: parsed.data.type,
        pairing: "PENDING",
        pairingCode: generatePairingCode(),
        deviceSecret: generateDeviceSecret(),
      },
      select: { id: true, displayName: true, pairingCode: true },
    });

    return NextResponse.json({ device }, { status: 201 });
  });
}
