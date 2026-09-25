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
 * Vercel sends CRON_SECRET as `Authorization: Bearer <secret>`. In production
 * it is required: an unset secret used to mean "open", and Vercel stores an
 * empty string, so a blank var left this on a minute-by-minute schedule that
 * anyone could drive in a loop — firing every due reminder repeatedly and
 * spending real money on TTS. Outside production an unset secret still means
 * open, so `npm run dev` needs no ceremony.
 *
 * Where the app runs as a long-lived process (a home server, the Hub itself)
 * the in-process scheduler (src/lib/reminders/scheduler.ts) fires reminders
 * on the second and this tick becomes the backstop. Both can run at once: the
 * engine's claims make a second pass over the same slot a no-op.
 */
export async function GET(req: Request) {
  return withRoute(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "CRON_SECRET is not configured" },
          { status: 503 },
        );
      }
    } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const [reminders, location] = await Promise.all([
      fireDueReminders(now),
      pruneLocationHistory(now),
    ]);
    return NextResponse.json({ ok: true, ...reminders, location });
  }, { route: "/api/cron/tick" });
}
