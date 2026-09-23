import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { forgetSecret } from "@/lib/devices/cache";

export const dynamic = "force-dynamic";

const MusicSettings = z.object({
  musicCleanOnly: z.boolean(),
});

/**
 * PATCH /api/devices/:id/music — parent-set music rules for one panel.
 *
 * Admin only, and deliberately not part of /api/endpoint/settings. That route
 * is authenticated by the panel's own device secret, so anything it accepts
 * can be changed by whoever is standing at the panel — which, for "clean
 * only", is exactly the person it is meant to hold. Putting it here means the
 * only way to lift it is a signed-in parent on the controller.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const parsed = MusicSettings.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const device = await prisma.device.findUnique({ where: { id } });
    if (!device || device.householdId !== admin.householdId) {
      return NextResponse.json({ error: "Unknown device" }, { status: 404 });
    }

    const updated = await prisma.device.update({
      where: { id },
      data: { musicCleanOnly: parsed.data.musicCleanOnly },
      select: { id: true, musicCleanOnly: true },
    });

    /*
     * The heartbeat serves settings out of the auth cache, so without this the
     * panel would keep playing explicit songs for up to the cache TTL after a
     * parent switched them off. Dropped after the write rather than before, as
     * this is a settings change and not a revocation: a heartbeat racing this
     * may repopulate the entry, but from the row as it now stands.
     */
    await forgetSecret(device.deviceSecret);

    return NextResponse.json(updated);
  }, { route: "/api/devices/[id]/music" });
}
