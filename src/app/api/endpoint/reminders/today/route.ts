import { NextResponse } from "next/server";
import { withRoute } from "@/lib/http";
import { panelSnapshot } from "@/lib/reminders/service";
import { activeDevice, unauthorizedDevice } from "@/lib/reminders/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/endpoint/reminders/today — everything the Hub shows about
 * reminders in one read: the household's agenda for today, the alerts ringing
 * on this panel, and the members a new reminder can be for.
 *
 * This is also the panel's recovery path. Live changes arrive over the lobby;
 * a panel that missed one (reconnecting, mock mode, a dropped packet) polls
 * this and converges.
 */
export async function GET(req: Request) {
  return withRoute(async () => {
    const device = await activeDevice(req);
    if (!device) return unauthorizedDevice();
    return NextResponse.json(await panelSnapshot(device));
  }, { route: "/api/endpoint/reminders/today" });
}
