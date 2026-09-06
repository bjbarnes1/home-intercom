import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { hangupIntercom } from "@/lib/intercom/hangup";

export const dynamic = "force-dynamic";

const Body = z.object({
  eventId: z.string().min(1),
  deviceIds: z.array(z.string()).default([]),
});

/** POST /api/page/hangup — controller ended the session; clear endpoints + room. */
export async function POST(req: Request) {
  return withAuth(async () => {
    await requireUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    await hangupIntercom(parsed.data);
    return NextResponse.json({ ok: true });
  });
}
