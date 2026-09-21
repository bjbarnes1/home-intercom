import { reportWarning } from "@/lib/errors/report";
import type { Place } from "@/lib/weather/openMeteo";

/**
 * Place search, so the Weather screen can look somewhere other than home.
 * Open-Meteo's geocoder, same as the forecast: no key, no account.
 */

export interface PlaceMatch extends Place {
  /** "New South Wales, Australia" — enough to tell two Newcastles apart. */
  region: string;
}

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

interface GeocodeResponse {
  results?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    admin1?: string;
    country?: string;
  }[];
}

export async function searchPlaces(query: string): Promise<PlaceMatch[]> {
  const name = query.trim();
  // One character matches half the world; 60 is longer than any real place name.
  if (name.length < 2 || name.length > 60) return [];

  try {
    const res = await fetch(
      `${ENDPOINT}?name=${encodeURIComponent(name)}&count=6&language=en&format=json`,
      { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } },
    );
    if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
    const json = (await res.json()) as GeocodeResponse;

    return (json.results ?? [])
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && r.name)
      .map((r) => ({
        place: r.name as string,
        latitude: r.latitude as number,
        longitude: r.longitude as number,
        region: [r.admin1, r.country].filter(Boolean).join(", "),
      }));
  } catch (e) {
    reportWarning(e, { code: "weather.geocode", route: "searchPlaces" });
    return [];
  }
}
