import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/controller/jobs — kids + chores for editing. */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const kids = await prisma.kid.findMany({
      where: { householdId },
      orderBy: { order: "asc" },
      include: {
        chores: {
          where: { active: true },
          orderBy: { order: "asc" },
        },
      },
    });
    return NextResponse.json({ kids });
  }, { route: "/api/controller/jobs" });
}

const CreateKid = z.object({
  name: z.string().min(1).max(80),
});

const CreateChore = z.object({
  kidId: z.string().min(1),
  label: z.string().min(1).max(120),
});

/**
 * POST /api/controller/jobs — body.kind = "kid" | "chore".
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const body = await req.json().catch(() => null);
    const kind = body?.kind;

    if (kind === "kid") {
      const parsed = CreateKid.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      const max = await prisma.kid.aggregate({
        where: { householdId },
        _max: { order: true },
      });
      const kid = await prisma.kid.create({
        data: {
          householdId,
          name: parsed.data.name,
          order: (max._max.order ?? -1) + 1,
        },
      });
      return NextResponse.json({ kid }, { status: 201 });
    }

    if (kind === "chore") {
      const parsed = CreateChore.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      const kid = await prisma.kid.findFirst({
        where: { id: parsed.data.kidId, householdId },
      });
      if (!kid) {
        return NextResponse.json({ error: "Kid not found" }, { status: 404 });
      }
      const max = await prisma.chore.aggregate({
        where: { kidId: kid.id },
        _max: { order: true },
      });
      const chore = await prisma.chore.create({
        data: {
          householdId,
          kidId: kid.id,
          label: parsed.data.label,
          order: (max._max.order ?? -1) + 1,
        },
      });
      return NextResponse.json({ chore }, { status: 201 });
    }

    return NextResponse.json({ error: "kind must be kid or chore" }, { status: 400 });
  }, { route: "/api/controller/jobs" });
}
