import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { hangupIntercom } from "@/lib/intercom/hangup";

export const dynamic = "force-dynamic";

const Body = z.object({
  eventId: z.string().min(1),
});

/**
 * POST /api/endpoint/decline — wall panel declined an incoming ring.
 * Tears down the LiveKit room so the controller disconnects.
 */
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const event = await prisma.intercomEvent.findFirst({
    where: { id: parsed.data.eventId, householdId: device.householdId },
    select: { id: true, targetDeviceId: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Unknown event" }, { status: 404 });
  }

  await hangupIntercom({
    eventId: event.id,
    deviceIds: event.targetDeviceId ? [event.targetDeviceId] : [device.id],
  });

  return NextResponse.json({ ok: true });
}
