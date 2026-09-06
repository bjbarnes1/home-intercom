import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * GET /api/endpoint/reminders — reminders this endpoint should speak, i.e.
 * those targeting the device directly or any zone it belongs to. Authenticated
 * by device secret (the panel is not a signed-in user).
 */
export async function GET(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  const memberships = await prisma.zoneMembership.findMany({
    where: { deviceId: device.id },
    select: { zoneId: true },
  });
  const zoneIds = memberships.map((m) => m.zoneId);

  const reminders = await prisma.reminder.findMany({
    where: {
      householdId: device.householdId,
      enabled: true,
      OR: [
        { targetDeviceId: device.id },
        zoneIds.length ? { targetZoneId: { in: zoneIds } } : { targetZoneId: "" },
      ],
    },
    orderBy: [{ nextRunAt: "asc" }],
    select: {
      id: true,
      text: true,
      sound: true,
      cron: true,
      runAt: true,
      nextRunAt: true,
    },
  });

  return NextResponse.json({ reminders });
}
