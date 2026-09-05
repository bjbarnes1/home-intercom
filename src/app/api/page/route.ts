import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { initiateIntercom } from "@/lib/intercom/initiate";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const Initiate = z
  .object({
    kind: z.enum(["page", "call", "broadcast"]),
    initiatorIdentity: z.string().min(1),
    targetDeviceId: z.string().optional(),
    targetZoneId: z.string().optional(),
  })
  .refine((v) => !!v.targetDeviceId !== !!v.targetZoneId, {
    message: "Provide exactly one of targetDeviceId or targetZoneId",
  });

/**
 * POST /api/page — initiate a page / call / broadcast.
 * Returns the initiator's room + token so the controller can join and talk.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = Initiate.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await initiateIntercom({
      householdId: user.householdId,
      initiatorUserId: user.id,
      initiatorIdentity: parsed.data.initiatorIdentity,
      kind: parsed.data.kind,
      targetDeviceId: parsed.data.targetDeviceId,
      targetZoneId: parsed.data.targetZoneId,
    });

    return NextResponse.json({
      ...result,
      livekitUrl: env.livekit.publicUrl,
      mock: env.mockLocalServices,
    });
  });
}
