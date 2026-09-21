import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { hangupIntercom } from "@/lib/intercom/hangup";

export const dynamic = "force-dynamic";

// deviceIds used to be taken from the body. They come from the event now.
const Body = z.object({
  eventId: z.string().min(1),
});

/** POST /api/page/hangup — controller ended the session; clear endpoints + room. */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const ended = await hangupIntercom({
      eventId: parsed.data.eventId,
      householdId: user.householdId,
    });
    if (!ended) {
      return NextResponse.json({ error: "Unknown event" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  });
}
