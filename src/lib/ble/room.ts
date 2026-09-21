/**
 * Which room is this person in?
 *
 * BLE radio is noisy. Signal strength swings several dB standing still, walls
 * attenuate unevenly, and a phone in a back pocket reads differently from one
 * on a bench. Taking the strongest beacon at each moment would put the music in
 * a different room every few seconds, and standing in a doorway would flap
 * between two of them indefinitely.
 *
 * So two defences, both here and both pure:
 *
 *   - a median over a short window, which throws away single-sample spikes
 *     without lagging the way a long average does
 *   - hysteresis: the room you are in keeps the benefit of the doubt, and
 *     somewhere else has to be clearly better before it takes over
 *
 * The caller's polling interval is the third: a fix is only acted on when it is
 * still the answer on the next pass.
 */

export interface Sighting {
  /** The room beacon that was heard. */
  beaconId: string;
  /** Signal strength in dBm. Negative; closer to zero is nearer. */
  rssi: number;
  /** When it was heard (epoch ms). */
  at: number;
}

export interface Tuning {
  /** Older sightings say where someone was, not where they are. */
  freshMs: number;
  /** How much better somewhere else must be before the music follows. */
  marginDb: number;
  /** Below this the radio is hearing a wall two rooms away, not a room. */
  floorDb: number;
}

export const DEFAULT_TUNING: Tuning = {
  // Long enough to collect a few samples at a 2–3s advertising interval,
  // short enough that walking out of a room is noticed within one song.
  freshMs: 12_000,
  // Roughly the swing seen standing still, so ordinary noise cannot move the
  // music but walking into the next room does.
  marginDb: 6,
  floorDb: -95,
};

/** The middle value — unmoved by one wild sample, unlike a mean. */
export function median(values: number[]): number {
  if (!values.length) return Number.NEGATIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median strength per beacon, over the fresh, audible sightings only. */
export function strengths(
  sightings: Sighting[],
  now: number,
  tuning: Tuning = DEFAULT_TUNING,
): Map<string, number> {
  const byBeacon = new Map<string, number[]>();

  for (const s of sightings) {
    if (now - s.at > tuning.freshMs) continue;
    if (s.rssi < tuning.floorDb) continue;
    const list = byBeacon.get(s.beaconId);
    if (list) list.push(s.rssi);
    else byBeacon.set(s.beaconId, [s.rssi]);
  }

  const out = new Map<string, number>();
  for (const [beaconId, values] of byBeacon) out.set(beaconId, median(values));
  return out;
}

/**
 * The room to believe in, given where we already thought they were.
 *
 * Returns null when nothing is audible: that is "we do not know", which is not
 * the same as "they left", and callers should treat it as a reason to do
 * nothing rather than a reason to stop the music.
 */
export function resolveRoom(
  sightings: Sighting[],
  current: string | null,
  now: number,
  tuning: Tuning = DEFAULT_TUNING,
): string | null {
  const heard = strengths(sightings, now, tuning);
  if (heard.size === 0) return null;

  let best: string | null = null;
  let bestRssi = Number.NEGATIVE_INFINITY;
  for (const [beaconId, rssi] of heard) {
    if (rssi > bestRssi) {
      best = beaconId;
      bestRssi = rssi;
    }
  }
  if (!best) return null;

  // Nowhere to defend, or already there.
  if (current === null || best === current) return best;

  // The room they are in keeps the benefit of the doubt. If it has gone
  // silent entirely its strength is -Infinity, so anywhere audible wins.
  const currentRssi = heard.get(current) ?? Number.NEGATIVE_INFINITY;
  return bestRssi - currentRssi >= tuning.marginDb ? best : current;
}

/**
 * Should the music follow?
 *
 * Only on a confirmed move to a room we can actually name. Losing the signal
 * is not a move — a phone face-down on a sofa stops being heard, and stopping
 * the music because of that would be the single most annoying thing this
 * feature could do.
 */
export function shouldFollow(previous: string | null, next: string | null): boolean {
  return next !== null && next !== previous;
}
