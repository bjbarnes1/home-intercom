/**
 * Clamp message overlay dwell to a sensible kiosk range.
 */
export const ANNOUNCE_DWELL_DEFAULT = 30;
export const ANNOUNCE_DWELL_MIN = 5;
export const ANNOUNCE_DWELL_MAX = 120;

export function clampAnnounceDwellSec(value: number): number {
  if (!Number.isFinite(value)) return ANNOUNCE_DWELL_DEFAULT;
  return Math.min(
    ANNOUNCE_DWELL_MAX,
    Math.max(ANNOUNCE_DWELL_MIN, Math.round(value)),
  );
}
