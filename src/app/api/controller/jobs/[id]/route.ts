import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/controller/jobs/[id]?type=kid|chore */
export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "chore";
    const body = await req.json().catch(() => null);

    if (type === "kid") {
      const parsed = z
        .object({ name: z.string().min(1).max(80).optional() })
        .safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      const existing = await prisma.kid.findFirst({ where: { id, householdId } });
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const kid = await prisma.kid.update({
        where: { id },
        data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}) },
      });
      return NextResponse.json({ kid });
    }

    const parsed = z
      .object({
        label: z.string().min(1).max(120).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const existing = await prisma.chore.findFirst({ where: { id, householdId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const chore = await prisma.chore.update({
      where: { id },
      data: {
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });
    return NextResponse.json({ chore });
  }, { route: "/api/controller/jobs/[id]" });
}

/** DELETE /api/controller/jobs/[id]?type=kid|chore */
export async function DELETE(req: Request, ctx: Ctx) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const { id } = await ctx.params;
    const type = new URL(req.url).searchParams.get("type") ?? "chore";

    if (type === "kid") {
      const existing = await prisma.kid.findFirst({ where: { id, householdId } });
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await prisma.kid.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    const existing = await prisma.chore.findFirst({ where: { id, householdId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.chore.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  }, { route: "/api/controller/jobs/[id]" });
}
