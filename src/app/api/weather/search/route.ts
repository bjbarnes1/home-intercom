import { NextResponse } from "next/server";
import { withRoute } from "@/lib/http";
import { searchPlaces } from "@/lib/weather/geocode";

export const dynamic = "force-dynamic";

/** GET /api/weather/search?q= — place lookup for the Weather screen's search. */
export async function GET(req: Request) {
  return withRoute(
    async () => {
      const q = new URL(req.url).searchParams.get("q") ?? "";
      return NextResponse.json({ results: await searchPlaces(q) });
    },
    { route: "/api/weather/search" },
  );
}
