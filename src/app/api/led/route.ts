import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets } from "@/lib/zones/resolve";
import { loadHouseholdSnapshot } from "@/lib/presence/snapshot";
import { reportError } from "@/lib/errors/report";
import type { LedCommand } from "@/lib/control/commands";

export const dynamic = "force-dynamic";

const LedBody = z
  .object({
    targetDeviceId: z.string().optional(),
    targetZoneId: z.string().optional(),
    front: z
      .object({
        mode: z.enum(["status", "night", "solid", "off", "pulse"]).optional(),
        color: z.string().max(40).optional(),
        brightness: z.number().min(0).max(100).optional(),
      })
      .optional(),
    rear: z
      .object({
        on: z.boolean().optional(),
        color: z.string().max(40).optional(),
        brightness: z.number().min(0).max(100).optional(),
      })
      .optional(),
  })
  .refine((v) => !!v.targetDeviceId !== !!v.targetZoneId, {
    message: "Provide exactly one of targetDeviceId or targetZoneId",
  })
  .refine((v) => v.front || v.rear, {
    message: "Provide front and/or rear LED fields",
  });

/**
 * POST /api/led — push an LED cue to endpoints that advertise hasLeds.
 * Software panels without LEDs ignore the command (no-op handler).
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = LedBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { targetDeviceId, targetZoneId, front, rear } = parsed.data;

    const { devices, zoneMembership } = await loadHouseholdSnapshot(user.householdId);
    const resolved = resolveTargets(
      { deviceId: targetDeviceId, zoneId: targetZoneId },
      devices,
      zoneMembership,
      { onlineOnly: true, respectDoNotDisturb: false },
    );

    const ledCapable = await prisma.device.findMany({
      where: {
        id: { in: resolved.targets },
        hasLeds: true,
        pairing: "ACTIVE",
      },
      select: { id: true },
    });
    const ids = ledCapable.map((d) => d.id);
    const sender = controlSender();
    const connected = await sender.connected(ids);

    const command: LedCommand = {
      type: "led",
      ...(front ? { front } : {}),
      ...(rear ? { rear } : {}),
    };

    await Promise.all(
      connected.map((deviceId) =>
        sender.send([deviceId], command).catch((e) =>
          reportError(e, {
            code: "led.send",
            route: "/api/led",
            deviceId,
          }),
        ),
      ),
    );

    return NextResponse.json({
      reached: connected,
      skippedNoLeds: resolved.targets.filter(
        (id) => !ids.includes(id),
      ),
      offline: resolved.offline,
    });
  }, { route: "/api/led" });
}
