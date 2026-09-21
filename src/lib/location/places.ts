/**
 * Geofence budgeting.
 *
 * iOS monitors at most 20 regions **per app**, not per person — so five
 * people's worth of home/school/work/sport comes out of one shared allowance.
 * That is why Place is household-wide, and why both the API and the phone say
 * so out loud when the budget is blown: a geofence over the limit doesn't
 * error, it just silently never fires.
 */
export const MAX_MONITORED_REGIONS = 20;

/** Metres per degree of latitude, near enough anywhere on Earth. */
const METRES_PER_DEGREE_LAT = 111_320;

export interface Coordinate {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in metres (haversine). Used to name the place someone
 * is currently at, as a fallback when the phone hasn't reported a region event
 * — e.g. the app was installed while already at home.
 */
export function distanceMetres(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6_371_000;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface PlaceCircle extends Coordinate {
  id: string;
  name: string;
  radiusM: number;
}

/**
 * Which place a fix falls inside, or null. When circles overlap the smallest
 * wins — "Home" inside a broader "Our street" should read as Home.
 */
export function placeContaining(
  fix: Coordinate,
  places: PlaceCircle[],
): PlaceCircle | null {
  const matches = places
    .map((place) => ({ place, distance: distanceMetres(fix, place) }))
    .filter(({ place, distance }) => distance <= place.radiusM);

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.place.radiusM - b.place.radiusM || a.distance - b.distance);
  return matches[0].place;
}

export { METRES_PER_DEGREE_LAT };
