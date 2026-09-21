import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PatchRule = z.object({
  template: z.string().min(1).max(300).optional(),
  enabled: z.boolean().optional(),
  trigger: z.enum(["ARRIVE", "DEPART"]).optional(),
  subjectUserId: z.string().nullable().optional(),
  targetDeviceId: z.string().nullable().optional(),
  targetZoneId: z.string().nullable().optional(),
  cooldownMinutes: z.number().int().min(0).max(240).optional(),
});

/** PATCH /api/location/rules/[id] — edit, or flip it on and off. */
export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const parsed = PatchRule.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const existing = await prisma.placeRule.findFirst({
      where: { id, householdId: admin.householdId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Targets are exclusive, so setting one clears the other.
    let targetDeviceId = data.targetDeviceId;
    let targetZoneId = data.targetZoneId;
    if (data.targetDeviceId) targetZoneId = null;
    if (data.targetZoneId) targetDeviceId = null;

    const rule = await prisma.placeRule.update({
      where: { id },
      data: {
        ...(data.template !== undefined ? { template: data.template } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.trigger !== undefined ? { trigger: data.trigger } : {}),
        ...(data.subjectUserId !== undefined ? { subjectUserId: data.subjectUserId } : {}),
        ...(targetDeviceId !== undefined ? { targetDeviceId } : {}),
        ...(targetZoneId !== undefined ? { targetZoneId } : {}),
        ...(data.cooldownMinutes !== undefined
          ? { cooldownMinutes: data.cooldownMinutes }
          : {}),
      },
      select: { id: true, template: true, enabled: true },
    });

    return NextResponse.json({ rule });
  }, { route: "/api/location/rules/[id]" });
}

/** DELETE /api/location/rules/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const existing = await prisma.placeRule.findFirst({
      where: { id, householdId: admin.householdId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.placeRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }, { route: "/api/location/rules/[id]" });
}
