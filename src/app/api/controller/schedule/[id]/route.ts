import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/controller/schedule/[id] */
export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const { id } = await ctx.params;
    const Patch = z.object({
      title: z.string().min(1).max(200).optional(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().nullable().optional(),
      allDay: z.boolean().optional(),
      who: z.string().max(80).nullable().optional(),
      location: z.string().max(200).nullable().optional(),
      color: z.string().max(20).nullable().optional(),
    });
    const parsed = Patch.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const d = parsed.data;
    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.startsAt !== undefined ? { startsAt: new Date(d.startsAt) } : {}),
        ...(d.endsAt !== undefined
          ? { endsAt: d.endsAt ? new Date(d.endsAt) : null }
          : {}),
        ...(d.allDay !== undefined ? { allDay: d.allDay } : {}),
        ...(d.who !== undefined ? { who: d.who } : {}),
        ...(d.location !== undefined ? { location: d.location } : {}),
        ...(d.color !== undefined ? { color: d.color } : {}),
      },
    });
    return NextResponse.json({ event });
  }, { route: "/api/controller/schedule/[id]" });
}

/** DELETE /api/controller/schedule/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const { id } = await ctx.params;
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }, { route: "/api/controller/schedule/[id]" });
}
