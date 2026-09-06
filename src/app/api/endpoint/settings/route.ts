import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

const Settings = z.object({
  doNotDisturb: z.boolean().optional(),
});

/**
 * PATCH /api/endpoint/settings — persist per-device etiquette from the wall panel.
 * Authenticated by device secret. Front-LED / quiet-hours / half-duplex land with
 * the hardware kiosk; DND is the durable setting today.
 */
export async function PATCH(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  const parsed = Settings.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      ...(parsed.data.doNotDisturb !== undefined
        ? { doNotDisturb: parsed.data.doNotDisturb }
        : {}),
    },
    select: { doNotDisturb: true, autoAnswer: true },
  });

  return NextResponse.json(updated);
}
