import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { withRoute } from "@/lib/http";
import { searchPlaces } from "@/lib/weather/geocode";
import { clientIp, throttleWeather } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather/search?q= — place lookup for the Weather screen's search,
 * ordered nearest to the household first.
 *
 * Open like /api/weather, and throttled per IP on the same allowance for the
 * same reason: each call is a request to the geocoder on our behalf.
 */
export async function GET(req: Request) {
  return withRoute(
    async () => {
      const verdict = await throttleWeather(clientIp(req));
      if (!verdict.ok) {
          return NextResponse.json(
            { error: "Too many searches — try again shortly" },
            { status: 429, headers: { "retry-after": String(verdict.retryAfterSec) } },
          );
        }

      const q = new URL(req.url).searchParams.get("q") ?? "";
      const results = await searchPlaces(q, {
        latitude: env.weather.latitude,
        longitude: env.weather.longitude,
      });
      return NextResponse.json({ results });
    },
    { route: "/api/weather/search" },
  );
}
