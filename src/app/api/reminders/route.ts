import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId } from "@/lib/auth/context";
import { computeNextRun, validateCron } from "@/lib/reminders/schedule";

export const dynamic = "force-dynamic";

/** GET /api/reminders — list reminders for the household. */
export async function GET() {
  const householdId = await currentHouseholdId();
  const reminders = await prisma.reminder.findMany({
    where: { householdId },
    orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }],
  });
  return NextResponse.json({ reminders });
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

/** POST /api/reminders — create a reminder and materialise its nextRunAt. */
export async function POST(req: Request) {
  const householdId = await currentHouseholdId();
  const body = await req.json().catch(() => null);
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
      householdId,
      text: data.text,
      sound: data.sound,
      kind: data.kind,
      cron: data.cron,
      runAt,
      timezone: data.timezone,
      targetDeviceId: data.targetDeviceId,
      targetZoneId: data.targetZoneId,
      nextRunAt,
    },
  });

  return NextResponse.json({ reminder }, { status: 201 });
}
