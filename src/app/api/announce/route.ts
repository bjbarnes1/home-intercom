import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets, type DeviceSnapshot } from "@/lib/zones/resolve";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

const PRESENCE_WINDOW_MS = 20_000;

const Announce = z
  .object({
    text: z.string().min(1).max(500),
    from: z.string().max(40).optional(),
    targetDeviceId: z.string().optional(),
    targetZoneId: z.string().optional(),
  })
  .refine((v) => !!v.targetDeviceId !== !!v.targetZoneId, {
    message: "Provide exactly one of targetDeviceId or targetZoneId",
  });

/**
 * POST /api/announce — speak a one-way text announcement on the target
 * endpoints (async; no live room to wait for). Delivered to endpoints connected
 * to the control channel; offline/DND devices are reported as missed.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = Announce.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { text, from, targetDeviceId, targetZoneId } = parsed.data;

    const [devices, memberships] = await Promise.all([
      prisma.device.findMany({
        where: { householdId: user.householdId, pairing: "ACTIVE" },
        select: { id: true, lastSeenAt: true, doNotDisturb: true },
      }),
      prisma.zoneMembership.findMany({
        where: { zone: { householdId: user.householdId } },
        select: { zoneId: true, deviceId: true },
      }),
    ]);

    const now = Date.now();
    const snapshot: DeviceSnapshot[] = devices.map((d) => ({
      id: d.id,
      online:
        d.lastSeenAt != null && now - new Date(d.lastSeenAt).getTime() <= PRESENCE_WINDOW_MS,
      doNotDisturb: d.doNotDisturb,
    }));
    const zoneMembership: Record<string, string[]> = {};
    for (const m of memberships) (zoneMembership[m.zoneId] ??= []).push(m.deviceId);

    const resolved = resolveTargets(
      { deviceId: targetDeviceId, zoneId: targetZoneId },
      snapshot,
      zoneMembership,
      { onlineOnly: true },
    );

    const sender = controlSender();
    const reached = await sender.connected(resolved.targets);
    const announcementId = nanoid(12);

    await Promise.all(
      reached.map(async (deviceId) => {
        try {
          await sender.send([deviceId], {
            type: "announce",
            text,
            from: from ?? user.name,
            announcementId,
          });
        } catch (e) {
          console.error(`announce to ${deviceId} failed`, e);
        }
      }),
    );

    await prisma.intercomEvent.create({
      data: {
        householdId: user.householdId,
        type: "BROADCAST",
        outcome: reached.length > 0 ? "DELIVERED" : "MISSED",
        initiatorUserId: user.id,
        targetDeviceId,
        targetZoneId,
      },
    });

    return NextResponse.json({
      reached,
      notConnected: resolved.targets.filter((id) => !reached.includes(id)),
      suppressedByDnd: resolved.suppressedByDnd,
      offline: resolved.offline,
    });
  });
}
