import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { computeNextRun, validateCron } from "@/lib/reminders/schedule";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PatchReminder = z.object({
  text: z.string().min(1).max(500).optional(),
  enabled: z.boolean().optional(),
  sound: z.string().max(60).nullable().optional(),
  kind: z.enum(["RECURRING", "ONE_OFF"]).optional(),
  cron: z.string().nullable().optional(),
  runAt: z.string().datetime().nullable().optional(),
  timezone: z.string().optional(),
  targetDeviceId: z.string().nullable().optional(),
  targetZoneId: z.string().nullable().optional(),
});

/** PATCH /api/reminders/[id] — edit / enable / disable. */
export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const { id } = await ctx.params;
    const parsed = PatchReminder.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.reminder.findFirst({
      where: { id, householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const d = parsed.data;
    if (d.cron) {
      const cronError = validateCron(d.cron);
      if (cronError) {
        return NextResponse.json({ error: `Invalid cron: ${cronError}` }, { status: 400 });
      }
    }

    const kind = d.kind ?? existing.kind;
    const cron = d.cron !== undefined ? d.cron : existing.cron;
    const runAt =
      d.runAt !== undefined
        ? d.runAt
          ? new Date(d.runAt)
          : null
        : existing.runAt;
    const timezone = d.timezone ?? existing.timezone;
    const enabled = d.enabled ?? existing.enabled;

    let targetDeviceId =
      d.targetDeviceId !== undefined ? d.targetDeviceId : existing.targetDeviceId;
    let targetZoneId =
      d.targetZoneId !== undefined ? d.targetZoneId : existing.targetZoneId;

    if (d.targetDeviceId !== undefined && d.targetDeviceId) {
      targetZoneId = null;
    }
    if (d.targetZoneId !== undefined && d.targetZoneId) {
      targetDeviceId = null;
    }

    const nextRunAt = computeNextRun(
      {
        kind,
        enabled,
        cron: cron ?? undefined,
        runAt,
        timezone,
        snoozedUntil: existing.snoozedUntil,
        lastRunAt: existing.lastRunAt,
      },
      new Date(),
    );

    const reminder = await prisma.reminder.update({
      where: { id },
      data: {
        ...(d.text !== undefined ? { text: d.text } : {}),
        ...(d.sound !== undefined ? { sound: d.sound } : {}),
        kind,
        cron,
        runAt,
        timezone,
        enabled,
        targetDeviceId,
        targetZoneId,
        nextRunAt,
      },
    });

    return NextResponse.json({ reminder });
  }, { route: "/api/reminders/[id]" });
}

/** DELETE /api/reminders/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async () => {
    await requireUser();
    const householdId = await currentHouseholdId();
    const { id } = await ctx.params;
    const existing = await prisma.reminder.findFirst({
      where: { id, householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.reminder.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }, { route: "/api/reminders/[id]" });
}
