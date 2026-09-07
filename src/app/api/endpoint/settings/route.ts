import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";
import {
  minutesToHm,
  parseHmToMinutes,
} from "@/lib/etiquette/quietHours";

export const dynamic = "force-dynamic";

const Settings = z.object({
  doNotDisturb: z.boolean().optional(),
  chimeEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().optional(), // "HH:MM"
  quietHoursEnd: z.string().optional(),
  hasLeds: z.boolean().optional(),
});

function serializeSettings(d: {
  doNotDisturb: boolean;
  autoAnswer: boolean;
  chimeEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  hasLeds: boolean;
}) {
  return {
    doNotDisturb: d.doNotDisturb,
    autoAnswer: d.autoAnswer,
    chimeEnabled: d.chimeEnabled,
    quietHoursEnabled: d.quietHoursEnabled,
    quietHoursStart:
      d.quietHoursStart != null ? minutesToHm(d.quietHoursStart) : "22:00",
    quietHoursEnd: d.quietHoursEnd != null ? minutesToHm(d.quietHoursEnd) : "07:00",
    hasLeds: d.hasLeds,
  };
}

/**
 * GET /api/endpoint/settings — current per-device etiquette.
 */
export async function GET(req: Request) {
  return withRoute(async () => {
    const device = await deviceFromRequest(req);
    if (!device || device.pairing !== "ACTIVE") {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }
    const row = await prisma.device.findUniqueOrThrow({
      where: { id: device.id },
      select: {
        doNotDisturb: true,
        autoAnswer: true,
        chimeEnabled: true,
        quietHoursEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        hasLeds: true,
      },
    });
    return NextResponse.json(serializeSettings(row));
  }, { route: "/api/endpoint/settings" });
}

/**
 * PATCH /api/endpoint/settings — persist per-device etiquette from the wall panel.
 */
export async function PATCH(req: Request) {
  return withRoute(async () => {
    const device = await deviceFromRequest(req);
    if (!device || device.pairing !== "ACTIVE") {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }

    const parsed = Settings.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data: {
      doNotDisturb?: boolean;
      chimeEnabled?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: number | null;
      quietHoursEnd?: number | null;
      hasLeds?: boolean;
    } = {};

    if (parsed.data.doNotDisturb !== undefined) {
      data.doNotDisturb = parsed.data.doNotDisturb;
    }
    if (parsed.data.chimeEnabled !== undefined) {
      data.chimeEnabled = parsed.data.chimeEnabled;
    }
    if (parsed.data.quietHoursEnabled !== undefined) {
      data.quietHoursEnabled = parsed.data.quietHoursEnabled;
    }
    if (parsed.data.hasLeds !== undefined) {
      data.hasLeds = parsed.data.hasLeds;
    }
    if (parsed.data.quietHoursStart !== undefined) {
      const m = parseHmToMinutes(parsed.data.quietHoursStart);
      if (m == null) {
        return NextResponse.json({ error: "Invalid quietHoursStart" }, { status: 400 });
      }
      data.quietHoursStart = m;
    }
    if (parsed.data.quietHoursEnd !== undefined) {
      const m = parseHmToMinutes(parsed.data.quietHoursEnd);
      if (m == null) {
        return NextResponse.json({ error: "Invalid quietHoursEnd" }, { status: 400 });
      }
      data.quietHoursEnd = m;
    }

    const updated = await prisma.device.update({
      where: { id: device.id },
      data,
      select: {
        doNotDisturb: true,
        autoAnswer: true,
        chimeEnabled: true,
        quietHoursEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        hasLeds: true,
      },
    });

    return NextResponse.json(serializeSettings(updated));
  }, { route: "/api/endpoint/settings" });
}
