import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { localDay } from "@/lib/jobs/board";

export const dynamic = "force-dynamic";

const DAYS = 7;

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * GET /api/schedule — the next 7 local days of calendar events for this
 * endpoint's household, grouped by day, plus the next upcoming event.
 * Device-authed.
 */
export async function GET(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  const household = await prisma.household.findUnique({
    where: { id: device.householdId },
    select: { timezone: true },
  });
  const tz = household?.timezone ?? "UTC";
  const now = new Date();

  // Build the forward day list (today first) and the fetch window.
  const dayList: string[] = [];
  for (let k = 0; k < DAYS; k++) {
    dayList.push(localDay(new Date(now.getTime() + k * 86_400_000), tz));
  }
  const windowEnd = new Date(now.getTime() + DAYS * 86_400_000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      householdId: device.householdId,
      startsAt: { gte: new Date(now.getTime() - 86_400_000), lt: windowEnd },
    },
    orderBy: { startsAt: "asc" },
  });

  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const d = localDay(e.startsAt, tz);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(e);
  }

  const days = dayList.map((day) => {
    const dayEvents = (byDay.get(day) ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      time: e.allDay ? "All day" : fmtTime(e.startsAt, tz),
      who: e.who,
      color: e.color ?? "#9184d9",
    }));
    const dt = new Date(`${day}T00:00:00`);
    return {
      day,
      weekday: dt.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: parseInt(day.slice(-2), 10),
      count: dayEvents.length,
      events: dayEvents,
    };
  });

  const upcoming = events.find((e) => e.startsAt.getTime() >= now.getTime());
  const nextEvent = upcoming
    ? {
        title: upcoming.title,
        time: upcoming.allDay ? "All day" : fmtTime(upcoming.startsAt, tz),
        who: upcoming.who,
        day: localDay(upcoming.startsAt, tz),
      }
    : null;

  return NextResponse.json({ days, nextEvent });
}
