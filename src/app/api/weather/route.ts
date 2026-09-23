import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { withRoute } from "@/lib/http";
import { getForecast } from "@/lib/weather/openMeteo";
import { clientIp, throttleWeather } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather — forecast for the household's location, or for a place the
 * Weather screen has been pointed at via ?lat=&lon=&place=.
 *
 * Deliberately open: the Hub runs this screen with nobody signed in, and a
 * forecast is public information. Home is served from a cache it can never be
 * evicted from. Any other location is throttled per IP, because the forecast
 * cache is small and per-instance and on its own would not stop a loop over
 * coordinates fanning out to Open-Meteo.
 */
const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  place: z.string().trim().min(1).max(60),
});

export async function GET(req: Request) {
  return withRoute(
    async () => {
      const url = new URL(req.url);
      const parsed = Query.safeParse({
        lat: url.searchParams.get("lat"),
        lon: url.searchParams.get("lon"),
        place: url.searchParams.get("place"),
      });

      // No usable override means the household's own location, which is the
      // overwhelmingly common case — the screen opens on home.
      const where = parsed.success
        ? { latitude: parsed.data.lat, longitude: parsed.data.lon, place: parsed.data.place }
        : { latitude: env.weather.latitude, longitude: env.weather.longitude, place: env.weather.place };

      if (parsed.success && !isHome(parsed.data.lat, parsed.data.lon)) {
        const verdict = await throttleWeather(clientIp(req));
        if (!verdict.ok) {
          return NextResponse.json(
            { error: "Too many weather lookups — try again shortly" },
            { status: 429, headers: { "retry-after": String(verdict.retryAfterSec) } },
          );
        }
      }

      const forecast = await getForecast(where);
      if (!forecast) {
        // Upstream is down and nothing is cached. The screen says so rather
        // than showing a stale or invented temperature.
        return NextResponse.json({ forecast: null }, { status: 200 });
      }
      return NextResponse.json({ forecast, home: where.place === env.weather.place });
    },
    { route: "/api/weather" },
  );
}

/** Same ~110 m grid the forecast cache uses, so home by any spelling is home. */
function isHome(lat: number, lon: number): boolean {
  return (
    lat.toFixed(3) === env.weather.latitude.toFixed(3) &&
    lon.toFixed(3) === env.weather.longitude.toFixed(3)
  );
}
