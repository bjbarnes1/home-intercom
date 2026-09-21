import { NextResponse } from "next/server";
import { deviceFromRequest, getSessionUser } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";
import { loadPlaybackTargets } from "@/lib/music/targets";

export const dynamic = "force-dynamic";

/**
 * GET /api/music/targets — the household's own speakers that are awake.
 *
 * Answers for whoever is asking: a paired panel via its device secret, or a
 * signed-in parent on the controller. An unpaired browser gets 401 rather than
 * a borrowed household's device list, and the screen says so — a Hub that is
 * not part of a house has no speakers to offer.
 */
export async function GET(req: Request) {
  return withRoute(
    async () => {
      const device = await deviceFromRequest(req);
      if (device && device.pairing === "ACTIVE") {
        return NextResponse.json({
          ...(await loadPlaybackTargets(device.householdId, device.id)),
          paired: true,
        });
      }

      const user = await getSessionUser();
      if (user) {
        return NextResponse.json({
          ...(await loadPlaybackTargets(user.householdId, null)),
          paired: true,
        });
      }

      return NextResponse.json({ error: "Unpaired", paired: false }, { status: 401 });
    },
    { route: "/api/music/targets" },
  );
}
