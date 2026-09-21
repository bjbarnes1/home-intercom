import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PatchPlace = z.object({
  name: z.string().min(1).max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusM: z.number().int().min(50).max(10_000).optional(),
  icon: z.string().max(60).nullable().optional(),
});

/** PATCH /api/location/places/[id] — rename, move or resize a geofence. */
export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const parsed = PatchPlace.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.place.findFirst({
      where: { id, householdId: admin.householdId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const place = await prisma.place.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, lat: true, lng: true, radiusM: true, icon: true },
    });
    return NextResponse.json({ place });
  }, { route: "/api/location/places/[id]" });
}

/**
 * DELETE /api/location/places/[id] — removing a place also removes its visit
 * history (the cascade is in the schema), which is the behaviour you want:
 * deleting "School" should not leave a trail of school arrivals behind.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const existing = await prisma.place.findFirst({
      where: { id, householdId: admin.householdId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.place.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }, { route: "/api/location/places/[id]" });
}
