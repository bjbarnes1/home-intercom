import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { computeNextRun, validateCron } from "@/lib/reminders/schedule";
import { reportError } from "@/lib/errors/report";

export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().min(1).max(500) });

interface Target {
  id: string;
  label: string;
  kind: "device" | "zone";
}

/**
 * POST /api/reminders/parse — turn a natural-language request ("set a reminder
 * for 4pm tomorrow for Willoughby to read his novel") into a real reminder,
 * using Claude to extract the target, timing and message.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const household = await prisma.household.findUnique({
      where: { id: user.householdId },
      select: { timezone: true },
    });
    const tz = household?.timezone ?? "UTC";

    const [devices, zones] = await Promise.all([
      prisma.device.findMany({
        where: { householdId: user.householdId, type: "ENDPOINT" },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      }),
      prisma.zone.findMany({
        where: { householdId: user.householdId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const targets: Target[] = [
      ...devices.map((d) => ({ id: d.id, label: d.displayName, kind: "device" as const })),
      ...zones.map((z) => ({ id: z.id, label: `${z.name} (zone)`, kind: "zone" as const })),
    ];
    if (targets.length === 0) {
      return NextResponse.json({ error: "No endpoints to target" }, { status: 400 });
    }

    const nowLocal = DateTime.now().setZone(tz);
    const client = new Anthropic();

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 1024,
        output_config: { effort: "low" },
        system:
          "You convert a household member's natural-language request into a single " +
          "spoken reminder for a home intercom. Always call the set_reminder tool.\n" +
          `The current local date and time is ${nowLocal.toFormat("cccc, dd LLLL yyyy, HH:mm")} ` +
          `(timezone ${tz}). Resolve relative times ("tomorrow", "in an hour", "tonight") against it.\n` +
          "Pick target_id from the provided list. A person's name maps to the endpoint " +
          "with that name; 'everyone'/'the house' maps to the widest zone.\n" +
          "Rewrite the message as a friendly spoken announcement addressed to the person " +
          `(e.g. "Willoughby, time to read your novel"). Available targets:\n` +
          targets.map((t) => `- ${t.label} [id: ${t.id}]`).join("\n"),
        tools: [
          {
            name: "set_reminder",
            description: "Create the reminder.",
            strict: true,
            input_schema: {
              type: "object",
              additionalProperties: false,
              required: ["message", "target_id", "when_kind", "time", "confirmation"],
              properties: {
                message: { type: "string", description: "The reminder text to speak aloud." },
                target_id: {
                  type: "string",
                  enum: targets.map((t) => t.id),
                  description: "Which endpoint or zone to play on.",
                },
                when_kind: {
                  type: "string",
                  enum: ["once", "daily"],
                  description: "'once' for a specific date/time, 'daily' for a repeating time.",
                },
                time: {
                  type: "string",
                  description:
                    "For 'once': local datetime as YYYY-MM-DDTHH:mm. For 'daily': HH:mm (24h).",
                },
                confirmation: {
                  type: "string",
                  description: "A short human confirmation, e.g. 'Set for 4pm tomorrow'.",
                },
              },
            },
          },
        ],
        tool_choice: { type: "tool", name: "set_reminder" },
        messages: [{ role: "user", content: parsed.data.text }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        reportError(e, {
          code: "reminders.parse.auth",
          route: "/api/reminders/parse",
        });
        return NextResponse.json(
          { error: "AI reminders aren't configured (missing ANTHROPIC_API_KEY)." },
          { status: 503 },
        );
      }
      reportError(e, {
        code: "reminders.parse",
        route: "/api/reminders/parse",
      });
      return NextResponse.json({ error: "Couldn't understand that." }, { status: 502 });
    }

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "Couldn't understand that." }, { status: 422 });
    }
    const out = toolUse.input as {
      message: string;
      target_id: string;
      when_kind: "once" | "daily";
      time: string;
      confirmation: string;
    };

    const target = targets.find((t) => t.id === out.target_id);
    if (!target) {
      return NextResponse.json({ error: "Couldn't resolve who that's for." }, { status: 422 });
    }

    // Build schedule fields.
    let cron: string | null = null;
    let runAt: Date | null = null;
    let kind: "RECURRING" | "ONE_OFF";

    if (out.when_kind === "daily") {
      const m = out.time.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return NextResponse.json({ error: "Couldn't read the time." }, { status: 422 });
      cron = `${parseInt(m[2], 10)} ${parseInt(m[1], 10)} * * *`;
      if (validateCron(cron)) {
        return NextResponse.json({ error: "Couldn't read the time." }, { status: 422 });
      }
      kind = "RECURRING";
    } else {
      const dt = DateTime.fromISO(out.time, { zone: tz });
      if (!dt.isValid) {
        return NextResponse.json({ error: "Couldn't read the date/time." }, { status: 422 });
      }
      runAt = dt.toJSDate();
      kind = "ONE_OFF";
    }

    const nextRunAt = computeNextRun(
      { kind, enabled: true, cron, runAt, timezone: tz },
      new Date(),
    );

    const reminder = await prisma.reminder.create({
      data: {
        householdId: user.householdId,
        text: out.message,
        kind,
        cron,
        runAt,
        timezone: tz,
        targetDeviceId: target.kind === "device" ? target.id : null,
        targetZoneId: target.kind === "zone" ? target.id : null,
        createdByUserId: user.id,
        nextRunAt,
      },
    });

    return NextResponse.json({ reminder, confirmation: out.confirmation });
  });
}
