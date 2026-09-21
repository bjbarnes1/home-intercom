import { reportWarning } from "@/lib/errors/report";
import type { Place } from "@/lib/weather/openMeteo";

/**
 * Place search, so the Weather screen can look somewhere other than home.
 * Open-Meteo's geocoder, same as the forecast: no key, no account.
 */

export interface PlaceMatch extends Place {
  /** "New South Wales, Australia" — enough to tell two Newcastles apart. */
  region: string;
  /** Kilometres from the household. */
  distanceKm: number;
  /** 0 when the geocoder has no figure — parks, airports, unnamed localities. */
  population: number;
}

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

interface GeocodeResponse {
  results?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    admin1?: string;
    country?: string;
    population?: number;
  }[];
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance. Good to a few metres at household scale, which is plenty. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How likely this is the place that was meant.
 *
 * Distance alone is not enough. Searching "Brisbane" from Sydney, a hamlet
 * called Brisbane Park is 84 km away and the city of Brisbane is 733 km, so
 * nearest-first buries the one everybody means. Prominence alone is not enough
 * either — it puts Brisbane, California above anywhere you could drive to.
 *
 * So both, on a log scale, with prominence weighted the heavier of the two:
 * a city outranks a hamlet many times further away, while two comparable places
 * are separated by which one is closer to the kitchen this is running in.
 * Places the geocoder gives no population — parks, airports, map features —
 * score below anywhere people actually live, which is what we want.
 */
export function placeScore(match: { distanceKm: number; population: number }): number {
  return 2 * Math.log10(1 + Math.max(0, match.population)) - Math.log10(1 + Math.max(0, match.distanceKm));
}

/**
 * Search for a place, most likely candidate first.
 *
 * Over-fetches so the ranking has something to work with: the geocoder's own
 * order is global, so the local answer is not always inside the first handful.
 */
export async function searchPlaces(
  query: string,
  near?: { latitude: number; longitude: number },
): Promise<PlaceMatch[]> {
  const name = query.trim();
  // One character matches half the world; 60 is longer than any real place name.
  if (name.length < 2 || name.length > 60) return [];

  try {
    const res = await fetch(
      `${ENDPOINT}?name=${encodeURIComponent(name)}&count=20&language=en&format=json`,
      { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } },
    );
    if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
    const json = (await res.json()) as GeocodeResponse;

    const matches: PlaceMatch[] = (json.results ?? [])
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && r.name)
      .map((r) => {
        const place = {
          place: r.name as string,
          latitude: r.latitude as number,
          longitude: r.longitude as number,
          region: [r.admin1, r.country].filter(Boolean).join(", "),
          population: typeof r.population === "number" ? r.population : 0,
        };
        return { ...place, distanceKm: near ? distanceKm(near, place) : 0 };
      });

    // Without a home location there is nothing to be near, so the geocoder's
    // own ordering stands.
    if (near) matches.sort((a, b) => placeScore(b) - placeScore(a));

    return matches.slice(0, 6);
  } catch (e) {
    reportWarning(e, { code: "weather.geocode", route: "searchPlaces" });
    return [];
  }
}
