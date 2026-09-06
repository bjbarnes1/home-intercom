import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { localDay } from "@/lib/jobs/board";

export const dynamic = "force-dynamic";

const Tick = z.object({ choreId: z.string() });

/**
 * POST /api/jobs/tick — toggle today's completion for a chore. Device-authed.
 * Idempotent per (chore, day): creating if absent, removing if present.
 */
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Tick.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const chore = await prisma.chore.findUnique({
    where: { id: parsed.data.choreId },
    select: { id: true, householdId: true },
  });
  if (!chore || chore.householdId !== device.householdId) {
    return NextResponse.json({ error: "Unknown chore" }, { status: 404 });
  }

  const household = await prisma.household.findUnique({
    where: { id: device.householdId },
    select: { timezone: true },
  });
  const day = localDay(new Date(), household?.timezone ?? "UTC");

  const existing = await prisma.choreCompletion.findUnique({
    where: { choreId_day: { choreId: chore.id, day } },
    select: { id: true },
  });

  if (existing) {
    await prisma.choreCompletion.delete({ where: { id: existing.id } });
    return NextResponse.json({ choreId: chore.id, done: false });
  }
  await prisma.choreCompletion.create({ data: { choreId: chore.id, day } });
  return NextResponse.json({ choreId: chore.id, done: true });
}
