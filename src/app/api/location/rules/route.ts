import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentHouseholdId, requireAdmin } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { deliverAnnouncement } from "@/lib/announce/deliver";
import { renderTemplate } from "@/lib/location/rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/location/rules — arrival/departure announcements.
 *
 * Readable by everyone in the household: a rule that speaks your name when you
 * get home is something you should be able to see exists.
 */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const rules = await prisma.placeRule.findMany({
      where: { householdId },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        placeId: true,
        trigger: true,
        subjectUserId: true,
        template: true,
        targetDeviceId: true,
        targetZoneId: true,
        enabled: true,
        cooldownMinutes: true,
        place: { select: { name: true } },
        subject: { select: { name: true } },
      },
    });

    return NextResponse.json({
      rules: rules.map((rule) => ({
        id: rule.id,
        placeId: rule.placeId,
        placeName: rule.place.name,
        trigger: rule.trigger,
        subjectUserId: rule.subjectUserId,
        subjectName: rule.subject?.name ?? null,
        template: rule.template,
        targetDeviceId: rule.targetDeviceId,
        targetZoneId: rule.targetZoneId,
        enabled: rule.enabled,
        cooldownMinutes: rule.cooldownMinutes,
        /// What it will actually say, so the list reads as sentences rather
        /// than templates.
        preview: renderTemplate(rule.template, {
          name: rule.subject?.name ?? "Someone",
          place: rule.place.name,
        }),
      })),
    });
  }, { route: "/api/location/rules" });
}

const CreateRule = z
  .object({
    placeId: z.string().min(1),
    trigger: z.enum(["ARRIVE", "DEPART"]),
    /** Omitted or null means anyone in the household. */
    subjectUserId: z.string().nullable().optional(),
    template: z.string().min(1).max(300),
    targetDeviceId: z.string().optional(),
    targetZoneId: z.string().optional(),
    cooldownMinutes: z.number().int().min(0).max(240).default(15),
    /** Speak it once now, so you can hear what you just built. */
    testNow: z.boolean().default(false),
  })
  .refine((v) => !!v.targetDeviceId !== !!v.targetZoneId, {
    message: "Provide exactly one of targetDeviceId or targetZoneId",
  });

/** POST /api/location/rules — admin adds a rule. */
export async function POST(req: Request) {
  return withAuth(async () => {
    const admin = await requireAdmin();
    const parsed = CreateRule.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    // The place must be this household's — a rule can't point at someone
    // else's geofence.
    const place = await prisma.place.findFirst({
      where: { id: data.placeId, householdId: admin.householdId },
      select: { id: true, name: true },
    });
    if (!place) {
      return NextResponse.json({ error: "Unknown place" }, { status: 400 });
    }

    if (data.subjectUserId) {
      const subject = await prisma.user.findFirst({
        where: { id: data.subjectUserId, householdId: admin.householdId },
        select: { id: true },
      });
      if (!subject) {
        return NextResponse.json({ error: "Unknown person" }, { status: 400 });
      }
    }

    const rule = await prisma.placeRule.create({
      data: {
        householdId: admin.householdId,
        placeId: data.placeId,
        trigger: data.trigger,
        subjectUserId: data.subjectUserId ?? null,
        template: data.template,
        targetDeviceId: data.targetDeviceId ?? null,
        targetZoneId: data.targetZoneId ?? null,
        cooldownMinutes: data.cooldownMinutes,
      },
      select: { id: true, template: true },
    });

    let spoken: string | null = null;
    if (data.testNow) {
      const subjectName = data.subjectUserId
        ? (await prisma.user.findUnique({
            where: { id: data.subjectUserId },
            select: { name: true },
          }))?.name ?? "Someone"
        : admin.name;

      const text = renderTemplate(rule.template, { name: subjectName, place: place.name });
      const outcome = await deliverAnnouncement({
        householdId: admin.householdId,
        text,
        from: admin.name,
        targetDeviceId: data.targetDeviceId,
        targetZoneId: data.targetZoneId,
        initiatorUserId: admin.id,
        summary: `Rule test · ${text}`,
      });
      spoken = outcome.reached.length > 0 ? text : null;
    }

    return NextResponse.json({ rule, spoken }, { status: 201 });
  }, { route: "/api/location/rules" });
}
