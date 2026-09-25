import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { computeNextRun, validateCron } from "@/lib/reminders/schedule";
import { createReminder } from "@/lib/reminders/service";
import { CreateReminderSchema } from "@/lib/reminders/types";
import { invalid, reminderErrorResponse } from "@/lib/reminders/http";
import { remindersChanged } from "@/lib/reminders/bus";

export const dynamic = "force-dynamic";

/** GET /api/reminders — list reminders for the household. */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const reminders = await prisma.reminder.findMany({
      where: { householdId },
      orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }],
    });
    return NextResponse.json({ reminders });
  });
}

const CreateReminder = z
  .object({
    text: z.string().min(1).max(500),
    sound: z.string().max(60).optional(),
    kind: z.enum(["RECURRING", "ONE_OFF"]),
    cron: z.string().optional(),
    runAt: z.string().datetime().optional(),
    timezone: z.string().default("UTC"),
    targetDeviceId: z.string().optional(),
    targetZoneId: z.string().optional(),
  })
  .refine((v) => !!v.targetDeviceId !== !!v.targetZoneId, {
    message: "Provide exactly one of targetDeviceId or targetZoneId",
  })
  .refine((v) => (v.kind === "RECURRING" ? !!v.cron : !!v.runAt), {
    message: "RECURRING needs cron; ONE_OFF needs runAt",
  });

/**
 * POST /api/reminders — create a reminder and materialise its nextRunAt.
 *
 * Two body shapes. The reminders-module shape (`title`, `when`, `assignee`)
 * goes through the domain service like the panel's does. The original shape
 * (`text`, `kind`, `cron`/`runAt`, a target) is still accepted unchanged, so
 * the controller keeps working while it moves over.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object" && "title" in body) {
      const draft = CreateReminderSchema.safeParse(body);
      if (!draft.success) return invalid(draft.error);
      try {
        const reminder = await createReminder(user.householdId, draft.data, { userId: user.id, label: user.name });
        return NextResponse.json({ reminder }, { status: 201 });
      } catch (e) {
        return reminderErrorResponse(e);
      }
    }
    const parsed = CreateReminder.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    if (data.kind === "RECURRING" && data.cron) {
      const cronError = validateCron(data.cron);
      if (cronError) {
        return NextResponse.json({ error: `Invalid cron: ${cronError}` }, { status: 400 });
      }
    }

    const now = new Date();
    const runAt = data.runAt ? new Date(data.runAt) : null;
    // A reminder for a time that has passed is a mistake, not an instruction
    // to speak immediately.
    if (data.kind === "ONE_OFF" && runAt && runAt.getTime() <= now.getTime()) {
      return NextResponse.json(
        { error: "That time has already passed" },
        { status: 400 },
      );
    }
    const nextRunAt = computeNextRun(
      {
        kind: data.kind,
        enabled: true,
        cron: data.cron,
        runAt,
        timezone: data.timezone,
      },
      now,
    );

    const reminder = await prisma.reminder.create({
      data: {
        householdId: user.householdId,
        text: data.text,
        sound: data.sound,
        kind: data.kind,
        cron: data.cron,
        runAt,
        timezone: data.timezone,
        targetDeviceId: data.targetDeviceId,
        targetZoneId: data.targetZoneId,
        createdByUserId: user.id,
        nextRunAt,
      },
    });

    void remindersChanged(user.householdId, "created");
    return NextResponse.json({ reminder }, { status: 201 });
  });
}
