import { NextResponse } from "next/server";
import { fireDueReminders } from "@/lib/reminders/fire";
import { pruneLocationHistory } from "@/lib/location/retention";
import { withRoute } from "@/lib/http";

export const dynamic = "force-dynamic";
// Reminder resolution is quick, but give the scheduler headroom.
export const maxDuration = 60;

/**
 * GET /api/cron/tick — the household's minute hand. Invoked every minute by
 * Vercel Cron (see vercel.json). Fires any reminders due now, and applies
 * location retention.
 *
 * Retention rides the same tick rather than a nightly job so each sweep is
 * tiny — there is never a day's backlog to grind through, and "deleted after a
 * week" is true to the minute rather than to the night.
 *
 * When CRON_SECRET is set, Vercel sends it as `Authorization: Bearer <secret>`
 * and we require it; without it (local/dev) the route is open.
 */
export async function GET(req: Request) {
  return withRoute(async () => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();
    const [reminders, location] = await Promise.all([
      fireDueReminders(now),
      pruneLocationHistory(now),
    ]);
    return NextResponse.json({ ok: true, ...reminders, location });
  }, { route: "/api/cron/tick" });
}
