import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { withRoute } from "@/lib/http";
import { searchPlaces } from "@/lib/weather/geocode";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather/search?q= — place lookup for the Weather screen's search,
 * ordered nearest to the household first.
 */
export async function GET(req: Request) {
  return withRoute(
    async () => {
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
