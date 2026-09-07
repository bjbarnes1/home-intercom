import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/controller/schedule — list upcoming calendar events. */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const now = new Date();
    const events = await prisma.calendarEvent.findMany({
      where: {
        householdId,
        startsAt: { gte: new Date(now.getTime() - 86_400_000) },
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    return NextResponse.json({ events });
  }, { route: "/api/controller/schedule" });
}

const CreateEvent = z.object({
  title: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  who: z.string().max(80).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
});

/** POST /api/controller/schedule — create a calendar event. */
export async function POST(req: Request) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const parsed = CreateEvent.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const event = await prisma.calendarEvent.create({
      data: {
        householdId,
        title: d.title,
        startsAt: new Date(d.startsAt),
        endsAt: d.endsAt ? new Date(d.endsAt) : null,
        allDay: d.allDay ?? false,
        who: d.who ?? null,
        location: d.location ?? null,
        color: d.color ?? null,
      },
    });
    return NextResponse.json({ event }, { status: 201 });
  }, { route: "/api/controller/schedule" });
}
