import { NextResponse } from "next/server";
import { z } from "zod";
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

  // hangupIntercom scopes the lookup itself now, so this route no longer
  // pre-reads the event — it just passes the panel's household through.
  const ended = await hangupIntercom({
    eventId: parsed.data.eventId,
    householdId: device.householdId,
  });
  if (!ended) {
    return NextResponse.json({ error: "Unknown event" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
