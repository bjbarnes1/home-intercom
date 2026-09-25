import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";
import { createReminder } from "@/lib/reminders/service";
import { CreateReminderSchema } from "@/lib/reminders/types";
import { activeDevice, invalid, reminderErrorResponse, unauthorizedDevice } from "@/lib/reminders/http";

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

/**
 * POST /api/endpoint/reminders — save a reminder from a panel's Creation
 * Modal. Anyone standing at the Hub can add one for the house, the same as
 * writing on the fridge whiteboard. Where it rings defaults to the assignee's
 * own panel, else this one.
 */
export async function POST(req: Request) {
  return withRoute(async () => {
    const device = await activeDevice(req);
    if (!device) return unauthorizedDevice();
    const parsed = CreateReminderSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    try {
      const reminder = await createReminder(device.householdId, parsed.data, {
        deviceId: device.id,
        label: device.room ?? device.displayName,
      });
      return NextResponse.json({ reminder }, { status: 201 });
    } catch (e) {
      return reminderErrorResponse(e);
    }
  }, { route: "/api/endpoint/reminders" });
}
