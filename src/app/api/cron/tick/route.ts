import { NextResponse } from "next/server";
import { fireDueReminders } from "@/lib/reminders/fire";
import { withRoute } from "@/lib/http";

export const dynamic = "force-dynamic";
// Reminder resolution is quick, but give the scheduler headroom.
export const maxDuration = 60;

/**
 * GET /api/cron/tick — the reminder scheduler. Invoked every minute by Vercel
 * Cron (see vercel.json). Fires any reminders due now.
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

    const result = await fireDueReminders(new Date());
    return NextResponse.json({ ok: true, ...result });
  }, { route: "/api/cron/tick" });
}
