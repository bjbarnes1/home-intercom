import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { recentDays, streakFrom } from "@/lib/jobs/board";

export const dynamic = "force-dynamic";

const STREAK_WINDOW = 30; // days of history considered for streaks

/**
 * GET /api/jobs — the chore board for the household this endpoint belongs to.
 * Device-authed (the wall panel reads and ticks it).
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
  const days = recentDays(now, tz, STREAK_WINDOW);
  const today = days[0];
  const weekDays = new Set(days.slice(0, 7));

  const kids = await prisma.kid.findMany({
    where: { householdId: device.householdId },
    orderBy: { order: "asc" },
    include: {
      chores: {
        where: { active: true },
        orderBy: { order: "asc" },
        include: {
          completions: {
            where: { day: { gte: days[days.length - 1] } },
            select: { day: true },
          },
        },
      },
    },
  });

  let weekDoneTotal = 0;

  const kidsOut = kids.map((kid) => {
    const total = kid.chores.length;

    // Map day -> number of chores completed that day (for this kid).
    const doneByDay = new Map<string, number>();
    for (const chore of kid.chores) {
      for (const c of chore.completions) {
        doneByDay.set(c.day, (doneByDay.get(c.day) ?? 0) + 1);
        if (weekDays.has(c.day)) weekDoneTotal++;
      }
    }

    const allDoneMostRecentFirst = days.map(
      (d) => total > 0 && (doneByDay.get(d) ?? 0) >= total,
    );
    const streak = streakFrom(allDoneMostRecentFirst);

    const chores = kid.chores.map((chore) => ({
      id: chore.id,
      label: chore.label,
      done: chore.completions.some((c) => c.day === today),
    }));
    const doneToday = chores.filter((c) => c.done).length;

    return {
      id: kid.id,
      name: kid.name,
      initial: kid.name.charAt(0).toUpperCase(),
      total,
      doneToday,
      streak,
      chores,
    };
  });

  return NextResponse.json({ day: today, weekDoneTotal, kids: kidsOut });
}
